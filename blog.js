import {validatePosts, sortPosts} from './posts.js';
import {node, renderPost} from './render.js';

const list = typeof document === 'undefined' ? null : document.querySelector('#post-list');
if (list) {
  try {
    const response = await fetch('./posts.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('加载失败');
    const posts = sortPosts(validatePosts(await response.json()));
    list.replaceChildren(...posts.map(renderPost));
    document.querySelector('.count').textContent = `${posts.length} 篇`;
    const archive = document.querySelector('#archive-list');
    if (posts.length) {
      archive.replaceChildren(...posts.map(p => {
        const link = node('a', '', `${p.date.replace('T', ' ')} · ${p.title}`); link.href = `#post-${p.id}`;
        link.addEventListener('click', () => { document.getElementById(`post-${p.id}`).open = true; }); return link;
      }));
      const reveal = () => {
        const target = document.getElementById(location.hash.slice(1));
        if (target?.matches('details.post')) { target.open = true; target.scrollIntoView({block: 'start'}); }
      };
      window.addEventListener('hashchange', reveal);
      reveal();
    } else {
      list.append(node('p', 'empty-note', '这里先留白，等待第一篇真正的记录。'));
      archive.replaceChildren(node('p', 'field-note', '等待第一篇记录。'));
    }
  } catch {
    list.replaceChildren(node('p', 'empty-note', '文章暂时未能加载。'));
    const retry = node('button', 'secondary', '重新加载');
    retry.addEventListener('click', () => location.reload()); list.append(retry);
    document.querySelector('#archive-list').replaceChildren(node('p', 'field-note', '文章加载后显示归档。'));
    document.querySelector('.count').textContent = '加载失败';
  } finally { list.setAttribute('aria-busy', 'false'); }
}
