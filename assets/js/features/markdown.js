export async function mount(element) {
  const [{ marked }, hljs, javascript, bash] = await Promise.all([
    import('marked'), import('highlight.js/lib/core'),
    import('highlight.js/lib/languages/javascript'), import('highlight.js/lib/languages/bash'),
  ]);
  hljs.default.registerLanguage('javascript', javascript.default);
  hljs.default.registerLanguage('bash', bash.default);
  marked.use({ renderer: { code({ text, lang }) {
    const language = lang && hljs.default.getLanguage(lang) ? lang : 'plaintext';
    const code = hljs.default.highlight(text, { language }).value;
    return `<pre><code class="hljs language-${language}">${code}</code></pre>`;
  } } });
  const source = element.querySelector('[data-markdown-source]');
  const target = element.querySelector('[data-markdown-output]');
  if (source && target) target.innerHTML = marked.parse(source.textContent);
}
