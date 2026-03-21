import fs from 'fs';
import path from 'path';
import prisma from './db';
import { generateArticle, WriterStyle, SYSTEM_PROMPT, TECH_SYSTEM_PROMPT } from './gemini';
import { generateArticleWithGlm, isGlmConfigured } from './glm';
import { humanizeArticle, deAiFlavorArticle } from './humanizer';
import { generateCover } from './cover-generator';
import { convertToHtml, publishToWeChat, PublishMethod } from './wechat-publisher';
import { loadSettings } from './settings';

export type PublishStep =
    | 'generating_article'
    | 'humanizing'
    | 'generating_cover'
    | 'saving_local'
    | 'converting_html'
    | 'publishing_wechat'
    | 'done'
    | 'failed';

export interface PublishProgress {
    step: PublishStep;
    message: string;
    articleId?: string;
}

export interface PipelineOptions {
    keyword: string;
    useHumanizer?: boolean;
    theme?: string;
    writerStyle?: WriterStyle;
    publishMethod?: PublishMethod;
    wechatAppId?: string;
    wechatAppSecret?: string;
    onProgress?: (progress: PublishProgress) => void;
    taskId?: string;
}

function toSlug(title: string): string {
    // Simple slug: take first few meaningful chars, replace spaces with dashes
    return title
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40)
        .toLowerCase()
        .replace(/-+$/, '') || `article-${Date.now()}`;
}

export async function runPublishPipeline(options: PipelineOptions): Promise<string>;
export async function runPublishPipeline(
    keyword: string,
    useHumanizer?: boolean,
    onProgress?: (progress: PublishProgress) => void,
    taskId?: string
): Promise<string>;
export async function runPublishPipeline(
    keywordOrOptions: string | PipelineOptions,
    useHumanizer: boolean = false,
    onProgress?: (progress: PublishProgress) => void,
    taskId?: string
): Promise<string> {
    // Normalize arguments: support both old signature and new options object
    let opts: PipelineOptions;
    if (typeof keywordOrOptions === 'string') {
        opts = {
            keyword: keywordOrOptions,
            useHumanizer,
            onProgress,
            taskId,
        };
    } else {
        opts = keywordOrOptions;
    }

    const {
        keyword,
        useHumanizer: humanize = false,
        onProgress: progressCb,
        taskId: tid,
    } = opts;

    // Load all settings from DB, falling back to .env
    const settings = await loadSettings();
    const theme = opts.theme || settings.theme || 'grace';
    const publishMethod = opts.publishMethod || settings.publishMethod || 'browser';
    const wechatAppId = opts.wechatAppId || settings.wechatAppId;
    const wechatAppSecret = opts.wechatAppSecret || settings.wechatAppSecret;
    const author = settings.author || process.env.WECHAT_AUTHOR || '我是老朱';
    const chromePath = settings.chromePath || process.env.WECHAT_CHROME_PATH || '';
    const writerStyle: WriterStyle = (opts.writerStyle || settings.writerStyle || 'general') as WriterStyle;

    const articlesDir = path.resolve(process.cwd(), 'articles');

    // Step 1: Generate article — try GLM-5 first (if configured), then fall back to Gemini
    progressCb?.({ step: 'generating_article', message: `正在生成公众号文章: "${keyword}" (${writerStyle === 'tech' ? '科技模式' : '通用模式'})...` });

    const systemPrompt = writerStyle === 'tech' ? TECH_SYSTEM_PROMPT : SYSTEM_PROMPT;
    let article;
    const glmReady = await isGlmConfigured();
    if (glmReady) {
        console.log('[pipeline] GLM-5 configured — using GLM-5 as primary writer');
        progressCb?.({ step: 'generating_article', message: `正在用 GLM-5 生成文章: "${keyword}"...` });
        try {
            article = await generateArticleWithGlm(keyword, systemPrompt, writerStyle);
        } catch (e) {
            console.warn('[pipeline] GLM-5 failed, falling back to Gemini:', (e as Error).message);
            progressCb?.({ step: 'generating_article', message: 'GLM-5 失败，回退到 Gemini...' });
            article = await generateArticle(keyword, writerStyle);
        }
    } else {
        console.log('[pipeline] GLM not configured — using Gemini');
        article = await generateArticle(keyword, writerStyle);
    }
    const slug = toSlug(article.title) || toSlug(keyword);
    const articleDir = path.join(articlesDir, slug);
    fs.mkdirSync(articleDir, { recursive: true });

    // Step 2: Save markdown locally
    progressCb?.({ step: 'saving_local', message: '正在保存 Markdown 文件...' });

    const mdPath = path.join(articleDir, 'article.md');
    const titlesYaml = article.titles.map(t => `  - "${t.replace(/"/g, '\\"')}"`).join('\n');
    const mdContent = `---
title: "${article.title.replace(/"/g, '\\"')}"
author: "${author}"
summary: "${article.summary.replace(/"/g, '\\"')}"
keyword: "${keyword}"
date: "${new Date().toISOString()}"
titles:
${titlesYaml}
---

${article.content}`;

    fs.writeFileSync(mdPath, mdContent, 'utf-8');

    // Step 3: Humanize (optional)
    let finalMdPath = mdPath;
    if (humanize) {
        progressCb?.({ step: 'humanizing', message: '正在去除 AI 痕迹 (Phase 1: Humanizer)...' });
        try {
            finalMdPath = await humanizeArticle(articleDir);
        } catch (e) {
            console.warn('[pipeline] Humanizer failed, using original:', e);
            // proceed with original mdPath if Phase 1 fails
            finalMdPath = mdPath;
        }

        progressCb?.({ step: 'humanizing', message: '正在注入排版呼吸感与不可预测性 (Phase 2: De-AI-Flavor)...' });
        try {
            finalMdPath = await deAiFlavorArticle(articleDir, finalMdPath);
        } catch (e) {
            console.warn('[pipeline] De-AI-Flavor failed, using previous result:', e);
        }
    }

    // Step 4: Generate cover image
    // Add cooldown to avoid 429 rate limits when multiple steps hit the same API proxy
    console.log('[pipeline] Waiting 10s before cover generation to avoid rate limits...');
    await new Promise(r => setTimeout(r, 10000));
    progressCb?.({ step: 'generating_cover', message: '正在生成封面图...' });

    let coverPath: string | null = null;
    try {
        coverPath = await generateCover(article.title, article.summary, articleDir);
    } catch (e) {
        console.warn('[pipeline] Cover generation failed:', e);
    }

    // Step 5: Convert to HTML (use theme from settings)
    progressCb?.({ step: 'converting_html', message: `正在转换 HTML 排版 (${theme})...` });

    let htmlPath: string | null = null;
    try {
        htmlPath = await convertToHtml(finalMdPath, theme);
    } catch (e) {
        console.warn('[pipeline] HTML conversion failed:', e);
    }

    // Fallback: if HTML conversion failed, generate basic HTML from markdown
    if (!htmlPath) {
        console.warn('[pipeline] HTML conversion returned null, generating fallback HTML...');
        const fallbackHtmlPath = finalMdPath.replace(/\.md$/i, '.html');
        const mdRaw = fs.readFileSync(finalMdPath, 'utf-8');
        // Strip YAML front matter
        const body = mdRaw.replace(/^---[\s\S]*?---\n*/, '');
        // Basic markdown to HTML: paragraphs, bold, headings
        const htmlBody = body
            .split('\n\n')
            .map(p => {
                p = p.trim();
                if (!p) return '';
                if (p.startsWith('# ')) return `<h1>${p.slice(2)}</h1>`;
                if (p.startsWith('## ')) return `<h2>${p.slice(3)}</h2>`;
                if (p.startsWith('### ')) return `<h3>${p.slice(4)}</h3>`;
                if (p.startsWith('> ')) return `<blockquote><p>${p.slice(2)}</p></blockquote>`;
                // Bold
                p = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return `<p>${p.replace(/\n/g, '<br>')}</p>`;
            })
            .filter(Boolean)
            .join('\n');
        const fallbackHtml = `<section>${htmlBody}</section>`;
        fs.writeFileSync(fallbackHtmlPath, fallbackHtml, 'utf-8');
        htmlPath = fallbackHtmlPath;
        console.log(`[pipeline] Fallback HTML saved: ${fallbackHtmlPath}`);
    }

    // Save to database
    const dbArticle = await prisma.article.create({
        data: {
            keyword,
            slug,
            title: article.title,
            summary: article.summary,
            author,
            filePath: mdPath,
            coverPath: coverPath ?? null,
            humanized: humanize,
            writerStyle,
            status: 'draft',
            taskId: tid ?? null,
        },
    });

    // Step 6: Publish to WeChat
    if (htmlPath) {
        const methodLabel = publishMethod === 'api' ? 'API' : '浏览器';
        progressCb?.({ step: 'publishing_wechat', message: `正在通过${methodLabel}推送到微信公众号...` });

        const result = await publishToWeChat({
            htmlPath,
            title: article.title,
            author,
            summary: article.summary,
            coverPath,
            publishMethod,
            wechatAppId,
            wechatAppSecret,
            chromePath,
        });

        if (result.success) {
            await prisma.article.update({
                where: { id: dbArticle.id },
                data: { status: 'published', publishedAt: new Date() },
            });
        } else {
            await prisma.article.update({
                where: { id: dbArticle.id },
                data: { status: 'failed', errorMsg: result.error },
            });
        }
    }

    progressCb?.({ step: 'done', message: '发布完成！', articleId: dbArticle.id });
    return dbArticle.id;
}
