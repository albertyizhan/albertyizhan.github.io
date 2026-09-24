import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = {querySelector: () => null};
const {validatePosts, contentBlocks} = await import('./blog.js');
test('文章校验及安全的图床链接解析', () => {
  const p = {id:'test-1', date:'2026-09-22T14:35', title:'你好 <script>', text:'正文'};
  assert.deepEqual(validatePosts([p]), [p]);
  assert.throws(() => validatePosts([{...p, date:'2026-09-22'}]));
  for (const posts of [[p,p], [{...p,text:''}], [{...p,title:''}], [{...p,id:'../bad'}], {}, [null]]) assert.throws(() => validatePosts(posts));
  const blocks = contentBlocks('第一段\n第二行\nhttps://images.example/photo?id=1&size=original\n![天空](https://images.example/a(b).png)\n最后一段');
  assert.deepEqual(blocks.map(b => b.type), ['text','image','image','text']);
  assert.equal(blocks[0].text,'第一段\n第二行');
  assert.equal(blocks[1].src,'https://images.example/photo?id=1&size=original');
  assert.equal(blocks[2].alt,'天空');
  assert.equal(blocks[2].src,'https://images.example/a(b).png');
  for (const text of ['javascript:alert(1)', '![x](javascript:alert(1))', 'http://images.example/a.png', 'https://user:pass@images.example/a.png', '<img src=x onerror=alert(1)>', '介绍 https://images.example/a.png', 'https://images.example/a.png 其他文字']) assert.equal(contentBlocks(text)[0].type,'text');
  assert.equal(contentBlocks(Array(8).fill('https://images.example/a.png').join('\n')).length,8);
});
