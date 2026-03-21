import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// All configurable setting keys with defaults
const SETTING_DEFAULTS: Record<string, string> = {
    geminiKey: '',
    geminiBaseUrl: '',
    glmApiKey: '',
    glmBaseUrl: '',
    author: '我是老朱',
    chromePath: 'D:\\Program Files\\GptChrome\\GptBrowser.exe',
    theme: 'grace',
    writerStyle: 'general',
    publishMethod: 'browser',
    wechatAppId: '',
    wechatAppSecret: '',
    dashscopeKey: '',
    xhsCookie: '',
};

export async function GET() {
    try {
        const rows = await prisma.setting.findMany();
        const settings: Record<string, string> = { ...SETTING_DEFAULTS };
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        // Never expose full secret to frontend, just indicate if set
        const maskedSettings = {
            ...settings,
            wechatAppSecret: settings.wechatAppSecret ? '••••••••' : '',
            dashscopeKey: settings.dashscopeKey ? '••••••••' : '',
            glmApiKey: settings.glmApiKey ? '••••••••' : '',
            // For xhsCookie, don't send the actual value to frontend (it's very long)
            // instead send empty string + a flag indicating it's been configured
            xhsCookie: '',
            xhsCookieSet: settings.xhsCookie ? 'true' : 'false',
        };
        return NextResponse.json({ settings: maskedSettings });
    } catch (error) {
        console.error('[settings] GET error:', error);
        return NextResponse.json({ settings: SETTING_DEFAULTS });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { settings } = body as { settings: Record<string, string> };

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: '无效的设置数据' }, { status: 400 });
        }

        // Upsert each setting
        for (const [key, value] of Object.entries(settings)) {
            if (!(key in SETTING_DEFAULTS)) continue;
            if (key === 'wechatAppSecret' && value === '••••••••') continue;
            if (key === 'dashscopeKey' && value === '••••••••') continue;
            if (key === 'glmApiKey' && value === '••••••••') continue;
            if (key === 'xhsCookie' && value === '••••••••') continue;

            await prisma.setting.upsert({
                where: { key },
                update: { value },
                create: { key, value },
            });
        }

        // Sync to EXTEND.md
        syncExtendMd(settings);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[settings] POST error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '保存失败' },
            { status: 500 }
        );
    }
}

/**
 * Sync relevant settings to .baoyu-skills/baoyu-post-to-wechat/EXTEND.md
 * so that the external skill scripts also pick up the config.
 */
function syncExtendMd(settings: Record<string, string>) {
    try {
        // Try project-level first, then workspace root
        const possiblePaths = [
            path.resolve(process.cwd(), '.baoyu-skills', 'baoyu-post-to-wechat', 'EXTEND.md'),
            path.resolve(process.cwd(), '..', '.baoyu-skills', 'baoyu-post-to-wechat', 'EXTEND.md'),
        ];

        let extendPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) { extendPath = p; break; }
        }
        if (!extendPath) {
            // Create at workspace root level
            extendPath = possiblePaths[1];
            fs.mkdirSync(path.dirname(extendPath), { recursive: true });
        }

        const lines: string[] = [];
        lines.push(`default_theme: ${settings.theme || 'grace'}`);
        lines.push(`default_publish_method: ${settings.publishMethod || 'browser'}`);
        lines.push(`default_author: ${settings.author || '我是老朱'}`);
        lines.push(`need_open_comment: 1`);
        lines.push(`only_fans_can_comment: 0`);
        if (settings.chromePath) {
            lines.push(`chrome_profile_path: ${settings.chromePath}`);
        }
        lines.push('');

        fs.writeFileSync(extendPath, lines.join('\n'), 'utf-8');
        console.log(`[settings] EXTEND.md synced to: ${extendPath}`);
    } catch (e) {
        console.warn('[settings] Failed to sync EXTEND.md:', e);
    }
}
