import fs from 'fs';
import path from 'path';
import { loadSettings } from './settings';
import { translateForImagePromptWithBailian } from './bailian';

const BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

// 封面图默认尺寸（微信公众号推荐 900x383，小红书 1080x1350）
const DEFAULT_COVER_SIZE = '900x383';

/**
 * 调用阿里百炼图像生成 API（OpenAI images/generations 兼容接口）
 * 支持模型：wanx-v1、wanx-v2、wanx2.5-t2i-turbo 等
 */
async function generateImageWithBailian(
    prompt: string,
    outputDir: string,
    size: string = DEFAULT_COVER_SIZE
): Promise<string | null> {
    const settings = await loadSettings();
    const apiKey = settings.bailianApiKey || process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || '';
    if (!apiKey) {
        console.log('[bailian-cover] API Key 未配置，跳过百炼图片生成');
        return null;
    }

    const imageModel = settings.bailianImageModel || 'wanx-v1';
    console.log(`[bailian-cover] Generating cover with model: ${imageModel}, size: ${size}`);

    const response = await fetch(`${BAILIAN_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: imageModel,
            prompt,
            size,
            n: 1,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`百炼图片生成 API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
        data?: Array<{ url?: string; b64_json?: string }>;
        error?: { message?: string };
    };

    if (data.error) {
        throw new Error(`百炼图片生成 error: ${data.error.message}`);
    }

    const imageData = data.data?.[0];
    if (!imageData) {
        throw new Error('百炼图片生成返回空结果');
    }

    const coverPath = path.join(outputDir, 'cover.jpg');

    if (imageData.b64_json) {
        // base64 直接写入
        fs.writeFileSync(coverPath, Buffer.from(imageData.b64_json, 'base64'));
        console.log(`[bailian-cover] ✅ Cover saved from base64: ${coverPath}`);
        return coverPath;
    }

    if (imageData.url) {
        // 下载图片 URL
        const imgResponse = await fetch(imageData.url);
        if (!imgResponse.ok) {
            throw new Error(`图片下载失败: ${imgResponse.status}`);
        }
        const buffer = Buffer.from(await imgResponse.arrayBuffer());
        fs.writeFileSync(coverPath, buffer);
        console.log(`[bailian-cover] ✅ Cover downloaded from URL: ${coverPath}`);
        return coverPath;
    }

    throw new Error('百炼图片生成：未返回 url 或 b64_json');
}

/**
 * 构建图片生成提示词（中文标题 → 英文视觉描述）
 */
async function buildCoverPrompt(title: string, summary: string): Promise<string> {
    // 优先用百炼翻译，生成英文视觉提示词
    const translated = await translateForImagePromptWithBailian(title, summary).catch(() => null);

    const topic = translated?.englishTopic || title;

    return `Professional article cover image for WeChat public account.
Theme: ${topic}.
Style: Modern, clean, cinematic photography, shallow depth of field, bokeh background.
Composition: Rule of thirds, horizontal landscape orientation, NO text, NO people, NO logos.
Color palette: Rich, vibrant, harmonious tones matching the theme.
Quality: High resolution, photorealistic.`;
}

/**
 * SVG 渐变封面（终极兜底方案）
 */
function generateSvgCover(title: string): string {
    const colors = [
        ['#667eea', '#764ba2'],
        ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#a18cd1', '#fbc2eb'],
        ['#ffecd2', '#fcb69f'],
    ];
    const [c1, c2] = colors[Math.abs(title.length) % colors.length];
    const shortTitle = title.slice(0, 20);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383" viewBox="0 0 900 383">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1}"/>
      <stop offset="100%" style="stop-color:${c2}"/>
    </linearGradient>
  </defs>
  <rect width="900" height="383" fill="url(#bg)" rx="12"/>
  <text x="450" y="200" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="36"
        font-weight="600" fill="rgba(255,255,255,0.95)" text-anchor="middle"
        dominant-baseline="middle">${shortTitle}</text>
</svg>`;
}

/**
 * 主函数：生成文章封面图片
 * 优先级：阿里百炼图片生成 → 外部脚本 → SVG 兜底
 */
export async function generateCover(
    title: string,
    summary: string,
    outputDir: string
): Promise<string | null> {
    fs.mkdirSync(outputDir, { recursive: true });

    // 1. 尝试百炼图片生成
    try {
        const prompt = await buildCoverPrompt(title, summary);
        console.log(`[cover] Trying 阿里百炼图片生成...`);
        const bailianCover = await generateImageWithBailian(prompt, outputDir);
        if (bailianCover) {
            console.log(`[cover] ✅ 百炼封面生成成功: ${bailianCover}`);
            return bailianCover;
        }
    } catch (e) {
        const errMsg = (e as Error).message;
        console.warn(`[cover] 百炼图片生成失败: ${errMsg}`);
        if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
            console.warn('[cover] Rate limited, waiting 15s...');
            await new Promise(r => setTimeout(r, 15000));
        }
    }

    // 2. 尝试外部技能脚本（原有的 baoyu-image-gen 等）
    try {
        const skillCover = await tryExternalSkillCover(title, summary, outputDir);
        if (skillCover) {
            console.log(`[cover] ✅ 外部技能封面生成成功: ${skillCover}`);
            return skillCover;
        }
    } catch (e) {
        console.warn(`[cover] 外部技能封面生成失败:`, (e as Error).message);
    }

    // 3. SVG 兜底
    console.warn('[cover] 所有图片生成方案失败，使用 SVG 渐变封面');
    const svgCover = generateSvgCover(title);
    const svgPath = path.join(outputDir, 'cover.svg');
    fs.writeFileSync(svgPath, svgCover);
    console.log(`[cover] SVG cover saved: ${svgPath}`);
    return svgPath;
}

/**
 * 尝试通过外部技能脚本生成封面（兼容原有的 baoyu-image-gen 等方案）
 */
async function tryExternalSkillCover(
    title: string,
    summary: string,
    outputDir: string
): Promise<string | null> {
    const { exec } = await import('child_process');
    const util = await import('util');
    const execAsync = util.promisify(exec);

    const settings = await loadSettings();
    const apiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
    const baseUrl = settings.geminiBaseUrl || process.env.GEMINI_BASE_URL || '';

    // 查找技能脚本路径
    const possibleSkillDirs = [
        path.resolve(process.cwd(), '..', '.agents', 'skills', 'baoyu-image-gen'),
        path.resolve(process.cwd(), '..', '.baoyu-skills', 'baoyu-xhs-images'),
        path.resolve(process.cwd(), '..', '.codebuddy', 'skills', 'baoyu-image-gen'),
    ];

    for (const skillDir of possibleSkillDirs) {
        const scriptPath = path.join(skillDir, 'scripts', 'main.ts');
        if (!fs.existsSync(scriptPath)) continue;

        const coverPath = path.join(outputDir, 'cover.jpg');
        const prompt = `Professional WeChat article cover: ${title}. ${summary}. No text, no people.`;
        const escPrompt = prompt.replace(/"/g, '\\"');

        const env: Record<string, string> = { ...process.env as Record<string, string> };
        if (apiKey) {
            env.GEMINI_API_KEY = apiKey;
            env.GOOGLE_API_KEY = env.GOOGLE_API_KEY || apiKey;
        }
        if (settings.bailianApiKey) {
            env.DASHSCOPE_API_KEY = settings.bailianApiKey;
        }
        if (baseUrl) env.GEMINI_BASE_URL = baseUrl;

        const cmd = `npx -y bun "${scriptPath}" --prompt "${escPrompt}" --image "${coverPath}" --width 900 --height 383`;

        try {
            await execAsync(cmd, { cwd: outputDir, timeout: 120000, env });
            if (fs.existsSync(coverPath)) return coverPath;
        } catch {
            // 继续尝试下一个技能目录
        }
    }

    return null;
}
