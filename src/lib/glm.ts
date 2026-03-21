import { loadSettings } from './settings';
import { GeneratedArticle } from './gemini';

const DEFAULT_GLM_BASE_URL = 'https://api.edgefn.net/v1';
const GLM_MODEL = 'GLM-5';

/** Build request headers for the GLM API */
async function getGlmConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
    const settings = await loadSettings();
    const apiKey = settings.glmApiKey || process.env.GLM_API_KEY || '';
    if (!apiKey) return null; // GLM not configured
    const baseUrl = settings.glmBaseUrl || process.env.GLM_BASE_URL || DEFAULT_GLM_BASE_URL;
    return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

/** Call GLM-5 chat completions endpoint (OpenAI-compatible) */
async function callGlm(prompt: string, systemPrompt: string, maxTokens = 8192): Promise<string> {
    const config = await getGlmConfig();
    if (!config) {
        throw new Error('GLM API Key 未配置');
    }
    const { apiKey, baseUrl } = config;

    console.log(`[glm] Calling ${GLM_MODEL} at ${baseUrl}...`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GLM_MODEL,
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
        throw new Error(`GLM API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`GLM API error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('GLM returned empty content');
    }

    return content;
}

/** Check whether GLM is configured (API key present) */
export async function isGlmConfigured(): Promise<boolean> {
    const config = await getGlmConfig();
    return config !== null;
}

/**
 * Generate a WeChat article using GLM-5 model.
 * Mirrors the same system prompts and output format used by gemini.ts.
 */
export async function generateArticleWithGlm(
    keyword: string,
    systemPrompt: string,
    writerStyle: 'general' | 'tech' = 'general'
): Promise<GeneratedArticle> {
    const styleName = writerStyle === 'tech' ? '科技技术' : '通用';
    console.log(`[glm] Generating article for: "${keyword}" (style: ${styleName})`);

    const userPrompt = `请围绕以下主题关键词写一篇公众号文章：\n\n${keyword}`;
    const maxTokens = writerStyle === 'tech' ? 12000 : 8192;

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            console.log(`[glm] Attempt ${attempt}/2...`);
            const text = await callGlm(userPrompt, systemPrompt, maxTokens);

            if (!text || text.trim().length < 500) {
                throw new Error(`GLM response too short (${text?.length ?? 0} chars)`);
            }

            console.log(`[glm] ✅ Response received, length: ${text.length}`);
            return parseGlmResponse(text, keyword);
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            console.warn(`[glm] ❌ Attempt ${attempt} failed: ${lastError.message}`);
            if (attempt < 2) {
                const waitMs = lastError.message.includes('429') ? 15000 : 5000;
                console.log(`[glm] Waiting ${waitMs / 1000}s before retry...`);
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
    }

    throw lastError || new Error('GLM failed to generate article');
}

/** Parses the GLM response in the same YAML front matter format as gemini.ts */
function parseGlmResponse(text: string, keyword: string): GeneratedArticle {
    let cleaned = text.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '').trim();

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
        console.warn('[glm] No Front Matter found, falling back to primitive parse');
        const lines = cleaned.split('\n');
        const titleLine = lines.find(l => l.startsWith('#')) || lines[0] || keyword;
        title = titleLine.replace(/^#+\s*/, '').trim().slice(0, 64);
        content = cleaned;
        summary = cleaned.slice(0, 120).replace(/\n/g, ' ');
    }

    if (content.length < 300) {
        throw new Error(`GLM content seems truncated (${content.length} chars)`);
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

    console.log(`[glm] ✅ Article parsed: "${parsed.title}" (${parsed.content.length} chars)`);
    return parsed;
}

/**
 * Translate article title/summary to English using GLM-5 (for image generation prompts).
 * Returns null if GLM is not configured so callers can fall back to Gemini.
 */
export async function translateForImagePromptWithGlm(
    title: string,
    summary: string
): Promise<{ englishTitle: string; englishTopic: string } | null> {
    const config = await getGlmConfig();
    if (!config) return null;

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

    try {
        const text = await callGlm(prompt, 'You are a helpful translator.', 1024);
        const cleaned = text.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.englishTitle && parsed.englishTopic) {
            return parsed;
        }
    } catch (e) {
        console.warn('[glm] Translation failed:', e instanceof Error ? e.message : e);
    }
    return null;
}
