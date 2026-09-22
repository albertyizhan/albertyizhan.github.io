# 留白 · Albert 的博客

适配 GitHub Pages 的轻量中文博客，使用原生 HTML 和 CSS，无需安装依赖或构建。

## 本地预览

在项目目录运行 `python3 -m http.server 8000`，打开 http://localhost:8000。

## 写文章

- 在 `index.html` 中复制一个 `<details class="post">` 区块，修改唯一 ID、日期、分类、标题、摘要和正文。
- 同步修改归档链接、文章数量，并将新文章放在列表最上方。
- 首版的 3 篇文章是示例内容；替换后可删除页面底部的示例提示。
- 博客名称、个人介绍和 GitHub 链接在 `index.html`，配色和排版在 `style.css`。

## 发布

将文件提交到 GitHub 仓库，在 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，选择实际发布分支及 **/ (root)** 后保存。

本站使用相对路径，也适用于带仓库子路径的 GitHub Pages。文章在首页原生展开；没有独立文章页、后台或构建步骤。
