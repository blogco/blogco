export async function mount(element) {
  const { pipeline } = await import(/* @vite-ignore */ element.dataset.transformersUrl || 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1');
  const summarize = await pipeline('summarization');
  const source = element.querySelector('[data-summary-source]');
  const target = element.querySelector('[data-summary-output]');
  if (source && target) target.textContent = (await summarize(source.textContent))[0].summary_text;
}
