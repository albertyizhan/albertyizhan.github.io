import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {encodePosts, decodePosts} from './posts.js';

// Small DOM adapter for exercising editor events without a browser dependency.
class Element {
  children = []; listeners = {}; value = ''; textContent = ''; hidden = false; disabled = false;
  constructor(tag = 'div') { this.tag = tag; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) { return this.children.find(child => child.className?.split(' ').includes(selector.slice(1))) || this.children.map(child => child.querySelector(selector)).find(Boolean); }
  focus() {}
}
const storage = () => {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
const tick = () => new Promise(resolve => setImmediate(resolve));
let run = 0;
async function setup({local = storage(), session = storage(), request} = {}) {
  const ids = ['status', 'publish', 'login-button', 'token', 'logout', 'access-state', 'draft-state', 'word-count', 'title', 'text', 'preview', 'manage-posts', 'login-form', 'editor-form', 'new-draft'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements['editor-form'].reset = () => { elements.title.value = ''; elements.text.value = ''; };
  globalThis.document = {getElementById: id => elements[id], createElement: tag => new Element(tag), querySelectorAll: () => Object.values(elements)};
  globalThis.window = new Element();
  globalThis.localStorage = local; globalThis.sessionStorage = session;
  globalThis.confirm = () => true;
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  globalThis.fetch = request || (async () => { throw new Error('Unexpected network request'); });
  await import(`./editor.js?test=${++run}`);
  await tick();
  async function event(id, type) {
    await elements[id].listeners[type]({preventDefault() {}}); await tick();
  }
  return {elements, event, local, session};
}
function githubFixture({failFirstWrite = false, denied = false} = {}) {
  let posts = []; let writes = 0;
  return {
    get posts() { return posts; },
    get writes() { return writes; },
    async request(url, options) {
      let data;
      if (url.endsWith('/user')) data = {login: denied ? 'someone-else' : 'albertyizhan'};
      else if (!url.includes('/contents/')) data = {permissions: {push: true}};
      else if (options.method === 'PUT') {
        writes++; posts = decodePosts({...JSON.parse(options.body), encoding: 'base64'});
        if (failFirstWrite && writes === 1) throw new TypeError('Connection lost after commit');
        data = {};
      } else data = {encoding: 'base64', sha: 'sha', content: encodePosts(posts)};
      return {ok: true, json: async () => data};
    },
  };
}

test('写作自动保存并在刷新后恢复；未验证不能发布', async () => {
  const first = await setup();
  first.elements.title.value = '一篇未完成的文字'; first.elements.text.value = '第一段\n第二段';
  await first.event('text', 'input');
  assert.equal(first.elements.publish.disabled, true);
  assert.match(first.elements['draft-state'].textContent, /已保存/);
  assert.equal(first.elements.preview.children[0].tag, 'details');
  const next = await setup({local: first.local});
  assert.equal(next.elements.title.value, '一篇未完成的文字');
  assert.equal(next.elements.text.value, '第一段\n第二段');
  assert.match(next.elements['word-count'].textContent, /7/);
});
test('存储不可用时保留离开提醒', async () => {
  const local = storage(); local.setItem = () => { throw new Error('Storage blocked'); };
  const {elements, event} = await setup({local});
  elements.text.value = '未保存的正文'; await event('text', 'input');
  assert.match(elements['draft-state'].textContent, /尚未保存/);
  let prevented = false;
  window.listeners.beforeunload({preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
});
test('错误账户不保存凭证且不会开放发布', async () => {
  const api = githubFixture({denied: true});
  const {elements, event, session} = await setup({request: api.request});
  elements.token.value = 'test-token'; await event('login-form', 'submit');
  assert.equal(elements.publish.disabled, true);
  assert.equal(session.getItem('liubai-author-token'), null);
  assert.equal(elements.token.value, ''); assert.match(elements.status.textContent, /仅允许/);
});
test('网络中断保留草稿；刷新后重试不重复发布并更新管理列表', async () => {
  const api = githubFixture({failFirstWrite: true});
  const first = await setup({request: api.request});
  first.elements.token.value = 'test-token'; await first.event('login-form', 'submit');
  first.elements.title.value = '重试测试'; first.elements.text.value = '正文'; await first.event('text', 'input');
  await first.event('editor-form', 'submit');
  assert.equal(first.elements.title.value, '重试测试');
  assert.equal(first.elements.title.disabled, false);
  assert.match(first.elements.status.textContent, /草稿仍保留/);
  const next = await setup({request: api.request, local: first.local, session: first.session});
  assert.equal(next.elements.publish.disabled, false);
  await next.event('editor-form', 'submit');
  assert.equal(api.writes, 1); assert.equal(api.posts.length, 1);
  assert.equal(next.elements.title.value, '');
  assert.equal(next.local.getItem('liubai-draft'), null);
  assert.equal(next.elements['manage-posts'].children[0].textContent, '已发布文章 · 1');
  assert.match(next.elements.status.textContent, /已保存到 GitHub/);
  await next.event('logout', 'click');
  assert.equal(next.elements.publish.disabled, true);
  assert.equal(next.elements['manage-posts'].hidden, true);
  assert.equal(next.session.getItem('liubai-author-token'), null);
});
test('单篇删除后列表立即更新', async () => {
  const api = githubFixture();
  const {elements, event} = await setup({request: api.request});
  elements.token.value = 'test-token'; await event('login-form', 'submit');
  elements.title.value = '待删除'; elements.text.value = '正文'; await event('text', 'input');
  await event('editor-form', 'submit');
  const row = elements['manage-posts'].children[1];
  await row.children[1].listeners.click();
  assert.equal(api.posts.length, 0);
  assert.equal(elements['manage-posts'].children[0].textContent, '已发布文章 · 0');
  assert.match(elements.status.textContent, /文章已删除/);
});
