export const OWNER = 'albertyizhan';
export const REPO = 'tgyizhan.github.io';
export const BRANCH = 'main';
export const MAX_BYTES = 700000;
export function validatePosts(posts) {
  if (!Array.isArray(posts)) throw new Error('文章数据格式不正确。');
  const ids = new Set();
  for (const p of posts) {
    if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(p.id) || ids.has(p.id) ||
        typeof p.title !== 'string' || !p.title.trim() || p.title.length > 100 ||
        typeof p.text !== 'string' || p.text.length > 20000 ||
        !validDate(p.date) || !p.text.trim()) throw new Error('文章内容不完整或超出限制。');
    ids.add(p.id);
  }
  return posts;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) return false;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : `${value}:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, value.length) === value;
}
export function sortPosts(posts) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}
export function decodePosts(file) {
  if (file.encoding !== 'base64' || !file.content || !file.sha) throw new Error('文章库无法读取，请确认 posts.json 存在且大小正常。');
  const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
  return validatePosts(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
}
export function encodePosts(posts) {
  const bytes = new TextEncoder().encode(JSON.stringify(validatePosts(posts), null, 2) + '\n');
  if (bytes.length > MAX_BYTES) throw new Error('文章库已达到 700 KB 上限，请先拆分文章存储。');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function mergeDraft(posts, post) {
  validatePosts([post]);
  const existing = posts.find(p => p.id === post.id);
  if (existing && (existing.title !== post.title || existing.text !== post.text)) {
    throw new Error('上一版已发布，但内容与当前草稿不同。请核对已发布文章后再开始新稿。');
  }
  return existing ? null : [post, ...posts];
}
