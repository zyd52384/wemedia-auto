import prisma from './db';

export interface AppSettings {
    geminiKey: string;
    geminiBaseUrl: string;
    glmApiKey: string;
    glmBaseUrl: string;
    author: string;
    chromePath: string;
    theme: string;
    writerStyle: 'general' | 'tech';
    publishMethod: 'browser' | 'api';
    wechatAppId: string;
    wechatAppSecret: string;
    dashscopeKey: string;
    xhsCookie: string;
}

const DEFAULTS: AppSettings = {
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

/**
 * Load all settings from database, merged with defaults.
 */
export async function loadSettings(): Promise<AppSettings> {
    try {
        const rows = await prisma.setting.findMany();
        const settings: Record<string, string> = {};
        for (const row of rows) {
            settings[row.key] = row.value;
        }
        return {
            geminiKey: settings.geminiKey || DEFAULTS.geminiKey,
            geminiBaseUrl: settings.geminiBaseUrl || DEFAULTS.geminiBaseUrl,
            glmApiKey: settings.glmApiKey || DEFAULTS.glmApiKey,
            glmBaseUrl: settings.glmBaseUrl || DEFAULTS.glmBaseUrl,
            author: settings.author || DEFAULTS.author,
            chromePath: settings.chromePath || DEFAULTS.chromePath,
            theme: settings.theme || DEFAULTS.theme,
            writerStyle: (settings.writerStyle as 'general' | 'tech') || DEFAULTS.writerStyle,
            publishMethod: (settings.publishMethod as 'browser' | 'api') || DEFAULTS.publishMethod,
            wechatAppId: settings.wechatAppId || DEFAULTS.wechatAppId,
            wechatAppSecret: settings.wechatAppSecret || DEFAULTS.wechatAppSecret,
            dashscopeKey: settings.dashscopeKey || DEFAULTS.dashscopeKey,
            xhsCookie: settings.xhsCookie || DEFAULTS.xhsCookie,
        };
    } catch {
        return DEFAULTS;
    }
}
