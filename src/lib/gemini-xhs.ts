import { GoogleGenerativeAI, type RequestOptions } from '@google/generative-ai';
import { loadSettings } from './settings';

const MODEL_FALLBACKS = [
    'gemini-3.1-pro-preview',
    'gemini-3-pro',
    'gemini-2.5-flash',
];

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
        console.log(`[gemini-xhs] Using reverse proxy: ${baseUrl}`);
    }

    return { genAI, requestOptions };
}

export interface GeneratedXhsNote {
    title: string;
    subtitle: string;
    emoji: string;
    content: string; // Should include YAML frontmatter
}

const XHS_SYSTEM_PROMPT = `你是一位顶级的小红书爆款内容创作者。你的任务是根据用户的关键词创作一篇专业的小红书图文笔记 Markdown。

## 创作要求：

### 第 1 步：生成 YAML 头部信息
这会被用于渲染图像卡片的封面，包含以下字段：
- emoji: 1 个封面装饰 Emoji
- title: 封面大标题（吸引眼球，不超过 15 字）
- subtitle: 封面副标题文案（不超过 15 字，作为标题补充或行动号召）

### 第 2 步：起草笔记正文（支持卡片渲染）
请用带有分隔符 \`---\` 的 Markdown 格式输出内容。每一段由 \`---\` 隔开的内容最终会被渲染成一张单独的正文图文卡片。
- 每张卡片内容尽量简短（50-200字左右），不宜过长，保证图片渲染排版效果。
- 采用适合小红书的语气（活泼、干货、亲和力），善用 Emoji 作为子标题点缀。
- 可以使用 Markdown 标题结构（如 \`# 标题\`，\`## 子标题\`）、无序/有序列表、\`> 引用\`（强调核心结论）、甚至代码块来丰富卡片表现形式。
- 共计生成 3～6 张正文卡片为宜。
- 重点内容可以使用加粗。

## 输出格式约束
请直接输出纯文本内容，**不要套外层的 \`\`\`markdown 代码块**！你的输出应当以 \`---\` 开头：

---
emoji: "🔥"
title: "你的爆款大标题"
subtitle: "副标题或者引导点击的话术"
---

# 🚀 卡片一的主标题
> 核心观点或者引言。

这里是一段说明文字或者是场景痛点。可以多用一些换行。

---

# 💡 卡片二的主标题
详细的步骤或者干货内容：
- 第一点
- 第二点
- 第三点

---
（依此生成余下卡片...）`;

export async function generateXhsNote(keyword: string): Promise<GeneratedXhsNote> {
    console.log(`[gemini-xhs] Generating XHS note for keyword: "${keyword}"`);

    const contentRequest = {
        contents: [
            {
                role: 'user' as const,
                parts: [{ text: `${XHS_SYSTEM_PROMPT}\n\n请围绕以下主题生成小红书笔记素材：\n\n${keyword}` }],
            },
        ],
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 8192,
        },
    };

    let lastError: Error | null = null;
    const { genAI, requestOptions } = await getGenAI();

    for (const modelName of MODEL_FALLBACKS) {
        console.log(`[gemini-xhs] Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[gemini-xhs] Attempt ${attempt}/2 with ${modelName}...`);
                const result = await model.generateContent(contentRequest);
                const text = result.response.text();

                if (!text || text.trim().length < 100) {
                    throw new Error('Empty or too short response');
                }

                console.log(`[gemini-xhs] ✅ Response from ${modelName}, length: ${text.length}`);
                return parseXhsResponse(text);
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                console.warn(`[gemini-xhs] ❌ ${modelName} attempt ${attempt} failed: ${lastError.message}`);

                if (lastError.message.includes('API key') || lastError.message.includes('permission')) {
                    break;
                }

                if (attempt < 2) {
                    const waitMs = lastError.message.includes('429') ? 15000 : 5000;
                    await new Promise(r => setTimeout(r, waitMs));
                }
            }
        }
        await new Promise(r => setTimeout(r, 5000));
    }

    throw lastError || new Error('All models failed to generate XHS note');
}

function parseXhsResponse(text: string): GeneratedXhsNote {
    let cleaned = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const fmMatch = cleaned.match(/^(---[\s\S]*?---)\n*/);

    let title = "无标题";
    let subtitle = "无副标题";
    let emoji = "✨";

    if (fmMatch) {
        const fmStr = fmMatch[1];

        const titleMatch = fmStr.match(/^title:\s*"?(.*?)"?$/m);
        if (titleMatch) title = titleMatch[1].trim();

        const subMatch = fmStr.match(/^subtitle:\s*"?(.*?)"?$/m);
        if (subMatch) subtitle = subMatch[1].trim();

        const emojiMatch = fmStr.match(/^emoji:\s*"?(.*?)"?$/m);
        if (emojiMatch) emoji = emojiMatch[1].trim();
    }

    // Ensure the output contains the frontmatter (the xhs script needs it)
    let finalContent = cleaned;
    if (!fmMatch) {
        finalContent = `---
emoji: "✨"
title: "${title.slice(0, 15)}"
subtitle: "${title.slice(0, 15)}"
---

${cleaned}`;
    }

    return {
        title: title.slice(0, 32),
        subtitle: subtitle.slice(0, 32),
        emoji,
        content: finalContent
    };
}
