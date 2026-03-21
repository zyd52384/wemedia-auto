# Wemedia-Auto (全自动自媒体矩阵系统)

`wemedia-auto` 是一个专为自媒体创作者打造的全自动内容生产与发布系统。它集成了最前沿的大模型（Gemini 2.5/3, GLM-5）和自动化技术，能够一键生成、润色、排版并发布内容至微信公众号和小红书平台。

---

## 🌟 核心功能

### 1. 多平台内容矩阵
- **微信公众号**: 自动撰写深度文章，支持 Markdown 转 HTML 完美排版，自动生成封面图，并通过 Chrome 自动化技术推送到草稿箱。
- **小红书 (XHS)**: 自动生成爆款文案，通过 Python + Playwright 将文案渲染成精美的图片卡片，支持自动推送到小红书草稿箱。

### 2. 顶级 AI 动力源
- **双模型驱动**: 支持 Google Gemini (最新预热模型) 与 GLM-5 (智谱清言) 双引擎切换，确保内容质量。
- **AI 痕迹擦除 (Humanizer)**: 内置深度“去 AI 味”逻辑，识别并修复过度象征、推销口吻、规律性句式等 AI 典型模式，让文章更有“灵魂”。
- **自动封面生成**: 结合文章主题，利用 Gemini Image 系列模型自动生成匹配的视觉封面。

### 3. 自动化与调度
- **Chrome CDP 自动化**: 无需官方 API，模拟真实用户操作，突破个人/未认证号的发布限制。
- **定时任务**: 内置任务调度系统，不仅能即时发布，还能规划未来的发帖节奏。
- **本地化管理**: 使用 Prisma + SQLite 记录所有生成的文章、图片和发布状态。

---

## 🛠️ 技术栈

- **Frontend/Backend**: [Next.js 16](https://nextjs.org/) (Edge Ready) & [React 19](https://react.dev/)
- **Database**: [Prisma](https://www.prisma.io/) + [LibSQL/SQLite](https://turso.tech/libsql)
- **AI Models**: Google Gemini 2.x/3.x, GLM-5 (OpenAI Compatible)
- **Automation**: Playwright (Python/JS), Chrome DevTools Protocol
- **Styling**: Vanilla CSS + Tailwind-like utilities

---

## 🚀 快速开始

### 1. 环境准备
- **Node.js**: v20.x 或更高
- **Python**: 3.10+ (小红书卡片渲染需要)
- **Chrome**: 建议安装一套独立的 Chrome（或使用项目支持的浏览器路径）

### 2. 安装依赖
```bash
# 安装 Node 依赖
npm install

# 安装 Python 依赖 (用于 XHS 卡片渲染)
# 脚本位于 .agents/skills/xhs-note-creator/scripts/
pip install playwright pillow
playwright install chromium
```

### 3. 初始化数据库
```bash
npx prisma db push
```

### 4. 配置文件 (`.env`)
在根目录创建 `.env` 文件，填入以下必填项：
```env
# 数据库路径
DATABASE_URL="file:./prisma/dev.db"

# AI 密钥
GEMINI_API_KEY=your_gemini_api_key
GLM_API_KEY=your_glm_api_key
GLM_BASE_URL=https://api.edgefn.net/v1 # 或官方 API 地址

# 自动化配置
WECHAT_CHROME_PATH="C:\Path\To\Your\Chrome.exe"
XHS_COOKIE="your_xhs_cookie_here" # 获取方法：登录网页版小红书后通过 F12 复制 Cookie
```

### 5. 启动项目
```bash
npm run dev
```
访问 `http://localhost:3000` 开始创作！

---

## 📝 详细工作流说明

### 微信公众号
1. **内容生成**: 输入关键词，系统调用 Gemini/GLM 生成 Markdown。
2. **深度润色**: 可选启用 "Humanizer"，系统会根据 *Wikipedia: Signs of AI writing* 指南对文章进行多轮重写。
3. **视觉增强**: 自动生成符合主题的封面图片。
4. **发布**: 自动启动 Chrome，登录公众号后台，上传图片，填入内容并保存草稿。

### 小红书
1. **文案创作**: 生成符合小红书语境的笔记内容（标题+正文+话题）。
2. **卡片渲染**: 调用内置 Python 脚本，将 Markdown 渲染为多张 PNG 图片（封面卡片 + 列表卡片）。
3. **推送**: 自动将渲染好的图片和文案同步至小红书草稿箱。

---

## ⚠️ 注意事项

1. **封号风险**: 虽然本系统模拟真实操作，但高频率的自动发布仍可能触发平台反爬虫机制。请合理设置发布间隔。
2. **浏览器环境**: 自动化发布需要 Chrome 处理会话。如果遇到“未登录”错误，请先手动使用配置的 Chrome 登录一次相应平台。
3. **Cookie 时效**: 小红书 Cookie 会过期，若推送失败，请刷新并更新 `.env` 中的 `XHS_COOKIE`。
4. **速率限制**: Gemini 和 GLM API 均有速率限制（RPM/TPM），批量生成时系统会自动处理 10s 的冷却周期。

---

## 📜 许可证

MIT License. 仅供学习交流使用，严禁用于任何形式的非法用途。
