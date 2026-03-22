import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import prisma from './db';
import { generateXhsNote } from './gemini-xhs';
import { generateXhsNoteWithBailian, isBailianXhsConfigured } from './bailian-xhs';
import { loadSettings } from './settings';

const execAsync = util.promisify(exec);

export type XhsPublishStep =
    | 'generating_note'
    | 'saving_local'
    | 'rendering_images'
    | 'pushing_xhs'
    | 'done'
    | 'failed';

export interface XhsPublishProgress {
    step: XhsPublishStep;
    message: string;
    noteId?: string;
}

export interface XhsPipelineOptions {
    keyword: string;
    theme?: string;
    mode?: string;
    pushToXhs?: boolean;
    onProgress?: (progress: XhsPublishProgress) => void;
}

function toSlug(title: string): string {
    return title
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40)
        .toLowerCase()
        .replace(/-+$/, '') || `xhs-${Date.now()}`;
}

export async function runXhsPipeline(options: XhsPipelineOptions): Promise<string> {
    const { keyword, theme = 'default', mode = 'auto-split', pushToXhs = false, onProgress } = options;

    const settings = await loadSettings();
    const chromePath = settings.chromePath || '';
    const xhsCookie = settings.xhsCookie || '';

    const xhsDir = path.resolve(process.cwd(), 'xhs-notes');
    const skillPath = path.resolve(process.cwd(), '..', '.agents', 'skills', 'xhs-note-creator');

    // ── Step 1: 生成笔记内容（百炼优先，Gemini 兜底）──────────────────────
    onProgress?.({ step: 'generating_note', message: `正在生成小红书笔记内容: "${keyword}"...` });

    let note;
    const bailianReady = await isBailianXhsConfigured();

    if (bailianReady) {
        console.log('[xhs-pipeline] 阿里百炼已配置 — 使用百炼生成小红书笔记');
        onProgress?.({ step: 'generating_note', message: `正在使用阿里百炼（千问）生成小红书笔记: "${keyword}"...` });
        try {
            note = await generateXhsNoteWithBailian(keyword);
        } catch (e) {
            console.warn('[xhs-pipeline] 百炼失败，使用 Gemini 兜底:', (e as Error).message);
            onProgress?.({ step: 'generating_note', message: '百炼失败，正在使用 Gemini...' });
            note = await generateXhsNote(keyword);
        }
    } else {
        console.log('[xhs-pipeline] 使用 Gemini 生成小红书笔记');
        note = await generateXhsNote(keyword);
    }

    const slug = toSlug(note.title) || toSlug(keyword);
    const noteDir = path.join(xhsDir, slug);
    fs.mkdirSync(noteDir, { recursive: true });

    // ── Step 2: 保存 Markdown ──────────────────────────────────────────────
    onProgress?.({ step: 'saving_local', message: '正在保存本地文件...' });
    const mdPath = path.join(noteDir, 'note.md');
    fs.writeFileSync(mdPath, note.content, 'utf-8');

    // ── Step 3: 渲染图片（Python 脚本）────────────────────────────────────
    onProgress?.({ step: 'rendering_images', message: '正在渲染小红书笔记图片...' });

    const pythonScript = path.join(skillPath, 'scripts', 'render_xhs.py');
    const renderCmd = `python "${pythonScript}" "${mdPath}" -o "${noteDir}" -t ${theme} -m ${mode}`;

    let images: string[] = [];
    try {
        console.log(`[xhs-pipeline] Executing: ${renderCmd}`);
        const { stdout, stderr } = await execAsync(renderCmd, {
            cwd: skillPath,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                ...(chromePath ? { CHROME_EXECUTABLE_PATH: chromePath } : {}),
            },
        });
        console.log(`[xhs-pipeline] Render output:\n${stdout}`);
        if (stderr) console.warn(`[xhs-pipeline] Render stderr:\n${stderr}`);

        const files = fs.readdirSync(noteDir);
        let pngFiles = files.filter(f => f.endsWith('.png'));
        pngFiles.sort((a, b) => {
            if (a.includes('cover')) return -1;
            if (b.includes('cover')) return 1;
            return a.localeCompare(b, undefined, { numeric: true });
        });

        images = pngFiles.map(f => path.join(noteDir, f));
        if (images.length === 0) {
            throw new Error('未生成任何图片。');
        }
    } catch (err: any) {
        console.error(`[xhs-pipeline] Render failed:`, err);
        throw new Error(`图片渲染失败: ${err.message}`);
    }

    // ── Step 4: 推送小红书（可选）─────────────────────────────────────────
    let xhsStatus = 'rendered';
    if (pushToXhs) {
        if (!xhsCookie) {
            console.warn('[xhs-pipeline] XHS Cookie not configured, skipping push.');
            onProgress?.({ step: 'pushing_xhs', message: '⚠️ 未配置小红书笔记 Cookie，跳过推送。请在设置中配置 XHS_COOKIE' });
        } else {
            onProgress?.({ step: 'pushing_xhs', message: '正在推送小红书笔记内容...' });
            try {
                const publishScript = path.join(skillPath, 'scripts', 'publish_xhs.py');
                const titleArg = note.title.slice(0, 20).replace(/"/g, '\\"');
                const descArg = note.subtitle.replace(/"/g, '\\"');
                const imageArgs = images.map(img => `"${img}"`).join(' ');
                const publishCmd = `python "${publishScript}" --title "${titleArg}" --desc "${descArg}" --images ${imageArgs}`;

                console.log(`[xhs-pipeline] Publishing: ${publishCmd}`);
                const { stdout: pubOut, stderr: pubErr } = await execAsync(publishCmd, {
                    cwd: skillPath,
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        XHS_COOKIE: xhsCookie,
                    },
                    timeout: 120000,
                });
                console.log(`[xhs-pipeline] Publish output:\n${pubOut}`);
                if (pubErr) console.warn(`[xhs-pipeline] Publish stderr:\n${pubErr}`);
                xhsStatus = 'published';
            } catch (err: any) {
                console.error('[xhs-pipeline] XHS push failed:', err);
                onProgress?.({ step: 'pushing_xhs', message: `推送失败: ${err.message}` });
            }
        }
    }

    // ── 保存到数据库 ──────────────────────────────────────────────────────
    const dbNote = await prisma.xhsNote.create({
        data: {
            keyword,
            slug,
            title: note.title,
            summary: note.subtitle,
            theme,
            mode,
            filePath: mdPath,
            images: JSON.stringify(images),
            status: xhsStatus,
        },
    });

    onProgress?.({ step: 'done', message: '小红书笔记生成完成！', noteId: dbNote.id });
    return dbNote.id;
}
