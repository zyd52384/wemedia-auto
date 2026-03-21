import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import prisma from '@/lib/db';
import { loadSettings } from '@/lib/settings';

const execAsync = util.promisify(exec);

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
    const { id } = await params;

    const note = await prisma.xhsNote.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: '图文不存在' }, { status: 404 });

    // Load XHS cookie from settings
    const settings = await loadSettings();
    const xhsCookie = settings.xhsCookie || '';

    if (!xhsCookie) {
        return NextResponse.json(
            { error: '未配置小红书 Cookie，请前往「设置」页面配置 XHS_COOKIE 后再试。' },
            { status: 400 }
        );
    }

    // Parse images list
    let images: string[] = [];
    try { images = JSON.parse(note.images || '[]'); } catch { /* */ }

    if (images.length === 0) {
        return NextResponse.json({ error: '该图文没有已生成的图片，无法发布。' }, { status: 400 });
    }

    // Verify image files exist
    const existingImages = images.filter(p => fs.existsSync(p));
    if (existingImages.length === 0) {
        return NextResponse.json({ error: '图片文件不存在，可能已被删除。' }, { status: 400 });
    }

    const skillPath = path.resolve(process.cwd(), '..', '.agents', 'skills', 'xhs-note-creator');
    const publishScript = path.join(skillPath, 'scripts', 'publish_xhs.py');

    const titleArg = (note.title || '').slice(0, 20).replace(/"/g, '\\"');
    const descArg = (note.summary || '').replace(/"/g, '\\"');
    const imageArgs = existingImages.map(img => `"${img}"`).join(' ');

    const publishCmd = `python "${publishScript}" --title "${titleArg}" --desc "${descArg}" --images ${imageArgs}`;

    try {
        console.log(`[xhs-publish-note] Running: ${publishCmd}`);
        const { stdout, stderr } = await execAsync(publishCmd, {
            cwd: skillPath,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
                XHS_COOKIE: xhsCookie,
            },
            timeout: 120_000,
        });
        console.log(`[xhs-publish-note] stdout:\n${stdout}`);
        if (stderr) console.warn(`[xhs-publish-note] stderr:\n${stderr}`);

        // Update status in database
        await prisma.xhsNote.update({
            where: { id },
            data: { status: 'published' },
        });

        return NextResponse.json({ success: true, message: '已成功推送到小红书草稿箱！' });
    } catch (err: any) {
        console.error('[xhs-publish-note] failed:', err);
        return NextResponse.json(
            { error: `推送失败: ${err.message}` },
            { status: 500 }
        );
    }
}
