import {validatePosts, sortPosts} from './posts.js';
import {node, renderPost} from './render.js';
import {githubClient} from './github.js';

const $ = id => document.getElementById(id);
const TOKEN_CACHE = 'liubai-author-token';
const DRAFT_CACHE = 'liubai-draft';
let client = null, busy = false, dirty = false;
let draftId = crypto.randomUUID(), draftDate = '', saved = false;
const status = message => { $('status').textContent = message; };
function controls() {
  for (const el of document.querySelectorAll('input, textarea, button')) el.disabled = busy;
  $('publish').disabled = !client || busy;
  $('logout').hidden = !client;
  $('access-state').textContent = client ? '已验证 · Albert' : '尚未验证';
}
function clearToken() { try { sessionStorage.removeItem(TOKEN_CACHE); } catch {} }
function failure(error) {
  if (error.status === 401) {
    client = null; clearToken(); $('manage-posts').hidden = true;
  }
  return error.name === 'TimeoutError' || error.name === 'TypeError'
    ? '网络未能确认结果，请重试。' : error.message;
}
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
function draft() {
  return {id: draftId, date: draftDate || localDate(), title: $('title').value.trim(), text: $('text').value.trim()};
}
function saveDraft() {
  dirty = Boolean($('title').value || $('text').value);
  try {
    if (dirty) localStorage.setItem(DRAFT_CACHE, JSON.stringify({...draft(), title: $('title').value, text: $('text').value}));
    else localStorage.removeItem(DRAFT_CACHE);
    saved = true;
  } catch { saved = false; }
  $('draft-state').textContent = dirty ? (saved ? '草稿已保存到此浏览器' : '草稿尚未保存，请勿关闭页面') : '从一句话开始';
}
function preview() {
  $('word-count').textContent = `${$('text').value.length.toLocaleString()} / 20,000`;
  if (!$('title').value.trim() && !$('text').value.trim()) {
    $('preview').replaceChildren(node('p', 'empty-note', '文字会在这里慢慢成形。')); return;
  }
  const p = draft(); p.title ||= '未命名的记录';
  const article = renderPost(p); article.open = true; $('preview').replaceChildren(article);
}
function renderManage(posts) {
  const manage = $('manage-posts'); manage.hidden = false;
  manage.replaceChildren(node('h2', '', `已发布文章 · ${posts.length}`));
  if (!posts.length) manage.append(node('p', 'field-note', '暂无已发布文章。'));
  for (const post of sortPosts(posts)) {
    const row = node('div', 'manage-post');
    const link = node('a', '', post.title); link.href = `./#post-${post.id}`;
    const info = node('div'); info.append(node('time', 'field-note', post.date.replace('T', ' ')), link);
    const button = node('button', 'delete-post', '删除'); button.type = 'button';
    button.setAttribute('aria-label', `删除文章：${post.title}`);
    button.addEventListener('click', () => deletePost(post));
    row.append(info, button); manage.append(row);
  }
}
async function login(value) {
  if (busy) return;
  busy = true; client = null; clearToken(); $('manage-posts').hidden = true; controls(); status('正在验证身份……');
  try {
    const candidate = githubClient(value); await candidate.verify();
    client = candidate;
    try { sessionStorage.setItem(TOKEN_CACHE, value); } catch {}
    status('身份已验证，可以发布你的记录。');
    try { renderManage((await client.read()).posts); }
    catch (error) { status(`文章列表读取失败：${failure(error)}`); }
  } catch (error) { status(failure(error)); }
  finally { busy = false; controls(); }
}
$('login-form').addEventListener('submit', event => {
  event.preventDefault(); const value = $('token').value.trim(); $('token').value = '';
  if (value) login(value);
});
async function deletePost(post) {
  if (busy || !client || !confirm(`确定删除《${post.title}》吗？此操作会提交到 GitHub。`)) return;
  busy = true; controls(); status('正在删除文章……');
  try {
    renderManage(await client.remove(post.id));
    status('文章已删除，网站将在部署完成后更新。');
  } catch (error) { status(`${failure(error)} 删除结果尚未确认，可安全重试。`); }
  finally { busy = false; controls(); }
}
$('logout').addEventListener('click', () => {
  client = null; clearToken(); $('token').value = ''; $('manage-posts').hidden = true;
  $('manage-posts').replaceChildren(); controls(); status('已退出，草稿仍保留。');
});
for (const id of ['title', 'text']) $(id).addEventListener('input', () => { saveDraft(); preview(); });
$('new-draft').addEventListener('click', () => {
  if (dirty && !confirm('开始新稿会清空当前草稿，确定继续吗？')) return;
  $('editor-form').reset(); draftId = crypto.randomUUID(); draftDate = ''; saveDraft(); preview(); $('title').focus();
});
$('editor-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!client || busy) return;
  draftDate ||= localDate();
  const post = draft();
  try { validatePosts([post]); } catch (error) { status(error.message); return; }
  saveDraft(); busy = true; controls(); status('正在发布文章……');
  try {
    const posts = await client.publish(post);
    $('editor-form').reset(); draftId = crypto.randomUUID(); draftDate = ''; saveDraft(); preview(); renderManage(posts);
    status('文章已保存到 GitHub，网站将在部署完成后更新。');
  } catch (error) { status(`${failure(error)} 草稿仍保留，重试不会重复发布。`); }
  finally { busy = false; controls(); }
});
window.addEventListener('beforeunload', event => {
  if (busy || (dirty && !saved)) { event.preventDefault(); event.returnValue = ''; }
});
try {
  const cached = JSON.parse(localStorage.getItem(DRAFT_CACHE));
  if (cached) {
    validatePosts([{...cached, title: cached.title.trim() || '草稿', text: cached.text.trim() || '草稿'}]);
    draftId = cached.id; draftDate = cached.date; $('title').value = cached.title; $('text').value = cached.text;
    saveDraft(); preview();
  }
} catch { $('draft-state').textContent = '本地草稿无法恢复'; }
controls();
try { const cached = sessionStorage.getItem(TOKEN_CACHE); if (cached) login(cached); } catch {}
