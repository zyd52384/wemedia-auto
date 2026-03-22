import fs from 'fs';
import path from 'path';
import prisma from './db';
import { generateArticle, WriterStyle, SYSTEM_PROMPT, TECH_SYSTEM_PROMPT } from './gemini';
import { generateArticleWithGlm, isGlmConfigured } from './glm';
import { generateArticleWithBailian, isBailianConfigured } from './bailian';
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
    // 支持新旧两种调用方式
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

    // 从数据库加载设置
    const settings = await loadSettings();
    const theme = opts.theme || settings.theme || 'grace';
    const publishMethod = opts.publishMethod || settings.publishMethod || 'browser';
    const wechatAppId = opts.wechatAppId || settings.wechatAppId;
    const wechatAppSecret = opts.wechatAppSecret || settings.wechatAppSecret;
    const author = settings.author || process.env.WECHAT_AUTHOR || '我是小编';
    const chromePath = settings.chromePath || process.env.WECHAT_CHROME_PATH || '';
    const writerStyle: WriterStyle = (opts.writerStyle || settings.writerStyle || 'general') as WriterStyle;

    const articlesDir = path.resolve(process.cwd(), 'articles');

    // ── Step 1: 生成文章 ──────────────────────────────────────────────────────
    // 优先级：阿里百炼 > GLM-5 > Gemini
    progressCb?.({ step: 'generating_article', message: `正在生成文章内容: "${keyword}" (${writerStyle === 'tech' ? '技术风格' : '通用风格'})...` });

    const systemPrompt = writerStyle === 'tech' ? TECH_SYSTEM_PROMPT : SYSTEM_PROMPT;
    let article;

    const bailianReady = await isBailianConfigured();
    const glmReady = await isGlmConfigured();

    if (bailianReady) {
        // 首选：阿里百炼
        console.log('[pipeline] 阿里百炼已配置 — 使用百炼作为主力写作模型');
        progressCb?.({ step: 'generating_article', message: `正在使用阿里百炼（千问）生成文章: "${keyword}"...` });
        try {
            article = await generateArticleWithBailian(keyword, systemPrompt, writerStyle);
        } catch (e) {
            console.warn('[pipeline] 百炼失败，尝试 GLM-5 / Gemini 兜底:', (e as Error).message);
            progressCb?.({ step: 'generating_article', message: '百炼失败，正在尝试备用模型...' });
            if (glmReady) {
                try {
                    article = await generateArticleWithGlm(keyword, systemPrompt, writerStyle);
                } catch (e2) {
                    console.warn('[pipeline] GLM-5 也失败，最终使用 Gemini:', (e2 as Error).message);
                    progressCb?.({ step: 'generating_article', message: 'GLM-5 失败，正在使用 Gemini...' });
                    article = await generateArticle(keyword, writerStyle);
                }
            } else {
                article = await generateArticle(keyword, writerStyle);
            }
        }
    } else if (glmReady) {
        // 次选：GLM-5
        console.log('[pipeline] GLM-5 configured — using GLM-5 as primary writer');
        progressCb?.({ step: 'generating_article', message: `正在使用 GLM-5 生成文章: "${keyword}"...` });
        try {
            article = await generateArticleWithGlm(keyword, systemPrompt, writerStyle);
        } catch (e) {
            console.warn('[pipeline] GLM-5 failed, falling back to Gemini:', (e as Error).message);
            progressCb?.({ step: 'generating_article', message: 'GLM-5失败，正在使用 Gemini...' });
            article = await generateArticle(keyword, writerStyle);
        }
    } else {
        // 兜底：Gemini
        console.log('[pipeline] 使用 Gemini 生成文章');
        article = await generateArticle(keyword, writerStyle);
    }

    const slug = toSlug(article.title) || toSlug(keyword);
    const articleDir = path.join(articlesDir, slug);
    fs.mkdirSync(articleDir, { recursive: true });

    // ── Step 2: 保存本地 Markdown ─────────────────────────────────────────────
    progressCb?.({ step: 'saving_local', message: '正在保存本地 Markdown 文件...' });

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

    // ── Step 3: 人性化处理（可选）────────────────────────────────────────────
    let finalMdPath = mdPath;
    if (humanize) {
        progressCb?.({ step: 'humanizing', message: '正在使用AI去除痕迹 (Phase 1: Humanizer)...' });
        try {
            finalMdPath = await humanizeArticle(articleDir);
        } catch (e) {
            console.warn('[pipeline] Humanizer failed, using original:', e);
            finalMdPath = mdPath;
        }

        progressCb?.({ step: 'humanizing', message: '正在添加人工风格和语气 (Phase 2: De-AI-Flavor)...' });
        try {
            finalMdPath = await deAiFlavorArticle(articleDir, finalMdPath);
        } catch (e) {
            console.warn('[pipeline] De-AI-Flavor failed, using previous result:', e);
        }
    }

    // ── Step 4: 生成封面图片 ──────────────────────────────────────────────────
    console.log('[pipeline] Waiting 10s before cover generation to avoid rate limits...');
    await new Promise(r => setTimeout(r, 10000));
    progressCb?.({ step: 'generating_cover', message: '正在生成封面图片...' });

    let coverPath: string | null = null;
    try {
        coverPath = await generateCover(article.title, article.summary, articleDir);
    } catch (e) {
        console.warn('[pipeline] Cover generation failed:', e);
    }

    // ── Step 5: 转换为 HTML ───────────────────────────────────────────────────
    progressCb?.({ step: 'converting_html', message: `正在转换 HTML 格式 (${theme})...` });

    let htmlPath: string | null = null;
    try {
        htmlPath = await convertToHtml(finalMdPath, theme);
    } catch (e) {
        console.warn('[pipeline] HTML conversion failed:', e);
    }

    if (!htmlPath) {
        console.warn('[pipeline] HTML conversion returned null, generating fallback HTML...');
        const fallbackHtmlPath = finalMdPath.replace(/\.md$/i, '.html');
        const mdRaw = fs.readFileSync(finalMdPath, 'utf-8');
        const body = mdRaw.replace(/^---[\s\S]*?---\n*/, '');
        fs.writeFileSync(fallbackHtmlPath, `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><pre>${body}</pre></body></html>`, 'utf-8');
        htmlPath = fallbackHtmlPath;
    }

    // ── Step 6: 发布到微信 ────────────────────────────────────────────────────
    progressCb?.({ step: 'publishing_wechat', message: '正在发布到微信公众号...' });

    let wechatStatus = 'html_ready';
    try {
        await publishToWeChat({
            htmlPath: htmlPath!,
            coverPath: coverPath || undefined,
            title: article.title,
            author,
            method: publishMethod,
            chromePath,
            appId: wechatAppId,
            appSecret: wechatAppSecret,
        });
        wechatStatus = 'published';
    } catch (e) {
        console.warn('[pipeline] WeChat publish failed:', e);
        wechatStatus = 'publish_failed';
    }

    // ── 保存到数据库 ──────────────────────────────────────────────────────────
    const dbArticle = await prisma.article.create({
        data: {
            keyword,
            slug,
            title: article.title,
            summary: article.summary,
            mdPath: finalMdPath,
            htmlPath: htmlPath || '',
            coverPath: coverPath || '',
            theme,
            status: wechatStatus,
            ...(tid ? { taskId: tid } : {}),
        },
    });

    progressCb?.({ step: 'done', message: '文章生成完成！', articleId: dbArticle.id });
    return dbArticle.id;
}
