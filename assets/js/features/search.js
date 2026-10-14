export async function mount(element) {
  const Fuse = (await import('fuse.js')).default;
  const response = await fetch(element.dataset.index || '/blogco/index.json');
  if (!response.ok) return;
  const fuse = new Fuse(await response.json(), { keys: ['title', 'summary', 'content'], threshold: 0.35 });
  const input = element.querySelector('input[type="search"]');
  const results = element.querySelector('[data-search-results]');
  if (!input || !results) return;
  input.addEventListener('input', () => {
    results.replaceChildren(...fuse.search(input.value).slice(0, 10).map(({ item }) => {
      const link = document.createElement('a');
      link.href = item.permalink;
      link.textContent = item.title;
      return link;
    }));
  });
}
