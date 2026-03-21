import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { loadSettings } from './settings';
import { translateForImagePrompt } from './gemini';

const execAsync = promisify(exec);

/**
 * Generate a cover image for a WeChat article.
 * 
 * Strategy (in order):
 * 1. baoyu-image-gen skill (official Google API, uses GEMINI_API_KEY / GOOGLE_API_KEY)
 * 2. baoyu-danger-gemini-web skill (reverse-engineered Gemini Web API)
 * 3. Fallback: SVG gradient cover
 */
export async function generateCover(
    title: string,
    summary: string,
    outputDir: string
): Promise<string> {
    const coverPath = path.join(outputDir, 'cover.png');

    let englishTitle = 'Visual conceptual art';
    let englishTopic = 'Abstract visualization of the article content';
    try {
        const translated = await translateForImagePrompt(title, summary);
        englishTitle = translated.englishTitle;
        englishTopic = translated.englishTopic;
    } catch (e) {
        console.warn('[cover] Failed to translate inputs to English. Using fallback concepts.', e);
    }

    // Build the prompt based on baoyu-cover-image 5-dimension framework
    const prompt = buildCoverPrompt(title, summary, englishTitle, englishTopic);

    // Save prompt for reference
    const promptDir = path.join(outputDir, 'prompts');
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(path.join(promptDir, 'cover-prompt.md'), prompt, 'utf-8');

    // Strategy 1: baoyu-image-gen (official API) with model fallback
    const imageGenDir = findSkillDir('baoyu-image-gen');
    if (imageGenDir) {
        console.log('[cover] Trying baoyu-image-gen skill...');
        const scriptPath = path.join(imageGenDir, 'scripts', 'main.ts');

        // Load API key from DB settings first, then fall back to .env
        const settings = await loadSettings();
        const apiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
        const baseUrl = settings.geminiBaseUrl || process.env.GEMINI_BASE_URL || '';
        const env = { ...process.env };
        if (apiKey) {
            env.GEMINI_API_KEY = apiKey;
            if (!env.GOOGLE_API_KEY) {
                env.GOOGLE_API_KEY = apiKey;
            }
        }

        // Forward base URL for the reverse proxy
        if (baseUrl) {
            env.GEMINI_BASE_URL = baseUrl;
            if (!env.GOOGLE_BASE_URL) {
                env.GOOGLE_BASE_URL = baseUrl;
            }
        }

        // Add DashScope API Key
        const dashscopeKey = settings.dashscopeKey || process.env.DASHSCOPE_API_KEY || '';
        if (dashscopeKey) {
            env.DASHSCOPE_API_KEY = dashscopeKey;
        }

        // Build list of models to try
        const fallbacks: Array<{ model: string, provider: string }> = [];

        // If Google API key exists, add Google models first
        if (env.GEMINI_API_KEY || env.GOOGLE_API_KEY) {
            fallbacks.push(
                { model: 'gemini-3-pro-image', provider: 'google' },
                { model: 'gemini-3-pro-image-preview', provider: 'google' },
                { model: 'gemini-3-flash-preview', provider: 'google' },
                { model: 'imagen-3.0-generate-002', provider: 'google' }
            );
        }

        // If DashScope API key exists, add Ali model as fallback
        if (env.DASHSCOPE_API_KEY) {
            fallbacks.push(
                { model: 'z-image-turbo', provider: 'dashscope' }
            );
        }

        if (fallbacks.length === 0) {
            console.warn('[cover] No API keys configured for image generation (Google/DashScope).');
        }

        for (const { model, provider } of fallbacks) {
            try {
                console.log(`[cover] Trying provider: ${provider}, model: ${model}`);
                let sizeArgs = '--ar 2.35:1 --quality 2k';
                if (provider === 'dashscope') {
                    // DashScope maximum allowed size is 2048x2048. 2048 / 2.35 = 871
                    sizeArgs = '--size 2048x871';
                }
                const cmd = `npx -y bun "${scriptPath}" --prompt "${escapeShell(prompt)}" --image "${coverPath}" ${sizeArgs} --model ${model} --provider ${provider}`;

                await execAsync(cmd, {
                    cwd: outputDir,
                    timeout: 120000,
                    env,
                });

                if (fs.existsSync(coverPath)) {
                    console.log(`[cover] ✅ Cover generated via baoyu-image-gen (${model})`);
                    return coverPath;
                }
            } catch (e: any) {
                const errMsg = e.message || '';
                const stderr = e.stderr || '';
                console.warn(`[cover] Model ${model} failed:\n${errMsg.substring(0, 200)}...\n${stderr.substring(0, 500)}`);
                const isRateLimit = errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || stderr.includes('429') || stderr.includes('quota');
                if (isRateLimit) {
                    console.warn('[cover] Rate limited. Waiting 15s before trying next model...');
                    await new Promise(r => setTimeout(r, 15000));
                } else {
                    // Brief pause between model attempts to avoid overwhelming the proxy
                    await new Promise(r => setTimeout(r, 5000));
                }
                continue;
            }
        }
        console.warn('[cover] All image models failed');
    }

    // Strategy 2: baoyu-danger-gemini-web (reverse-engineered API)
    const geminiWebDir = findSkillDir('baoyu-danger-gemini-web');
    if (geminiWebDir) {
        try {
            console.log('[cover] Trying baoyu-danger-gemini-web skill...');
            const scriptPath = path.join(geminiWebDir, 'scripts', 'main.ts');

            const cmd = `npx -y bun "${scriptPath}" --prompt "${escapeShell(prompt)}" --image "${coverPath}"`;

            await execAsync(cmd, {
                cwd: outputDir,
                timeout: 120000,
                env: process.env,
            });

            if (fs.existsSync(coverPath)) {
                console.log('[cover] ✅ Cover generated via baoyu-danger-gemini-web');
                return coverPath;
            }
        } catch (e) {
            console.warn('[cover] baoyu-danger-gemini-web failed:', (e as Error).message);
        }
    }

    // Strategy 3: Fallback SVG cover
    console.log('[cover] Using SVG fallback cover');
    const svgCover = generateSvgCover(title);
    // Save as SVG (browsers can display it, WeChat may need PNG conversion)
    const svgPath = path.join(outputDir, 'cover.svg');
    fs.writeFileSync(svgPath, svgCover);
    fs.writeFileSync(coverPath, svgCover); // Also save as cover.png path for consistency
    return svgPath;
}

function findSkillDir(skillName: string): string | null {
    const possiblePaths = [
        // Project-level skills
        path.resolve(process.cwd(), '..', '.agents', 'skills', skillName),
        path.resolve(process.cwd(), '.agents', 'skills', skillName),
        path.resolve(process.cwd(), '..', '.agent', 'skills', skillName),
        path.resolve(process.cwd(), '.agent', 'skills', skillName),
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'SKILL.md'))) {
            console.log(`[cover] Found skill ${skillName} at: ${p}`);
            return p;
        }
    }
    return null;
}

function buildCoverPrompt(title: string, summary: string, englishTitle: string, englishTopic: string): string {
    // Dynamic color palette based on article topic (match on original Chinese text)
    const palette = pickColorPalette(title, summary);

    return `Create a stunning, cinematic photograph.

Visual scene: A highly detailed, purely visual and text-free scene illustrating: ${englishTopic}

Requirements:
- Style: High-end editorial photography, cinematic lighting, shallow depth of field, bokeh background
- Color palette: ${palette.name} — ${palette.description}
- Composition: Cinematic 2.35:1 widescreen, rule of thirds, clean and empty area for future text overlay
- Subject: Focus strictly on the environment and atmosphere, NO human faces, NO words
- Lighting: Golden hour / soft diffused / dramatic rim lighting depending on mood
- Mood: ${palette.mood}
- Typography: ZERO letters, ZERO words, ZERO characters, ZERO text. The image must be completely TEXT-FREE.
- Quality: Ultra high resolution, sharp details, professional color grading`;
}

interface ColorPalette {
    name: string;
    description: string;
    mood: string;
    gradient: [string, string, string]; // for SVG fallback
}

function pickColorPalette(title: string, summary: string): ColorPalette {
    const text = (title + ' ' + summary).toLowerCase();

    const palettes: Array<{ keywords: string[]; palette: ColorPalette }> = [
        {
            keywords: ['ai', '人工智能', '科技', '技术', '编程', '代码', '程序', '算法', '机器', '数字', '互联网', '计算机'],
            palette: {
                name: 'Cyber Blue',
                description: 'deep navy (#0A1628), electric blue (#2563EB), cyan glow (#06B6D4), with subtle purple accent',
                mood: 'Futuristic, cutting-edge, intelligent',
                gradient: ['#0A1628', '#2563EB', '#06B6D4'],
            },
        },
        {
            keywords: ['职场', '工作', '管理', '效率', '商业', '创业', '赚钱', '收入', '财富', '投资', '经济'],
            palette: {
                name: 'Executive Gold',
                description: 'charcoal (#1C1917), warm gold (#D97706), amber (#F59E0B), cream highlights',
                mood: 'Authoritative, premium, prosperous',
                gradient: ['#1C1917', '#D97706', '#F59E0B'],
            },
        },
        {
            keywords: ['健康', '养生', '医疗', '身体', '运动', '饮食', '睡眠', '心理', '情绪', '压力'],
            palette: {
                name: 'Vitality Green',
                description: 'forest (#064E3B), emerald (#059669), mint (#34D399), with warm sunlight tones',
                mood: 'Fresh, rejuvenating, natural',
                gradient: ['#064E3B', '#059669', '#34D399'],
            },
        },
        {
            keywords: ['教育', '学习', '知识', '读书', '思维', '成长', '认知', '能力', '技能', '培训'],
            palette: {
                name: 'Scholar Indigo',
                description: 'deep indigo (#312E81), royal purple (#6366F1), soft violet (#A78BFA), with paper-white accents',
                mood: 'Intellectual, inspiring, enlightening',
                gradient: ['#312E81', '#6366F1', '#A78BFA'],
            },
        },
        {
            keywords: ['生活', '家庭', '幸福', '爱', '婚姻', '育儿', '孩子', '父母', '陪伴', '温暖'],
            palette: {
                name: 'Warm Sunset',
                description: 'deep rose (#9F1239), coral (#FB7185), peach (#FECDD3), golden hour warmth',
                mood: 'Warm, heartfelt, comforting',
                gradient: ['#9F1239', '#FB7185', '#FECDD3'],
            },
        },
        {
            keywords: ['中年', '人生', '岁月', '回忆', '感悟', '哲学', '时间', '选择', '命运'],
            palette: {
                name: 'Twilight Amber',
                description: 'deep teal (#134E4A), warm amber (#B45309), soft copper (#D4A574), twilight blue accents',
                mood: 'Contemplative, wise, serene depth',
                gradient: ['#134E4A', '#B45309', '#D4A574'],
            },
        },
        {
            keywords: ['社交', '沟通', '人脉', '关系', '合作', '团队', '领导'],
            palette: {
                name: 'Social Coral',
                description: 'midnight blue (#1E3A5F), vibrant coral (#FF6B6B), soft peach (#FFE0D6), warm white',
                mood: 'Engaging, dynamic, connected',
                gradient: ['#1E3A5F', '#FF6B6B', '#FFE0D6'],
            },
        },
    ];

    // Match keywords
    for (const { keywords, palette } of palettes) {
        if (keywords.some(kw => text.includes(kw))) {
            return palette;
        }
    }

    // Default palette
    return {
        name: 'Elegant Mist',
        description: 'slate blue (#475569), soft lavender (#C4B5FD), misty rose (#FFE4E6), with platinum highlights',
        mood: 'Elegant, refined, sophisticated',
        gradient: ['#475569', '#C4B5FD', '#FFE4E6'],
    };
}

function generateSvgCover(title: string): string {
    const displayTitle = title.length > 18 ? title.slice(0, 18) + '…' : title;
    const palette = pickColorPalette(title, '');
    const [c1, c2, c3] = palette.gradient;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="511" viewBox="0 0 1200 511">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
      <stop offset="50%" style="stop-color:${c2};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${c3};stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${c2};stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:${c3};stop-opacity:0.3" />
    </linearGradient>
  </defs>
  <rect width="1200" height="511" fill="url(#bg)" />
  <!-- Decorative circles -->
  <circle cx="900" cy="150" r="120" fill="url(#accent)" opacity="0.4" />
  <circle cx="150" cy="400" r="80" fill="url(#accent)" opacity="0.3" />
  <circle cx="1050" cy="420" r="60" fill="${c3}" opacity="0.3" />
  <!-- Title -->
  <text x="600" y="240" text-anchor="middle" font-family="'Noto Sans SC', 'Microsoft YaHei', sans-serif" font-size="42" font-weight="700" fill="#FFFFFF" opacity="0.95">${escapeXml(displayTitle)}</text>
  <!-- Subtitle -->
  <text x="600" y="295" text-anchor="middle" font-family="'Inter', sans-serif" font-size="16" fill="#FFFFFF" opacity="0.6" letter-spacing="2">WeMedia Auto · 微信公众号</text>
  <!-- Bottom line -->
  <rect x="520" y="320" width="160" height="3" rx="1.5" fill="#FFFFFF" opacity="0.4" />
</svg>`;
}

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeShell(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
}
