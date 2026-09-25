import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePosts, validDate, sortPosts, decodePosts, encodePosts, mergeDraft} from './posts.js';
import {contentBlocks} from './render.js';
import {githubClient} from './github.js';

const post = {id: 'test-1', date: '2026-09-22T14:35', title: '你好 <script>', text: '正文 🌱'};
const file = posts => ({encoding: 'base64', sha: 'current-sha', content: encodePosts(posts)});
const response = (data, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => data});

test('仓库中的现有文章可读取', async () => {
  validatePosts(JSON.parse(await readFile(new URL('./posts.json', import.meta.url), 'utf8')));
});
test('兼容旧日期与分钟日期，并拒绝不存在的日期', () => {
  for (const date of ['2026-09-22', '2026-09-22T14:35', '2024-02-29', '2000-02-29T00:00']) assert.equal(validDate(date), true, date);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-09-00', '2026-09-22T24:00', '2026-09-22T10:60', '2026-9-2', null, 2026]) assert.equal(validDate(date), false, String(date));
});
test('文章校验拒绝重复、空白、错误类型与超长数据', () => {
  assert.deepEqual(validatePosts([post]), [post]);
  for (const posts of [[post, post], [{...post, text: ' '}], [{...post, title: ''}], [{...post, id: '../bad'}], [{...post, id: 12}], [{...post, title: 'a'.repeat(101)}], [{...post, text: 'a'.repeat(20001)}], {}, [null]]) assert.throws(() => validatePosts(posts));
});
test('按日期倒序排列，不改变存储数据', () => {
  const posts = [{...post, id: 'old', date: '2026-09-22'}, {...post, id: 'new'}];
  assert.deepEqual(sortPosts(posts).map(p => p.id), ['new', 'old']);
  assert.equal(posts[0].id, 'old');
});
test('图床链接、图片说明及多行文字安全解析', () => {
  const blocks = contentBlocks('第一段\n第二行\nhttps://images.example/photo?id=1&size=original\n![天空](https://images.example/a(b).png)\n最后一段');
  assert.deepEqual(blocks.map(b => b.type), ['text', 'image', 'image', 'text']);
  assert.equal(blocks[0].text, '第一段\n第二行');
  assert.equal(blocks[1].src, 'https://images.example/photo?id=1&size=original');
  assert.equal(blocks[2].alt, '天空');
  assert.equal(blocks[2].src, 'https://images.example/a(b).png');
  for (const text of ['javascript:alert(1)', '![x](javascript:alert(1))', 'http://images.example/a.png', 'https://user:pass@images.example/a.png', '<img src=x onerror=alert(1)>', '介绍 https://images.example/a.png', 'https://images.example/a.png 其他文字']) assert.equal(contentBlocks(text)[0].type, 'text');
  assert.equal(contentBlocks(Array(8).fill('https://images.example/a.png').join('\n')).length, 8);
});
test('中文及 emoji 内容可以无损编解码', () => {
  const data = file([post]); data.content = `${data.content.slice(0, 20)}\n${data.content.slice(20)}`;
  assert.deepEqual(decodePosts(data), [post]);
});
test('拒绝不完整的 GitHub 文件响应与超限文章库', () => {
  for (const data of [{}, {...file([]), sha: ''}, {...file([]), encoding: 'none'}, {...file([]), content: 'invalid!'}]) assert.throws(() => decodePosts(data));
  assert.throws(() => encodePosts(Array.from({length: 20}, (_, i) => ({...post, id: `post-${i}`, text: '文'.repeat(20000)}))), /700 KB/);
});
test('重试时日期变化不产生重复文章，内容变化不会静默丢失', () => {
  assert.equal(mergeDraft([post], {...post, date: '2026-09-22T14:36'}), null);
  assert.throws(() => mergeDraft([post], {...post, text: '改变后的正文'}), /上一版已发布/);
  assert.deepEqual(mergeDraft([], post), [post]);
});
test('验证账户和仓库写权限', async () => {
  const replies = [{login: 'AlbertYiZhan'}, {permissions: {push: true}}];
  await githubClient('test-token', async () => response(replies.shift())).verify();
  await assert.rejects(githubClient('test-token', async () => response({login: 'someone'})).verify(), /仅允许/);
  const denied = [{login: 'albertyizhan'}, {permissions: {push: false}}];
  await assert.rejects(githubClient('test-token', async () => response(denied.shift())).verify(), /写入权限/);
});
test('发布携带当前 SHA 与分支，并保留已有文章', async () => {
  const old = {...post, id: 'old', date: '2026-09-20'}; const calls = [];
  const client = githubClient('test-token', async (url, options) => {
    calls.push({url, options}); return response(options.method === 'PUT' ? {} : file([old]));
  });
  assert.deepEqual(await client.publish(post), [post, old]);
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.sha, 'current-sha'); assert.equal(body.branch, 'main');
  assert.deepEqual(decodePosts({...body, encoding: 'base64'}), [post, old]);
  assert.equal(calls[0].options.cache, 'no-store');
});
test('服务端已保存但网络断开时，重试只读取，不重复提交', async () => {
  let stored = []; let writes = 0;
  const client = githubClient('test-token', async (url, options) => {
    if (options.method !== 'PUT') return response(file(stored));
    writes++;
    stored = decodePosts({...JSON.parse(options.body), encoding: 'base64'});
    throw new TypeError('network failed after commit');
  });
  await assert.rejects(client.publish(post), /network/);
  assert.deepEqual(await client.publish({...post, date: '2026-09-22T15:00'}), [post]);
  assert.equal(writes, 1);
});
test('并发冲突不强制覆盖，重试读取新 SHA', async () => {
  let writes = 0; let reads = 0;
  const client = githubClient('test-token', async (url, options) => {
    if (options.method !== 'PUT') { reads++; return response({...file([]), sha: `sha-${reads}`}); }
    writes++;
    if (writes === 1) return response({}, 409);
    assert.equal(JSON.parse(options.body).sha, 'sha-2'); return response({});
  });
  await assert.rejects(client.publish(post), error => error.status === 409);
  assert.deepEqual(await client.publish(post), [post]);
  assert.equal(writes, 2);
});
test('删除只修改指定文章，成功后不追加易失败的读取', async () => {
  const keep = {...post, id: 'keep'}; const calls = [];
  const client = githubClient('test-token', async (url, options) => {
    calls.push(options); return response(options.method === 'PUT' ? {} : file([post, keep]));
  });
  assert.deepEqual(await client.remove(post.id), [keep]);
  assert.equal(calls.length, 2);
  assert.deepEqual(decodePosts({...JSON.parse(calls[1].body), encoding: 'base64'}), [keep]);
});
test('删除结果不确定时可安全重试已删除文章', async () => {
  let writes = 0; let stored = [post];
  const client = githubClient('test-token', async (url, options) => {
    if (options.method !== 'PUT') return response(file(stored));
    writes++; stored = []; throw new TypeError('network failed after delete');
  });
  await assert.rejects(client.remove(post.id));
  assert.deepEqual(await client.remove(post.id), []); assert.equal(writes, 1);
});
test('认证错误带状态码供界面清理会话', async () => {
  await assert.rejects(githubClient('test-token', async () => response({}, 401)).read(), error => error.status === 401);
});
