export function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
// Only a whole line is treated as an image; ordinary prose remains plain text.
export function contentBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const value = line.trim();
    const markdown = value.match(/^!\[([^\]]*)\]\((https:\/\/\S+)\)$/);
    const src = markdown ? markdown[2] : value;
    let url;
    try { url = new URL(src); } catch {}
    if (url?.protocol === 'https:' && !url.username && !url.password && /^https:\/\/\S+$/.test(src)) {
      blocks.push({type: 'image', src: url.href, alt: markdown?.[1] || '文章配图'});
    } else if (blocks.at(-1)?.type === 'text') blocks.at(-1).text += '\n' + line;
    else blocks.push({type: 'text', text: line});
  }
  return blocks;
}
export function renderPost(p) {
  const article = node('details', 'post'); article.id = `post-${p.id}`;
  const summary = node('summary');
  const meta = node('span', 'post-meta');
  const date = node('time', '', p.date.replace('T', ' ').replaceAll('-', '.')); date.dateTime = p.date;
  meta.append(date, node('span', '', '记录'));
  const blocks = contentBlocks(p.text);
  summary.append(meta, node('span', 'post-heading', p.title), node('span', 'post-excerpt', blocks.filter(b => b.type === 'text').map(b => b.text).join(' ').trim().slice(0, 90)), node('span', 'post-bottom read-label', '阅读全文 ↗'));
  const body = node('div', 'post-body');
  for (const block of blocks) {
    if (block.type === 'text') { body.append(node('p', 'plain-text', block.text)); continue; }
    const figure = node('figure', 'article-image');
    const link = node('a'); link.href = block.src; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const img = node('img'); img.src = block.src; img.alt = block.alt; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { link.replaceChildren(node('span', 'image-error', '图片暂时无法加载，点击查看原图 ↗')); });
    link.append(img); figure.append(link);
    if (block.alt !== '文章配图') figure.append(node('figcaption', 'field-note', block.alt));
    body.append(figure);
  }
  article.append(summary, body);
  article.addEventListener('toggle', () => {
    summary.querySelector('.read-label').textContent = article.open ? '收起文章 ↑' : '阅读全文 ↗';
  });
  return article;
}
