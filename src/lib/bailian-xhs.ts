import { loadSettings } from './settings';
import { GeneratedXhsNote } from './gemini-xhs';

const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// 小红书内容生成模型（创意类，推荐 qwen-plus 或 qwen-max）
const XHS_MODEL_FALLBACKS = [
    'qwen-plus',
    'qwen-max',
    'qwen-turbo',
];

const XHS_SYSTEM_PROMPT = `你是一个擅长创作小红书风格内容的专家。你的任务是生成符合小红书平台特点的优质笔记内容。

## 输出要求如下：

### 部分1 内容：使用YAML格式的头部信息
请按照以下格式生成内容，确保包含YAML格式的头部信息：

- emoji: 1个合适的Emoji表情
- title: 笔记标题（不超过15字，要求吸引人）
- subtitle: 笔记副标题（不超过15字，要有吸引力，避免与标题重复）

### 部分2 内容：小红书笔记正文（包含Markdown格式）
请使用Markdown格式编写正文内容，并在开头和结尾使用 \`---\` 分隔符包围YAML头部。正文内容应该：

- 包含具体、实用的信息（50-200字，不要太短）
- 使用生动的语言和表情符号
- 可以包含推荐、使用体验、小贴士等
- 使用Markdown格式（如 # 标题, ## 副标题）增强可读性
- 使用 > 引用块突出重要信息

## 内容创作要点：

- 确保内容具有实用性和吸引力
- 使用3-6个合适的表情符号
- 正文内容要自然流畅

## 示例格式：

---
emoji: "✨"
title: "你的笔记标题"
subtitle: "你的笔记副标题"
---

# 这里是正文标题
> 这里是引用内容，突出重要信息。

正文内容开始...

## 这里是副标题
- 列表项1
- 列表项2
- 列表项3

---

（注意：以上只是示例，请根据实际关键词生成对应内容）
`;

/** 从设置中获取百炼配置 */
async function getBailianConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
    const settings = await loadSettings();
    const apiKey = settings.bailianApiKey || process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
    if (!apiKey) return null;
    return { apiKey, baseUrl: BAILIAN_BASE_URL };
}

/** 调用百炼 Chat API */
async function callBailian(
    prompt: string,
    systemPrompt: string,
    maxTokens = 4096,
    model = 'qwen-plus'
): Promise<string> {
    const config = await getBailianConfig();
    if (!config) throw new Error('阿里百炼 API Key 未配置');
    const { apiKey, baseUrl } = config;

    console.log(`[bailian-xhs] Calling ${model}...`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
            ],
            max_tokens: maxTokens,
            temperature: 0.9,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`百炼 API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) throw new Error(`百炼 API error: ${data.error.message}`);

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('百炼返回内容为空');
    return content;
}

/**
 * 使用阿里百炼生成小红书笔记
 * 接口与 gemini-xhs.ts 中的 generateXhsNote 保持一致
 */
export async function generateXhsNoteWithBailian(keyword: string): Promise<GeneratedXhsNote> {
    console.log(`[bailian-xhs] Generating XHS note for: "${keyword}"`);

    const userPrompt = `${XHS_SYSTEM_PROMPT}\n\n请根据以下关键词创作小红书笔记：\n\n${keyword}`;

    let lastError: Error | null = null;

    for (const model of XHS_MODEL_FALLBACKS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[bailian-xhs] Trying model: ${model}, attempt ${attempt}/2...`);
                const text = await callBailian(userPrompt, XHS_SYSTEM_PROMPT, 4096, model);

                if (!text || text.trim().length < 100) {
                    throw new Error('响应内容过短');
                }

                console.log(`[bailian-xhs] ✅ Response from ${model}, length: ${text.length}`);
                return parseXhsResponse(text);
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                console.warn(`[bailian-xhs] ❌ ${model} attempt ${attempt} failed: ${lastError.message}`);

                if (
                    lastError.message.includes('401') ||
                    lastError.message.includes('Unauthorized') ||
                    lastError.message.includes('API key')
                ) {
                    throw lastError;
                }

                if (attempt < 2) {
                    const waitMs = lastError.message.includes('429') ? 15000 : 5000;
                    await new Promise(r => setTimeout(r, waitMs));
                }
            }
        }
        await new Promise(r => setTimeout(r, 3000));
    }

    throw lastError || new Error('百炼所有模型生成小红书笔记失败');
}

/** 解析百炼返回的小红书笔记内容（与 gemini-xhs.ts 的格式一致） */
function parseXhsResponse(text: string): GeneratedXhsNote {
    let cleaned = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/, '').trim();

    const fmMatch = cleaned.match(/^(---[\s\S]*?---)\n*/);

    let title = '精彩笔记';
    let subtitle = '值得一看';
    let emoji = '✨';

    if (fmMatch) {
        const fmStr = fmMatch[1];

        const titleMatch = fmStr.match(/^title:\s*"?(.*?)"?$/m);
        if (titleMatch) title = titleMatch[1].trim();

        const subMatch = fmStr.match(/^subtitle:\s*"?(.*?)"?$/m);
        if (subMatch) subtitle = subMatch[1].trim();

        const emojiMatch = fmStr.match(/^emoji:\s*"?(.*?)"?$/m);
        if (emojiMatch) emoji = emojiMatch[1].trim();
    }

    let finalContent = cleaned;
    if (!fmMatch) {
        finalContent = `---
emoji: "✨"
title: "${title.slice(0, 15)}"
subtitle: "${subtitle.slice(0, 15)}"
---

${cleaned}`;
    }

    return {
        title: title.slice(0, 32),
        subtitle: subtitle.slice(0, 32),
        emoji,
        content: finalContent,
    };
}

/** 检查百炼是否已配置（供 xhs-pipeline 判断） */
export async function isBailianXhsConfigured(): Promise<boolean> {
    const config = await getBailianConfig();
    return config !== null;
}
