// Lớp gọi AI sinh giáo án.
// Thứ tự ưu tiên: mô hình cục bộ (transformers.js) → API (OpenAI/Gemini) → mẫu rule-based.
// Với chế độ "auto": dùng API nếu có key, ngược lại dùng mẫu có sẵn (tải model cục bộ rất nặng).

import { buildLesson as buildKoreanLesson, buildPrompt as koreanPrompt } from './korean.js';
import { buildLesson as buildTypingLesson, buildPrompt as typingPrompt } from './typing.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';
const LOCAL_MODEL = 'onnx-community/Qwen2.5-1.5B-Instruct';
const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-1.5-flash';

export const PROVIDERS = {
  auto: 'Tự động (AI nếu có key → mẫu có sẵn)',
  rule: 'Mẫu có sẵn (offline)',
  local: 'Mô hình cục bộ (transformers.js)',
  api: 'API (OpenAI / Gemini)',
};

function builderFor(mode) {
  return mode === 'typing' ? buildTypingLesson : buildKoreanLesson;
}

function promptFor(mode, config) {
  return mode === 'typing' ? typingPrompt(config) : koreanPrompt(config);
}

export function buildFallbackLesson(config = {}) {
  return builderFor(config.mode || 'korean')(config);
}

// Gộp JSON do AI trả về lên bản mẫu để luôn đủ trường (keyboard rows, tools…).
export function mergeLesson(mode, config, generated = {}) {
  const base = builderFor(mode)(config);
  const merged = { ...base };
  const scalarKeys = ['title', 'subtitle', 'level', 'audience', 'duration', 'sessions', 'skills', 'notes', 'assessment', 'wpmTarget'];
  const arrayKeys = ['objectives', 'materials', 'timeline', 'vocabulary', 'grammar', 'dialogue', 'exercises', 'homework', 'tools', 'tips', 'practiceTexts', 'practice_texts'];
  for (const key of scalarKeys) {
    const value = generated[key];
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  }
  for (const key of arrayKeys) {
    if (Array.isArray(generated[key]) && generated[key].length) {
      merged[key === 'practice_texts' ? 'practiceTexts' : key] = generated[key];
    }
  }
  const layout = generated.keyboardLayout || generated.keyboard_layout;
  if (layout) {
    merged.keyboardLayout = {
      ...base.keyboardLayout,
      ...layout,
      rows: (layout.rows && layout.rows.length) ? layout.rows : base.keyboardLayout?.rows,
      consonants: (layout.consonants && layout.consonants.length) ? layout.consonants : base.keyboardLayout?.consonants,
      vowels: (layout.vowels && layout.vowels.length) ? layout.vowels : base.keyboardLayout?.vowels,
    };
  }
  merged.generatedBy = 'ai';
  return merged;
}

export function parseLessonJson(text) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('AI không trả về JSON hợp lệ.');
  const json = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Không phân tích được JSON do AI trả về.');
  }
}

async function generateWithOpenAI(config, options) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
    body: JSON.stringify({
      model: options.model || OPENAI_MODEL,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Bạn là giáo viên giàu kinh nghiệm. Luôn trả về JSON hợp lệ, không kèm markdown.' },
        { role: 'user', content: promptFor(config.mode, config) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data = await response.json();
  return parseLessonJson(data.choices?.[0]?.message?.content || '');
}

async function generateWithGemini(config, options) {
  const model = options.model || GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptFor(config.mode, config) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
  const data = await response.json();
  return parseLessonJson(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

let localPipelinePromise;

async function loadLocalPipeline(onProgress) {
  localPipelinePromise ??= (async () => {
    onProgress('Đang tải thư viện transformers.js…');
    const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    onProgress('Đang tải mô hình cục bộ (lần đầu có thể mất vài phút)…');
    try {
      return await pipeline('text-generation', LOCAL_MODEL, { dtype: 'q4', device: 'webgpu' });
    } catch {
      return pipeline('text-generation', LOCAL_MODEL, { dtype: 'q4' });
    }
  })();
  return localPipelinePromise;
}

async function generateWithLocalModel(config, options, onProgress) {
  const generator = await loadLocalPipeline(onProgress);
  onProgress('Mô hình đang soạn giáo án…');
  const messages = [
    { role: 'system', content: 'Bạn là giáo viên giàu kinh nghiệm. Chỉ trả về JSON hợp lệ.' },
    { role: 'user', content: promptFor(config.mode, config) },
  ];
  const output = await generator(messages, { max_new_tokens: 2048, temperature: 0.6, do_sample: true });
  const first = Array.isArray(output) ? output[0] : output;
  const generated = first?.generated_text;
  const text = Array.isArray(generated)
    ? (generated.at(-1)?.content || JSON.stringify(generated.at(-1)))
    : (generated || '');
  return parseLessonJson(text);
}

export async function generateLesson(config = {}, options = {}) {
  const mode = config.mode || 'korean';
  const provider = options.provider || 'auto';
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const errors = [];

  const tryApi = provider === 'api' || (provider === 'auto' && options.apiKey);
  const tryLocal = provider === 'local';

  if (tryApi) {
    try {
      onProgress('Đang gọi API AI…');
      const generated = options.apiProvider === 'gemini'
        ? await generateWithGemini(config, options)
        : await generateWithOpenAI(config, options);
      return { lesson: mergeLesson(mode, config, generated), source: 'api', errors };
    } catch (error) {
      errors.push(`API: ${error.message}`);
    }
  }

  if (tryLocal) {
    try {
      const generated = await generateWithLocalModel(config, options, onProgress);
      return { lesson: mergeLesson(mode, config, generated), source: 'local', errors };
    } catch (error) {
      errors.push(`Cục bộ: ${error.message}`);
    }
  }

  onProgress('Đang dựng giáo án từ mẫu có sẵn…');
  return { lesson: buildFallbackLesson(config), source: 'rule', errors };
}

export { LOCAL_MODEL, OPENAI_MODEL, GEMINI_MODEL };
