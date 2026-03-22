import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

// 所有合法的设置字段及其默认值（未知字段会被忽略）
const SETTING_DEFAULTS: Record<string, string> = {
    geminiKey: '',
    geminiBaseUrl: '',
    glmApiKey: '',
    glmBaseUrl: '',
    // 阿里百炼
    bailianApiKey: '',
    bailianTextModel: 'qwen-plus',
    bailianImageModel: 'wanx-v1',
    author: '作者未设置',
    chromePath: 'D:\\Program Files\\GptChrome\\GptBrowser.exe',
    theme: 'grace',
    writerStyle: 'general',
    publishMethod: 'browser',
    wechatAppId: '',
    wechatAppSecret: '',
    dashscopeKey: '',
    xhsCookie: '',
};

// 需要掩码展示的敏感字段（不将真实值返回前端）
const SENSITIVE_KEYS = new Set([
    'wechatAppSecret',
    'dashscopeKey',
    'glmApiKey',
    'bailianApiKey',
    'xhsCookie',
]);

// 需要防止误覆盖的掩码值
const MASK = '••••••••';

/** 将关键配置同步写入 EXTEND.md（供外部脚本读取） */
async function syncExtendMd(settings: Record<string, string>) {
    try {
        const extendPath = path.resolve(process.cwd(), 'EXTEND.md');
        const lines = [
            `# 自动生成的扩展配置 — ${new Date().toISOString()}`,
            '',
            `theme: ${settings.theme || 'grace'}`,
            `publishMethod: ${settings.publishMethod || 'browser'}`,
            `author: ${settings.author || '未设置'}`,
            `chromePath: ${settings.chromePath || ''}`,
        ];
        fs.writeFileSync(extendPath, lines.join('\n'), 'utf-8');
    } catch {
        // 非致命，忽略
    }
}

export async function GET() {
    try {
        const rows = await prisma.setting.findMany();
        const raw: Record<string, string> = {};
        for (const row of rows) {
            raw[row.key] = row.value;
        }

        // 构建返回对象，敏感字段掩码
        const result: Record<string, string> = {};
        for (const key of Object.keys(SETTING_DEFAULTS)) {
            const val = raw[key] || '';
            if (SENSITIVE_KEYS.has(key) && val) {
                result[key] = MASK;
                // 额外返回一个 "<key>Set" = 'true' 标记，前端可以据此显示"已配置"提示
                result[`${key}Set`] = 'true';
            } else {
                result[key] = val;
            }
        }

        // xhsCookie 单独处理（textarea 需要特殊标记）
        result['xhsCookieSet'] = raw['xhsCookie'] ? 'true' : 'false';
        result['xhsCookie'] = '';  // 始终不返回 cookie 明文

        return NextResponse.json({ settings: result });
    } catch (e) {
        console.error('[api/settings GET]', e);
        return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { settings } = body as { settings: Record<string, string> };

        if (!settings || typeof settings !== 'object') {
            return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
        }

        const updates: Array<{ key: string; value: string }> = [];

        for (const [key, value] of Object.entries(settings)) {
            // 只处理已知字段
            if (!(key in SETTING_DEFAULTS)) continue;
            // 敏感字段：如果前端传来的是掩码，跳过更新（避免覆盖真实值）
            if (SENSITIVE_KEYS.has(key) && value === MASK) continue;
            // 空值也允许保存（相当于清除配置）
            updates.push({ key, value: String(value) });
        }

        // 批量 upsert
        await Promise.all(
            updates.map(({ key, value }) =>
                prisma.setting.upsert({
                    where: { key },
                    update: { value },
                    create: { key, value },
                })
            )
        );

        // 同步 EXTEND.md
        const allSettings: Record<string, string> = {};
        for (const { key, value } of updates) {
            allSettings[key] = value;
        }
        await syncExtendMd(allSettings);

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error('[api/settings POST]', e);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
