import { loadSettings } from './settings';
import { GeneratedArticle } from './gemini';

const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// 文字生成默认模型（支持fallback）
const TEXT_MODEL_FALLBACKS = [
    'qwen-max',
    'qwen-plus',
    'qwen-turbo',
];

/** 从设置加载百炼配置 */
async function getBailianConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
    const settings = await loadSettings();
    const apiKey = settings.bailianApiKey || process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
    if (!apiKey) return null;
    const baseUrl = BAILIAN_BASE_URL;
    return { apiKey, baseUrl };
}

/** 检查百炼是否已配置 */
export async function isBailianConfigured(): Promise<boolean> {
    const config = await getBailianConfig();
    return config !== null;
}

/** 调用百炼 Chat Completions（OpenAI兼容） */
async function callBailian(
    prompt: string,
    systemPrompt: string,
    maxTokens = 8192,
    model = 'qwen-plus'
): Promise<string> {
    const config = await getBailianConfig();
    if (!config) {
        throw new Error('阿里百炼 API Key 未配置');
    }
    const { apiKey, baseUrl } = config;

    console.log(`[bailian] Calling ${model} at ${baseUrl}...`);

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
        const errorText = await response.text().catch(() => '');
        throw new Error(`百炼 API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`百炼 API error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('百炼返回内容为空');
    }

    return content;
}

/**
 * 使用阿里百炼生成微信公众号文章
 * 接口与 glm.ts / gemini.ts 保持一致
 */
export async function generateArticleWithBailian(
    keyword: string,
    systemPrompt: string,
    writerStyle: 'general' | 'tech' = 'general'
): Promise<GeneratedArticle> {
    const styleName = writerStyle === 'tech' ? '技术流风格' : '通用';
    console.log(`[bailian] Generating article for: "${keyword}" (style: ${styleName})`);

    const userPrompt = `请根据以下关键词创作一篇微信公众号文章：\n\n${keyword}`;
    const maxTokens = writerStyle === 'tech' ? 12000 : 8192;

    let lastError: Error | null = null;

    for (const model of TEXT_MODEL_FALLBACKS) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[bailian] Trying model: ${model}, attempt ${attempt}/2...`);
                const text = await callBailian(userPrompt, systemPrompt, maxTokens, model);

                if (!text || text.trim().length < 500) {
                    throw new Error(`百炼响应内容过短 (${text?.length ?? 0} 字符)`);
                }

                console.log(`[bailian] ✅ Response from ${model}, length: ${text.length}`);
                return parseBailianResponse(text, keyword);
            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                console.warn(`[bailian] ↷ ${model} attempt ${attempt} failed: ${lastError.message}`);

                // API Key 错误或权限问题直接终止
                if (
                    lastError.message.includes('401') ||
                    lastError.message.includes('Unauthorized') ||
                    lastError.message.includes('API key')
                ) {
                    throw lastError;
                }

                if (attempt < 2) {
                    const waitMs = lastError.message.includes('429') ? 15000 : 5000;
                    console.log(`[bailian] Waiting ${waitMs / 1000}s before retry...`);
                    await new Promise(r => setTimeout(r, waitMs));
                }
            }
        }
        // 切换模型前稍作等待
        if (TEXT_MODEL_FALLBACKS.indexOf(model) < TEXT_MODEL_FALLBACKS.length - 1) {
            console.log('[bailian] Switching to next model...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    throw lastError || new Error('百炼所有模型均失败');
}

/** 解析百炼响应（与 glm.ts 格式一致，支持 YAML Front Matter） */
function parseBailianResponse(text: string, keyword: string): GeneratedArticle {
    let cleaned = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/, '').trim();

    const fmMatch = cleaned.match(/^(---[\s\S]*?---)\n*/);

    let title = keyword;
    let summary = keyword;
    let titles: string[] = [];
    let content = cleaned;

    if (fmMatch) {
        const fmStr = fmMatch[1];
        content = cleaned.slice(fmMatch[0].length).trim();

        const titleMatch = fmStr.match(/^title:\s*"?(.*?)"?$/m);
        if (titleMatch) title = titleMatch[1].trim();

        const summaryMatch = fmStr.match(/^summary:\s*"?(.*?)"?$/m);
        if (summaryMatch) summary = summaryMatch[1].trim();

        const titlesSectionMatch = fmStr.match(/^titles:([\s\S]*?)(?:^---|^[a-z]+:)/m);
        if (titlesSectionMatch) {
            const listItems = titlesSectionMatch[1].match(/-\s*"?(.*?)"?$/gm);
            if (listItems) {
                titles = listItems.map(item => item.replace(/-\s*"?(.*?)"?$/, '$1').trim()).filter(Boolean);
            }
        }
    } else {
        console.warn('[bailian] 未找到 Front Matter，使用简单解析');
        const lines = cleaned.split('\n');
        const titleLine = lines.find(l => l.startsWith('#')) || lines[0] || keyword;
        title = titleLine.replace(/^#+\s*/, '').trim().slice(0, 64);
        content = cleaned;
        summary = cleaned.slice(0, 120).replace(/\n/g, ' ');
    }

    if (content.length < 300) {
        throw new Error(`百炼内容疑似被截断 (${content.length} 字符)`);
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

    console.log(`[bailian] ✅ Article parsed: "${parsed.title}" (${parsed.content.length} chars)`);
    return parsed;
}

/**
 * 将中文标题/摘要翻译为英文（用于图片生成提示词）
 * 返回 null 表示百炼未配置
 */
export async function translateForImagePromptWithBailian(
    title: string,
    summary: string
): Promise<{ englishTitle: string; englishTopic: string } | null> {
    const config = await getBailianConfig();
    if (!config) return null;

    const prompt = `You are a translator and visual prompt engineer.
Your task is to translate a Chinese article title and summary into pure English.
DO NOT include any Chinese characters in your output. Focus on visual subjects.
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

    try {
        const text = await callBailian(prompt, 'You are a helpful translator.', 1024, 'qwen-turbo');
        const cleanedText = text.replace(/^```json\n?/i, '').replace(/\n?```$/, '').trim();
        const parsed = JSON.parse(cleanedText);
        if (parsed.englishTitle && parsed.englishTopic) {
            return parsed;
        }
    } catch (e) {
        console.warn('[bailian] 翻译失败:', e instanceof Error ? e.message : e);
    }
    return null;
}
