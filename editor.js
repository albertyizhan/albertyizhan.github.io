import {OWNER, REPO, BRANCH, MAX_BYTES, validatePosts, node, renderPost} from './blog.js';
const $ = id => document.getElementById(id);
let token = '', draftId = crypto.randomUUID(), busy = false, dirty = false;
const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}`;
const status = message => { $('status').textContent = message; };
function controls() {
  $('publish').disabled = !token || busy;
  for (const id of ['login-button', 'token', 'logout']) $(id).disabled = busy;
  $('logout').hidden = !token;
}
async function api(url, options = {}) {
  const response = await fetch(url, {...options, headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) {
    if (response.status === 401) { token = ''; controls(); }
    throw new Error(response.status === 409 || response.status === 422 ? '文章库已变化，请再次发布；不会覆盖其他更新。' : `GitHub 请求失败（${response.status}），请检查令牌有效期、仓库权限及网络。`);
  }
  return response.json();
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; token = $('token').value.trim(); $('token').value = ''; busy = true; controls(); $('login-button').disabled = true;
  try {
    const user = await api('https://api.github.com/user');
    if (user.login.toLowerCase() !== OWNER.toLowerCase()) throw new Error('仅允许 Albert 的 GitHub 账户发布。');
    const repo = await api(endpoint);
    if (!repo.permissions?.push) throw new Error('此凭证没有本站仓库的写入权限。');
    $('logout').hidden = false; status('身份已验证，可以发布你的记录。');
  } catch (error) { token = ''; status(error.message); }
  finally { busy = false; controls(); $('login-button').disabled = false; }
});
$('logout').addEventListener('click', () => { token = ''; $('token').value = ''; $('logout').hidden = true; controls(); status('已退出，当前文字仍保留。'); });
function draft() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return {id: draftId, date, title: $('title').value.trim(), text: $('text').value.trim()};
}
function preview() {
  const p = draft(); p.title ||= '未命名的记录';
  const article = renderPost(p); article.open = true; $('preview').replaceChildren(article);
}
for (const id of ['title', 'text']) $(id).addEventListener('input', () => { dirty = true; preview(); });
$('editor-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!token || busy) return;
  const post = draft();
  try { validatePosts([post]); } catch (error) { status(error.message); return; }
  busy = true; controls();
  const fields = [...document.querySelectorAll('input, textarea, button')]; fields.forEach(el => el.disabled = true);
  status('正在保存文章……');
  try {
    // ponytail: one atomic file keeps publishing simple; split articles into files before the text index reaches 700 KB.
    const file = await api(`${endpoint}/contents/posts.json?ref=${encodeURIComponent(BRANCH)}`);
    if (!file.content || file.encoding !== 'base64') throw new Error('文章库无法读取，请确认 posts.json 已部署且大小正常。');
    const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0));
    const posts = validatePosts(JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)));
    const existing = posts.find(p => p.id === post.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(post)) {
      draftId = crypto.randomUUID();
      throw new Error('上一版草稿已经发布。本次修改仍保留；再次点击将作为新文章发布。');
    }
    if (!existing) {
      const encoded = new TextEncoder().encode(JSON.stringify([post, ...posts], null, 2) + '\n');
      if (encoded.length > MAX_BYTES) throw new Error('文章库已达到当前 700 KB 上限。需要拆分文章存储后再发布；图床图片不计入此容量。');
      let binary = ''; for (const byte of encoded) binary += String.fromCharCode(byte);
      await api(`${endpoint}/contents/posts.json`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: `发布文章：${post.title}`, content: btoa(binary), sha: file.sha, branch: BRANCH})});
    }
    $('editor-form').reset(); draftId = crypto.randomUUID(); dirty = false; $('preview').replaceChildren(node('p', 'empty-note', '留一点空白，给下一篇记录。'));
    status('文章已保存到 GitHub。网站部署通常需要几分钟，稍后返回博客查看。');
  } catch (error) { status(`${error.message} 草稿仍保留；若网络中断，可直接重试，系统会避免重复发布。`); }
  finally { fields.forEach(el => el.disabled = false); busy = false; controls(); }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
