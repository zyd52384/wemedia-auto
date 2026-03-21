import { GoogleGenerativeAI, type RequestOptions } from '@google/generative-ai';
import { loadSettings } from './settings';

// Model fallback list: try each model in order
const MODEL_FALLBACKS = [
    'gemini-3.1-pro-preview',
    'gemini-3-pro',
    'gemini-2.5-flash',
];

/**
 * Lazy factory: load API key and base URL from DB settings first, then fall back to .env.
 * This ensures changes from the settings page take effect immediately.
 */
async function getGenAI(): Promise<{ genAI: GoogleGenerativeAI; requestOptions: RequestOptions }> {
    const settings = await loadSettings();
    const apiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
        throw new Error('Gemini API Key 未配置。请在设置页面或 .env 文件中配置 GEMINI_API_KEY。');
    }
    const genAI = new GoogleGenerativeAI(apiKey);

    const requestOptions: RequestOptions = {};
    const baseUrl = settings.geminiBaseUrl || process.env.GEMINI_BASE_URL || '';
    if (baseUrl) {
        requestOptions.baseUrl = baseUrl;
        console.log(`[gemini] Using reverse proxy: ${baseUrl}`);
    }

    return { genAI, requestOptions };
}



export interface GeneratedArticle {
    title: string;
    titles: string[];      // 5 clickbait title options
    content: string;
    summary: string;
}

/**
 * wechat-article-writer skill workflow (4 steps):
 * Step 1: Search context (done via Gemini's knowledge)
 * Step 2: Write article (1000-1500 words, story-style, emotional hooks)
 * Step 3: Generate 5 clickbait titles
 * Step 4: Format optimization (Markdown best practices)
 */
export const SYSTEM_PROMPT = `你是一位顶级的中文自媒体公众号写手，精通爆款文章写作。

## 你的写作流程

### 第一步：分析主题
- 分析用户给出的关键词主题
- 思考该话题最新的热点和读者关注点
- 准备好核心论点和素材

### 第二步：撰写文章
严格要求：
- **字数**：1000-1500 字
- **开头**：故事化、场景化，带情感色彩（兴奋/焦虑/好奇），让人想读下去
- **结构**：效果展示 → 问题描述 → 正文/步骤 → 升华总结
- **风格**：口语化但不失深度，善用加粗强调关键点
- **段落**：每段 3-5 行，重要数据单独成段加粗
- **金句**：每 300 字左右插入一句引人深思的金句，单独成段

### 第三步：生成 5 个爆款标题
每个标题要体现以下特点之一：
- **痛点明确**：直击读者痛处（"还在手动..."、"为什么你总是..."）
- **数字吸引**：具体数字更有说服力（"3分钟"、"5个技巧"、"效率暴涨10倍"）
- **结果导向**：承诺具体收益
- **情绪调动**：惊、神技、秘籍、绝了等词汇
- **悬念设置**：引发好奇心
标题不超过 64 个字符。

### 第四步：排版优化
- 使用 Markdown 格式
- 关键词或重要结论用 **加粗**
- 适当使用 > 引用来突出金句
- 结尾有互动引导（点赞/收藏/留言）

## 输出格式

请严格按照以下格式输出包含 YAML Front matter 的 Markdown 内容（不要外层使用 \`\`\` 包裹）：

---
title: "你推荐的最佳标题"
summary: "120 字以内摘要，概括文章核心观点"
titles:
  - "标题1"
  - "标题2"
  - "标题3"
  - "标题4"
  - "标题5"
---

这里是 Markdown 格式正文（1000-1500 字）...`;

/**
 * WeChat Tech Writer style prompt — for science/tech articles
 * Based on the wechat-tech-writer SKILL.md
 */
export const TECH_SYSTEM_PROMPT = `你是一位资深科技自媒体作者，擅长将复杂的技术概念用通俗易懂的语言解析，让普通读者也能理解前沿科技。你的文章兼具专业深度与阅读趣味性。

## 写作风格

- **口语化但专业**：像朋友聊天一样讲技术，不说教
- **善用类比**：把复杂概念比作日常事物
- **数据说话**：有具体数字、性能对比
- **节奏感**：长短句交替，每 300 字左右一个"呼吸点"
- **加粗关键词**：让读者快速扫描也能抓住重点
- **代码块**：代码前后留白，注明语言类型
- **引用块**：用于突出金句或重要观点

## 文章结构

### 第一步：分析主题
- 确定主题类型：AI 大模型 / 开源工具 / 技术概念 / 科技新闻 / 编程教程
- 确定文章角度：时效性（新闻）/ 深入浅出（科普）/ 客观对比（测评）/ 步骤清晰（教程）

### 第二步：撰写文章
严格要求：
- **字数**：1500-2500 字（技术文章需要更多篇幅深入展开）
- **开头（100-150字）**：场景化引入 / 痛点切入 / 热点事件引入，快速建立读者共鸣
- **第一部分：这是什么？（300字）**：一句话定义 + 生动类比 + 核心特点 3-5 个
- **第二部分：为什么值得关注？（400字）**：解决什么问题 + 优势对比 + 关键数据指标
- **第三部分：怎么用/深入解析（500字）**：使用场景 + 操作步骤/技术原理 + 代码示例
- **第四部分：实际体验/评价（300字）**：优缺点 + 适合人群 + 个人观点
- **结尾（100-150字）**：总结核心价值 + 展望未来 + 互动引导
- **技术术语通俗化**：用日常比喻解释专业概念
- **确保事实准确**：版本号、发布日期、技术参数要准确

### 第三步：生成 5 个科技类爆款标题
风格示例：
- **技术+数字**：「深度体验GPT-5：这6个能力让我彻底被震撼」
- **对比冲击**：「Cursor vs Windsurf：实测3天后，我做出了选择」
- **痛点解决**：「还在手写代码？这款AI编程工具让效率暴涨10倍」
- **揭秘类**：「揭秘 DeepSeek 如何用 150 万训练出碾压 GPT 的模型」
- **趋势预判**：「2025最值得关注的5个AI开源项目，第3个将改变行业」
标题不超过 64 个字符。

### 第四步：排版优化
- 使用 Markdown 格式
- 关键词、技术名词用 **加粗**
- 代码示例用代码块包裹
- 适当使用 > 引用来突出金句或重要数据
- 链接用纯文本格式（如 "官方网站：https://example.com/"）
- 结尾有互动引导（点赞/收藏/留言）

## 输出格式

请严格按照以下格式输出包含 YAML Front matter 的 Markdown 内容（不要外层使用 \`\`\` 包裹）：

---
title: "你推荐的最佳标题"
summary: "120 字以内摘要，概括文章核心技术观点"
titles:
  - "标题1"
  - "标题2"
  - "标题3"
  - "标题4"
  - "标题5"
---

这里是 Markdown 格式正文（1500-2500 字）...`;

export type WriterStyle = 'general' | 'tech';

export async function generateArticle(keyword: string, writerStyle: WriterStyle = 'general'): Promise<GeneratedArticle> {
    const styleName = writerStyle === 'tech' ? '科技技术' : '通用';
    console.log(`[gemini] Generating article for keyword: "${keyword}" (style: ${styleName})`);

    const prompt = writerStyle === 'tech' ? TECH_SYSTEM_PROMPT : SYSTEM_PROMPT;

    const contentRequest = {
        contents: [
            {
                role: 'user' as const,
                parts: [{ text: `${prompt}\n\n请围绕以下主题关键词写一篇公众号文章：\n\n${keyword}` }],
            },
        ],
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: writerStyle === 'tech' ? 16384 : 8192,
        },
    };

    // Try each model with retry
    let lastError: Error | null = null;
    const { genAI, requestOptions } = await getGenAI();
    for (const modelName of MODEL_FALLBACKS) {
        console.log(`[gemini] Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[gemini] Attempt ${attempt}/2 with ${modelName}...`);

                const result = await model.generateContent(contentRequest);

                const text = result.response.text();

                const minLen = 500; // Require a reasonable length
                if (!text || text.trim().length < minLen) {
                    throw new Error(`Empty or too short response (${text?.length || 0} chars, expected at least ${minLen})`);
                }

                console.log(`[gemini] ✅ Response from ${modelName}, length: ${text.length}`);
                return parseArticleResponse(text, keyword);
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                console.warn(`[gemini] ❌ ${modelName} attempt ${attempt} failed: ${lastError.message}`);

                // Don't retry on non-retryable errors
                if (lastError.message.includes('API key') || lastError.message.includes('permission')) {
                    break;
                }

                // Wait before retry — longer for rate limit errors
                if (attempt < 2) {
                    const isRateLimit = lastError.message.includes('429') || lastError.message.includes('Too Many Requests') || lastError.message.includes('RESOURCE_EXHAUSTED');
                    const waitMs = isRateLimit ? 15000 : 5000;
                    console.log(`[gemini] Waiting ${waitMs / 1000}s before retry...`);
                    await new Promise(r => setTimeout(r, waitMs));
                }
            }
        }
        // Pause before trying next model to avoid rapid-fire requests
        console.log(`[gemini] Waiting 10s before falling back to next model...`);
        await new Promise(r => setTimeout(r, 10000));
    }

    throw lastError || new Error('All models failed to generate article');
}

function parseArticleResponse(text: string, keyword: string): GeneratedArticle {
    // Strip possible markdown code block wrappers
    let cleaned = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '').trim();

    // Check for YAML Front matter
    const fmMatch = cleaned.match(/^(---[\s\S]*?---)\n*/);

    let title = keyword;
    let summary = keyword;
    let titles: string[] = [];
    let content = cleaned;

    if (fmMatch) {
        const fmStr = fmMatch[1];
        content = cleaned.slice(fmMatch[0].length).trim();

        // Quick parse for YAML fields without bringing in a heavy YAML dependency
        const titleMatch = fmStr.match(/^title:\s*"?(.*?)"?$/m);
        if (titleMatch) title = titleMatch[1].trim();

        const summaryMatch = fmStr.match(/^summary:\s*"?(.*?)"?$/m);
        if (summaryMatch) summary = summaryMatch[1].trim();

        // Extract titles array
        const titlesSectionMatch = fmStr.match(/^titles:([\s\S]*?)(?:^---|^[a-z]+:)/m);
        if (titlesSectionMatch) {
            const listItems = titlesSectionMatch[1].match(/-\s*"?(.*?)"?$/gm);
            if (listItems) {
                titles = listItems.map(item => item.replace(/-\s*"?(.*?)"?$/, '$1').trim()).filter(Boolean);
            }
        }
    } else {
        // Fallback if no front matter
        console.warn('[gemini] No Front Matter found, falling back to primitive parse');
        const lines = cleaned.split('\n');
        const titleLine = lines.find(l => l.startsWith('#')) || lines[0] || keyword;
        title = titleLine.replace(/^#+\s*/, '').trim().slice(0, 64);
        content = cleaned;
        summary = cleaned.slice(0, 120).replace(/\n/g, ' ');
    }

    // Verify content completeness
    if (content.length < 300) {
        throw new Error(`Content seems truncated (${content.length} chars)`);
    }

    if (!titles.length) {
        titles = [title];
    }

    const parsed: GeneratedArticle = {
        title: title.slice(0, 64),
        titles,
        content,
        summary: summary.slice(0, 120),
    };

    console.log(`[gemini] ✅ Article generated: "${parsed.title}" (${parsed.content.length} chars)`);
    return parsed;
}

/**
 * Translates Chinese article fields into English visual descriptions
 * to prevent Chinese characters from bleeding into image generation models.
 */
export async function translateForImagePrompt(title: string, summary: string): Promise<{ englishTitle: string, englishTopic: string }> {
    console.log('[gemini] Translating article title/summary to English for image prompt...');

    const prompt = `You are a translator and visual prompt engineer.
Your task is to translate a Chinese article title and summary into pure English.
DO NOT include any Chinese characters in your output. You should focus on the visual subjects.
Ensure the resulting englishTopic paints a vivid picture for an image generator.

---
Input Title: ${title}
Input Summary: ${summary}
---

Output MUST strictly be a JSON object (without markdown wrappers):
{
  "englishTitle": "<English translation of title>",
  "englishTopic": "<English visual summary without any Chinese>"
}`;

    const { genAI, requestOptions } = await getGenAI();
    let lastError = null;

    // Fast models are fine for translation
    for (const modelName of ['gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-3-pro']) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
            });

            const text = result.response.text();
            const cleaned = text.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
            const parsed = JSON.parse(cleaned);

            if (parsed.englishTitle && parsed.englishTopic) {
                return parsed;
            }
        } catch (e) {
            lastError = e;
            console.warn(`[gemini] Translation with ${modelName} failed:`, e instanceof Error ? e.message : e);
        }
    }

    // Fallback if all fail
    console.warn('[gemini] Translation failed, returning stripped inputs', lastError);
    return { englishTitle: 'Conceptual illustration', englishTopic: 'Abstract art representing the theme' };
}

