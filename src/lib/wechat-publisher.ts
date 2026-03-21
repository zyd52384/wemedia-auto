import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export type PublishMethod = 'browser' | 'api';

interface PublishOptions {
    htmlPath: string;
    title: string;
    author: string;
    summary: string;
    coverPath?: string | null;
    publishMethod?: PublishMethod;
    wechatAppId?: string;
    wechatAppSecret?: string;
    chromePath?: string;
}

/**
 * Publish article to WeChat Official Account.
 * Supports both browser automation and API methods.
 */
export async function publishToWeChat(options: PublishOptions): Promise<{ success: boolean; error?: string; mediaId?: string }> {
    const { publishMethod = 'browser' } = options;

    if (publishMethod === 'api') {
        return publishViaApi(options);
    }
    return publishViaBrowser(options);
}

/**
 * Publish via WeChat API using wechat-api.ts
 */
async function publishViaApi(options: PublishOptions): Promise<{ success: boolean; error?: string; mediaId?: string }> {
    const { htmlPath, title, author, summary, coverPath, wechatAppId, wechatAppSecret } = options;

    if (!fs.existsSync(htmlPath)) {
        return { success: false, error: `HTML file not found: ${htmlPath}` };
    }

    const htmlSize = fs.statSync(htmlPath).size;
    console.log(`[wechat-publish-api] HTML file: ${htmlPath} (${htmlSize} bytes)`);
    if (htmlSize === 0) {
        return { success: false, error: 'HTML file is empty' };
    }

    const skillDir = findSkillDir('baoyu-post-to-wechat');
    if (!skillDir) {
        return { success: false, error: 'baoyu-post-to-wechat skill not found' };
    }

    const scriptPath = path.join(skillDir, 'scripts', 'wechat-api.ts');

    try {
        const env = { ...process.env };
        // Pass API credentials via environment variables
        if (wechatAppId) env.WECHAT_APP_ID = wechatAppId;
        if (wechatAppSecret) env.WECHAT_APP_SECRET = wechatAppSecret;

        const safeTitle = title.replace(/"/g, '\\"');
        const safeSummary = summary.replace(/"/g, '\\"');

        let cmd = `npx -y bun "${scriptPath}" "${htmlPath}" --title "${safeTitle}" --author "${author}" --summary "${safeSummary}"`;
        if (coverPath && fs.existsSync(coverPath)) {
            cmd += ` --cover "${coverPath}"`;
        }

        console.log('[wechat-publish-api] Executing:', cmd.substring(0, 150) + '...');

        const { stdout, stderr } = await execAsync(cmd, {
            env,
            timeout: 120000,
            cwd: process.cwd(),
            maxBuffer: 10 * 1024 * 1024,
        });

        console.log('[wechat-publish-api] stdout:', stdout);
        if (stderr) console.warn('[wechat-publish-api] stderr:', stderr);

        // Parse JSON output for media_id
        try {
            const result = JSON.parse(stdout.trim());
            if (result.success) {
                return { success: true, mediaId: result.media_id };
            }
        } catch {
            // stdout may not be pure JSON if there are log lines mixed in
            if (stdout.includes('"success": true') || stdout.includes('"success":true')) {
                const mediaIdMatch = stdout.match(/"media_id":\s*"([^"]+)"/);
                return { success: true, mediaId: mediaIdMatch?.[1] };
            }
        }

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error('[wechat-publish-api] Error:', error);
        return { success: false, error };
    }
}

/**
 * Publish via browser automation using wechat-article.ts
 */
async function publishViaBrowser(options: PublishOptions): Promise<{ success: boolean; error?: string }> {
    const { htmlPath, title, author, summary } = options;

    if (!fs.existsSync(htmlPath)) {
        return { success: false, error: `HTML file not found: ${htmlPath}` };
    }

    const htmlSize = fs.statSync(htmlPath).size;
    console.log(`[wechat-publish] HTML file: ${htmlPath} (${htmlSize} bytes)`);
    if (htmlSize === 0) {
        return { success: false, error: 'HTML file is empty' };
    }

    const skillDir = findSkillDir('baoyu-post-to-wechat');
    if (!skillDir) {
        return { success: false, error: 'baoyu-post-to-wechat skill not found' };
    }

    const chromePath = options.chromePath || process.env.WECHAT_CHROME_PATH || '';
    const scriptPath = path.join(skillDir, 'scripts', 'wechat-article.ts');

    try {
        const env = { ...process.env };
        if (chromePath) {
            env.WECHAT_BROWSER_CHROME_PATH = chromePath;
        }

        // Escape quotes in title and summary for command line
        const safeTitle = title.replace(/"/g, '\\"');
        const safeSummary = summary.replace(/"/g, '\\"');

        const cmd = `npx -y bun "${scriptPath}" --html "${htmlPath}" --title "${safeTitle}" --author "${author}" --summary "${safeSummary}" --submit`;

        console.log('[wechat-publish] Executing:', cmd.substring(0, 150) + '...');

        const { stdout, stderr } = await execAsync(cmd, {
            env,
            timeout: 300000, // 5 minutes for browser automation
            cwd: process.cwd(),
            maxBuffer: 10 * 1024 * 1024,
        });

        console.log('[wechat-publish] stdout:', stdout);
        if (stderr) console.warn('[wechat-publish] stderr:', stderr);

        // Check for known failure patterns in output
        if (stdout.includes('editor appears empty after paste') ||
            stdout.includes('Body content verification failed')) {
            return { success: false, error: 'Content paste verification failed - editor was empty after paste' };
        }

        return { success: true };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error('[wechat-publish] Error:', error);
        return { success: false, error };
    }
}

/**
 * Convert markdown to HTML using baoyu-markdown-to-html skill
 */
export async function convertToHtml(mdPath: string, theme: string = 'grace'): Promise<string | null> {
    const skillDir = findSkillDir('baoyu-markdown-to-html');
    if (!skillDir) {
        console.warn('baoyu-markdown-to-html skill not found');
        return null;
    }

    const mdDir = path.dirname(mdPath);

    try {
        const scriptPath = path.join(skillDir, 'scripts', 'main.ts');
        const { stdout } = await execAsync(
            `npx -y bun "${scriptPath}" "${mdPath}" --theme ${theme}`,
            { cwd: mdDir, timeout: 30000 }
        );

        // Parse output JSON to get htmlPath
        const cleaned = stdout.replace(/\[markdown-to-html\].*\n?/g, '').trim();
        let htmlPath: string;
        try {
            const result = JSON.parse(cleaned);
            htmlPath = result.htmlPath || mdPath.replace(/\.md$/i, '.html');
        } catch {
            htmlPath = mdPath.replace(/\.md$/i, '.html');
        }

        // Ensure absolute path (script may return relative path)
        if (!path.isAbsolute(htmlPath)) {
            htmlPath = path.resolve(mdDir, htmlPath);
        }

        if (fs.existsSync(htmlPath)) {
            console.log(`[md-to-html] ✅ HTML generated: ${htmlPath} (${fs.statSync(htmlPath).size} bytes)`);
            return htmlPath;
        } else {
            console.warn(`[md-to-html] HTML file not found at: ${htmlPath}`);
            return null;
        }
    } catch (e) {
        console.error('[md-to-html] Error:', e);
        return null;
    }
}

function findSkillDir(skillName: string): string | null {
    const possiblePaths = [
        path.resolve(process.cwd(), '..', '.agents', 'skills', skillName),
        path.resolve(process.cwd(), '.agents', 'skills', skillName),
    ];
    for (const p of possiblePaths) {
        if (fs.existsSync(path.join(p, 'SKILL.md'))) return p;
    }
    return null;
}
