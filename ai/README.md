# BlogCo AI dependencies

This directory isolates optional Node-side SDKs from the GitHub Pages bundle. Keep provider keys in an untracked `ai/.env` file or a future server secret store; never expose them as `VITE_*` variables.

`@google/genai` is the current Gemini SDK. `@google/generative-ai` remains pinned only for compatibility with older examples. `@xenova/transformers` was intentionally excluded: its legacy dependency tree introduced critical/high audit findings; use `@huggingface/transformers` instead. TensorFlow.js is not included because the selected Transformers.js runtime uses ONNX and no separate TensorFlow feature is currently needed.
