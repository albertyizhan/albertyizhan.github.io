import {OWNER, REPO, BRANCH, decodePosts, encodePosts, mergeDraft} from './posts.js';

export function githubClient(token, request = fetch) {
  const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}`;
  async function api(url, options = {}) {
    const response = await request(url, {
      ...options,
      headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers},
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });
    if (!response.ok) {
      const message = response.status === 409 || response.status === 422
        ? '文章库已变化，请重试；不会覆盖其他更新。'
        : `GitHub 请求失败（${response.status}），请检查令牌、仓库权限及网络。`;
      const error = new Error(message); error.status = response.status; throw error;
    }
    return response.json();
  }
  async function read() {
    const file = await api(`${endpoint}/contents/posts.json?ref=${encodeURIComponent(BRANCH)}`);
    return {posts: decodePosts(file), sha: file.sha};
  }
  async function write(posts, sha, message) {
    await api(`${endpoint}/contents/posts.json`, {
      method: 'PUT', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message, content: encodePosts(posts), sha, branch: BRANCH}),
    });
  }
  return {
    async verify() {
      const user = await api('https://api.github.com/user');
      if (user.login?.toLowerCase() !== OWNER.toLowerCase()) throw new Error('仅允许 Albert 的 GitHub 账户发布。');
      const repo = await api(endpoint);
      if (!repo.permissions?.push) throw new Error('此凭证没有本站仓库的写入权限。');
    },
    read,
    async publish(post) {
      const {posts, sha} = await read();
      const next = mergeDraft(posts, post);
      if (next) await write(next, sha, `发布文章：${post.title}`);
      return next || posts;
    },
    async remove(id) {
      const {posts, sha} = await read();
      const found = posts.find(post => post.id === id);
      if (!found) return posts;
      const next = posts.filter(post => post.id !== id);
      await write(next, sha, `删除文章：${found.title}`);
      return next;
    },
  };
}
