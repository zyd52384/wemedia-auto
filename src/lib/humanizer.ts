import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI, type RequestOptions } from '@google/generative-ai';
import { loadSettings } from './settings';

// ─── Gemini helpers ───────────────────────────────────────────────────────────

async function getHumanizerAI() {
    const settings = await loadSettings();
    const apiKey = settings.geminiKey || process.env.GEMINI_API_KEY || '';
    const genAI = new GoogleGenerativeAI(apiKey);
    const requestOptions: RequestOptions = {};
    const baseUrl = settings.geminiBaseUrl || process.env.GEMINI_BASE_URL || '';
    if (baseUrl) {
        requestOptions.baseUrl = baseUrl;
    }
    return { genAI, requestOptions };
}

const MODEL_FALLBACKS = [
    'gemini-3.1-pro-preview',
    'gemini-3-pro',
    'gemini-2.5-flash',
];

// ─── GLM-5 helpers ────────────────────────────────────────────────────────────

const DEFAULT_GLM_BASE_URL = 'https://api.edgefn.net/v1';
const GLM_MODEL = 'GLM-5';

async function getGlmConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
    const settings = await loadSettings();
    const apiKey = settings.glmApiKey || process.env.GLM_API_KEY || '';
    if (!apiKey) return null;
    const baseUrl = (settings.glmBaseUrl || process.env.GLM_BASE_URL || DEFAULT_GLM_BASE_URL).replace(/\/$/, '');
    return { apiKey, baseUrl };
}

async function callGlmRaw(
    systemPrompt: string,
    userPrompt: string,
    temperature = 0.8,
    maxTokens = 16384,
): Promise<string> {
    const config = await getGlmConfig();
    if (!config) throw new Error('GLM not configured');

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: GLM_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: maxTokens,
            temperature,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`GLM API ${response.status}: ${errText}`);
    }

    const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
    };
    if (data.error) throw new Error(`GLM error: ${data.error.message}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('GLM returned empty content');
    return content;
}

// ─── Unified LLM caller: GLM-5 first → Gemini fallback ───────────────────────

/**
 * Try GLM-5 first; if it fails or is not configured, fall back to Gemini.
 * Returns the cleaned text response.
 */
async function callLlm(opts: {
    tag: string;
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
    minRatio?: number;  // minimum acceptable output/input length ratio
    contentLen: number; // character length of input body (for ratio check)
}): Promise<string> {
    const { tag, systemPrompt, userPrompt, temperature, maxTokens, minRatio = 0.4, contentLen } = opts;

    const clean = (t: string) => t.replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```$/i, '').trim();

    // ── Try GLM-5 first ──────────────────────────────────────────────────────
    const glmConfig = await getGlmConfig();
    if (glmConfig) {
        console.log(`[${tag}] GLM-5 configured — trying GLM-5 first`);
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[${tag}][glm] Attempt ${attempt}/2...`);
                const text = clean(await callGlmRaw(systemPrompt, userPrompt, temperature, maxTokens));
                const ratio = text.length / contentLen;
                if (ratio >= minRatio) {
                    console.log(`[${tag}][glm] ✅ OK (${(ratio * 100).toFixed(0)}% of original)`);
                    return text;
                }
                console.warn(`[${tag}][glm] ⚠️ Output too short (${(ratio * 100).toFixed(0)}%). ${attempt < 2 ? 'Retrying...' : 'Falling back to Gemini.'}`);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[${tag}][glm] Attempt ${attempt} error: ${msg}`);
                const isRateLimit = msg.includes('429') || msg.includes('Too Many Requests');
                if (isRateLimit && attempt < 2) {
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }
                break; // fall through to Gemini
            }
        }
        console.warn(`[${tag}][glm] Falling back to Gemini...`);
    } else {
        console.log(`[${tag}] GLM not configured — using Gemini directly`);
    }

    // ── Gemini fallback ──────────────────────────────────────────────────────
    const { genAI, requestOptions } = await getHumanizerAI();
    for (const modelName of MODEL_FALLBACKS) {
        console.log(`[${tag}][gemini] Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName }, requestOptions);

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[${tag}][gemini] Attempt ${attempt}/2 with ${modelName}...`);
                const result = await model.generateContent({
                    contents: [{ role: 'user' as const, parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                    generationConfig: { temperature, maxOutputTokens: maxTokens },
                });
                const text = clean(result.response.text());
                const ratio = text.length / contentLen;
                if (ratio >= minRatio) {
                    console.log(`[${tag}][gemini] ✅ OK (${(ratio * 100).toFixed(0)}% of original) via ${modelName}`);
                    return text;
                }
                console.warn(`[${tag}][gemini] ⚠️ Output too short (${(ratio * 100).toFixed(0)}%). ${attempt < 2 ? 'Retrying...' : ''}`);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                console.warn(`[${tag}][gemini] Error attempt ${attempt} (${modelName}): ${msg}`);
                const isRateLimit = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
                if (isRateLimit && attempt < 2) {
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }
                break; // try next model
            }
        }
    }

    throw new Error(`[${tag}] All models failed`);
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

/**
 * humanizer-cn skill prompt — based on SKILL.md's 22 AI writing patterns
 */
const HUMANIZER_PROMPT = `你是一个文字编辑，专门识别和消除中文文本中的 AI 生成痕迹，让文章读起来更自然、更有人味。

## 你的任务

对输入的文章，执行以下操作：

1. **识别 AI 模式** — 扫描以下 22 种模式
2. **重写问题段落** — 用自然的表达替换 AI 腔
3. **保留核心意思** — 不改变原文的核心观点和信息
4. **保留 Markdown 格式** — 保持原文的标题、加粗、引用等格式
5. **注入灵魂** — 不只是删掉坏模式，还要加入真实的个性

## 需要识别和修改的 AI 模式

### 内容模式
1. **过度强调意义**：删掉"彰显、见证了、标志着、里程碑、开创先河"等宏大词汇
2. **过度强调知名度**：删掉"广受关注、引发热议、备受瞩目"等空话
3. **动词堆砌假深度**：删掉"致力于、旨在、聚焦于、着眼于"等虚词
4. **广告式推销**：删掉"匠心独运、精心打造、重新定义"等广告语
5. **模糊归因**：删掉"业内人士指出、专家表示"等万金油说法
6. **套路化展望**：删掉"未来可期、任重道远、砥砺前行"等套话

### 语言模式
7. **高频 AI 词汇**：减少"此外、值得注意的是、综上所述、毋庸置疑"的使用
8. **回避简单动词**：把"作为……而存在、扮演着……的角色"改成直接的"是"
9. **否定式并列**：减少"不仅……更是……"结构
10. **三段式堆砌**：不要强行把东西分成三组
11. **同义词过度轮换**：同一个东西不要用三个词指代
12. **假范围表达**：减少"从……到……"制造的虚假覆盖感

### 风格模式
13. **破折号滥用**：过多的破折号（——）替换为逗号或句号
14. **加粗滥用**：去掉机械式的关键词加粗
15. **列表项加粗标题**：把"**标题**：内容"改成自然的叙述
16. **标题夸大**：简化【重磅】全面解读式标题

### 交流模式
17. **聊天痕迹**：删掉"希望对您有所帮助"等交互用语
18. **知识截止声明**：删掉"截至目前"等免责声明
19. **讨好式语气**：弱化"这是一个非常棒的问题！"等讨好语

### 填充模式
20. **填充短语**：把"为了能够实现这一目标"改成"为了"等
21. **过度对冲**：把"在某种程度上或许可以认为"改成直接说
22. **泛泛正面结尾**：删掉"让我们共同期待更加辉煌的明天"

## 灵魂注入

- 节奏要变化：短句有力，长句收尾
- 承认复杂性：允许矛盾感受
- 该说"我"就说"我"
- 具体描述，不要笼统

## 输出要求

- 直接输出修改后的文章正文（Markdown 格式）
- 不要输出任何解释、修改说明或前后对比
- 不要包含 YAML front matter（---开头的元数据）
- 保持原文的段落结构和 Markdown 格式`;

const DE_AI_FLAVOR_PROMPT = `你是"去可预测性编辑"，不是润色器。
目标：让文章更像真人写的——有呼吸、有毛边、有情绪起伏、读者第一段猜不到后面怎么走。

## 硬边界（必须遵守）

1. 不改变文章核心观点与事实，不新增"编造的数据/经历/案例"。
2. 不写"大家好/希望对你有帮助/总之/总结一下"等模板开头结尾。
3. 不输出"首先/其次/然后/最后"这种路标词。
4. 目标不是更工整，而是更不可预测、更像真人。

## 工作流程（按顺序执行）

### Step 1：可预测性诊断（只做简短结论）
快速判断哪里最 AI（标点、结构、句式、密度、情绪）。

### Step 2：结构破坏（核心）
- 改成"聊天式推进"：
  - 允许中途岔开一段看似无关的观察/小经历/具体场景，然后一句话收回主线
  - 允许半路自我打断再回到主题
- 让读者读完第一段**不能**准确预判后文结构与分段方式。

### Step 3：标点去模板化
- 句号数量减少至少 30%（能不断句就不断句，按语气走）
- 引号仅用于：引用原话 / 反讽。其余一律去掉或改写强调方式
- 破折号尽量不用（最多每 500 字 1 次）

### Step 4：句式去重（硬约束）
全文中以下骨架"同类最多 2 次"，超过必须改结构：
- 不是A，而是B
- 与其说X，不如说Y
- 真正的Z，从来都是…

### Step 5：信息密度压缩
逐段检查：如果删掉该段，文章仍然通顺且信息不损失 → 删除或合并。
目标：每段都带来"新信息/新判断/新场景/新细节"。

### Step 6：节奏重排（呼吸感）
- 至少插入 2 个短句（≤10 字），独立成行
- 至少插入 1 个长句（自然逗号串联，像情绪上头一口气说完）
- 段落尽量碎：每段 1–3 句为主
- 关键判断可以独立成行（必要时加粗）

### Step 7：情绪曲线重构（必须出现起伏）
文章需要依次出现（可多次循环，但至少一轮）：
1) 共鸣（承认读者感受）
2) 刺痛（直怼）
3) 拉回（指出真正问题不在表面）
4) 笃定停住（结尾停在判断上，像说完就走）

### Step 8：作者在场（去上帝视角）
把"很多人/行业趋势/市场变化"改成：
- 具体场景 + 可验证细节
- "我在写作/运营/测试里观察到的现象"
注意：如果原文没有个人经历，不要硬编；可以用"我在改这篇稿时发现"这种真实在场方式。

## 输出格式（必须严格遵守）

请必须完整输出包含正文和检查清单的两部分：

### A. 重写后的全文
（这里直接给最终可发布版本的全文字数，务必包含完整文章）

### B. 自检清单
（这里列出你作出的改动）`;


// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply humanizer-cn skill to remove AI writing traces.
 * Tries GLM-5 first, falls back to Gemini if unavailable or failed.
 * Reads article.md, processes it, saves as article-humanized.md.
 */
export async function humanizeArticle(articleDir: string): Promise<string> {
    const inputPath = path.join(articleDir, 'article.md');
    const outputPath = path.join(articleDir, 'article-humanized.md');

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Article not found: ${inputPath}`);
    }

    const rawContent = fs.readFileSync(inputPath, 'utf-8');

    // Separate YAML front matter from content
    let frontMatter = '';
    let articleBody = rawContent;
    const fmMatch = rawContent.match(/^(---[\s\S]*?---)\n*/);
    if (fmMatch) {
        frontMatter = fmMatch[1] + '\n\n';
        articleBody = rawContent.slice(fmMatch[0].length);
    }

    console.log(`[humanizer] Processing article (${articleBody.length} chars) — GLM-5 priority...`);

    let humanized: string;
    try {
        humanized = await callLlm({
            tag: 'humanizer',
            systemPrompt: HUMANIZER_PROMPT,
            userPrompt: `以下是需要去AI化的文章：\n\n${articleBody}`,
            temperature: 0.8,
            maxTokens: 16384,
            minRatio: 0.6,
            contentLen: articleBody.length,
        });
    } catch (e) {
        console.warn('[humanizer] All models failed, using original article.', e);
        humanized = articleBody;
    }

    const finalContent = frontMatter + humanized;
    fs.writeFileSync(outputPath, finalContent, 'utf-8');
    return outputPath;
}

/**
 * Apply de-ai-flavor skill to make writing less predictable and more human-like.
 * Tries GLM-5 first, falls back to Gemini if unavailable or failed.
 */
export async function deAiFlavorArticle(articleDir: string, inputPathOverride?: string): Promise<string> {
    const inputPath = inputPathOverride || path.join(articleDir, 'article.md');
    const outputPath = path.join(articleDir, 'article-de-ai.md');

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Article not found: ${inputPath}`);
    }

    const rawContent = fs.readFileSync(inputPath, 'utf-8');

    // Separate YAML front matter from content
    let frontMatter = '';
    let articleBody = rawContent;
    const fmMatch = rawContent.match(/^(---[\s\S]*?---)\n*/);
    if (fmMatch) {
        frontMatter = fmMatch[1] + '\n\n';
        articleBody = rawContent.slice(fmMatch[0].length);
    }

    console.log(`[de-ai-flavor] Processing article (${articleBody.length} chars) — GLM-5 priority...`);

    let rawOutput: string;
    try {
        rawOutput = await callLlm({
            tag: 'de-ai-flavor',
            systemPrompt: DE_AI_FLAVOR_PROMPT,
            userPrompt: `以下是需要处理的文章稿件：\n\n${articleBody}`,
            temperature: 0.9,
            maxTokens: 16384,
            minRatio: 0.4,
            contentLen: articleBody.length,
        });
    } catch (e) {
        console.warn('[de-ai-flavor] All models failed, using original article.', e);
        rawOutput = articleBody;
    }

    // Extract Part A from the structured output (### A. 重写后的全文)
    let deAiFlavored = rawOutput;
    const aMatch = rawOutput.match(/### A\.\s*重写后的全文[\s\S]*?(?=(?:### B\.\s*自检清单|$))/i);
    if (aMatch) {
        deAiFlavored = aMatch[0].replace(/### A\.\s*重写后的全文.*\n?/i, '').trim();
    } else {
        console.warn('[de-ai-flavor] Could not find Part A heading, using whole output.');
    }

    const finalContent = frontMatter + deAiFlavored;
    fs.writeFileSync(outputPath, finalContent, 'utf-8');
    return outputPath;
}
