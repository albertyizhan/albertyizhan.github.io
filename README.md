# 留白 · Albert 的博客

保留留白、米白与浅绿的个人博客，原生 HTML / CSS / JavaScript，无需构建。

## 版本

- v1.1.0：页脚版本号、清空示例文章、作者验证、图文编辑/预览与 GitHub 发布；图片改用外部图床直链。
- v1.0.1：开发阶段方案，未发布，合并至 v1.1.0。
- v1.0.0：初版留白布局与三篇示例文章。

## 本地预览

运行 `python3 -m http.server 8000`，打开 http://localhost:8000。

## 作者发布

1. 将本站文件部署到 `albertyizhan/tgyizhan.github.io` 的 `main` 分支，在 Settings → Pages 选择 Deploy from a branch、main、根目录。
2. 首页底部进入「作者入口」。在 GitHub 创建 fine-grained personal access token，仅选择该仓库，授予 Contents: Read and write，设置有效期。
3. 输入令牌并验证，编辑标题、正文，在正文中插入图床链接，确认预览后发布。文字和图片链接一次提交到 `posts.json`，等待 Pages 部署完成。

令牌仅保存在页面内存，不写入本地存储或仓库；退出/关闭页面会清除。作者页可以被访问，但 GitHub 在服务端强制校验仓库写入权限。前端还检查账户是 `albertyizhan`；此检查不能替代 GitHub 权限，勿给其他账户仓库写权限、不要分享令牌。更换仓库、账户或发布分支时同步修改 `blog.js`。

正文中的 HTTPS 图片直链独占一行时会自动渲染，也支持独占一行的 `![图片说明](https://example.com/photo.jpg)`，图片按插入位置穿插显示。支持带查询参数、无扩展名的直链；其余文字按纯文本显示，不执行 HTML，不支持其他 Markdown 格式。示例：

```text
今天去散步了。

![傍晚的天空](https://example.com/sunset.jpg)

想把这一刻留下来。
```

图片直接从你选的图床加载，不压缩、不上传至 GitHub，没有本站单张图片大小或四张数量限制；点击图片查看原图。图床需支持公开 HTTPS 直链及外链展示；失效或防盗链会显示失败提示和原图链接。请选择长期稳定的图床。

当前单个 JSON 仅保存文字和链接，总上限仍为 700 KB，图片文件体积不计入。此限制确保 Contents API 能完整读取文章库；达到上限需要拆分文章存储，失败时保留草稿。草稿只在当前页面保留，离开有提示；尚无跨设备草稿或已发布文章修改功能。

提交使用文件 SHA 防止并发覆盖；网络失败重试沿用文章 ID，避免重复发布。首次部署必须包含空的 `posts.json`。发布错误不清空输入；没有凭证无法进行真实线上发布测试。

## 检查

`node --test blog.test.mjs`
