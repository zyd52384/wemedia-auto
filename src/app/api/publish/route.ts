import { NextRequest, NextResponse } from 'next/server';
import { runPublishPipeline } from '@/lib/pipeline';
import { loadSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { keyword, useHumanizer = false, writerStyle } = body;

        if (!keyword || typeof keyword !== 'string') {
            return NextResponse.json({ error: '请输入主题关键词' }, { status: 400 });
        }

        // Load settings from database
        const settings = await loadSettings();

        // Run pipeline with settings
        const steps: Array<{ step: string; message: string }> = [];

        const articleId = await runPublishPipeline({
            keyword: keyword.trim(),
            useHumanizer,
            writerStyle: writerStyle || settings.writerStyle,
            theme: settings.theme,
            publishMethod: settings.publishMethod,
            wechatAppId: settings.wechatAppId,
            wechatAppSecret: settings.wechatAppSecret,
            onProgress: (progress) => {
                steps.push({ step: progress.step, message: progress.message });
                console.log(`[publish] ${progress.step}: ${progress.message}`);
            },
        });

        return NextResponse.json({
            success: true,
            articleId,
            steps,
        });
    } catch (error) {
        console.error('[publish] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '发布失败' },
            { status: 500 }
        );
    }
}
