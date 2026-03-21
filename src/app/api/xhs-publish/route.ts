import { NextRequest, NextResponse } from 'next/server';
import { runXhsPipeline } from '@/lib/xhs-pipeline';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { keyword, theme = 'default', mode = 'auto-split', pushToXhs = false } = body;

        if (!keyword || typeof keyword !== 'string') {
            return NextResponse.json({ error: '请输入主题关键词' }, { status: 400 });
        }

        const steps: Array<{ step: string; message: string }> = [];

        const noteId = await runXhsPipeline({
            keyword: keyword.trim(),
            theme,
            mode,
            pushToXhs,
            onProgress: (progress) => {
                steps.push({ step: progress.step, message: progress.message });
                console.log(`[xhs-publish] ${progress.step}: ${progress.message}`);
            },
        });

        return NextResponse.json({
            success: true,
            noteId,
            steps,
        });
    } catch (error) {
        console.error('[xhs-publish] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '发布失败' },
            { status: 500 }
        );
    }
}
