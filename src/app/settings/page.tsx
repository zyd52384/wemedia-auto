'use client';

import { useState, useEffect } from 'react';

type PublishMethod = 'browser' | 'api';

interface Settings {
    geminiKey: string;
    geminiBaseUrl: string;
    glmApiKey: string;
    glmBaseUrl: string;
    author: string;
    chromePath: string;
    theme: string;
    writerStyle: string;
    publishMethod: PublishMethod;
    wechatAppId: string;
    wechatAppSecret: string;
    dashscopeKey: string;
    xhsCookie: string;
    xhsCookieSet?: string;  // 'true' | 'false' — from server only, not saved back
}

const DEFAULT_SETTINGS: Settings = {
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

export default function SettingsPage() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => {
                if (data.settings) {
                    setSettings(prev => ({ ...prev, ...data.settings }));
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (e) {
            console.error('Save failed:', e);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <div className="page-header">
                    <h1 className="page-title">⚙️ 设置</h1>
                    <p className="page-subtitle">配置 API Key 和发布偏好</p>
                </div>
                <div className="empty-state">
                    <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
                </div>
            </>
        );
    }

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">⚙️ 设置</h1>
                <p className="page-subtitle">配置 API Key 和发布偏好</p>
            </div>

            {/* Section: AI 生成配置 */}
            <div className="card" style={{ maxWidth: 640 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🤖 AI 生成配置
                </h3>

                <div className="input-group">
                    <label className="input-label">Gemini API Key</label>
                    <input
                        id="settings-gemini-key"
                        className="input"
                        type="password"
                        placeholder="请输入你的 Gemini API Key"
                        value={settings.geminiKey}
                        onChange={e => setSettings({ ...settings, geminiKey: e.target.value })}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        从 <a href="https://aistudio.google.com/apikey" target="_blank" style={{ color: 'var(--accent-purple)' }}>Google AI Studio</a> 获取
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label">Gemini 代理地址 (Base URL)</label>
                    <input
                        id="settings-gemini-base-url"
                        className="input"
                        placeholder="例如: http://127.0.0.1:8045，留空则直连 Google"
                        value={settings.geminiBaseUrl}
                        onChange={e => setSettings({ ...settings, geminiBaseUrl: e.target.value })}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        反向代理地址，留空则直接访问 Google API。对应 .env 中的 GEMINI_BASE_URL
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label">阿里云通义万象 (DashScope) API Key</label>
                    <input
                        id="settings-dashscope-key"
                        className="input"
                        type="password"
                        placeholder="请输入阿里云 DashScope API Key"
                        value={settings.dashscopeKey}
                        onChange={e => setSettings({ ...settings, dashscopeKey: e.target.value })}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        如果配置，封面生成在 Gemini 失败或不可用时将回退使用阿里图像生成大模型。从 <a href="https://bailian.console.aliyun.com/" target="_blank" style={{ color: 'var(--accent-purple)' }}>阿里云百炼</a> 获取
                    </div>
                </div>

                {/* GLM-5 Separator */}
                <div style={{ borderTop: '1px solid var(--border-light)', margin: '8px 0 20px', paddingTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                        ⚡ GLM-5 模型配置
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))', color: 'var(--accent-purple)', fontWeight: 500 }}>
                            自动优先使用
                        </span>
                    </div>

                    <div className="input-group">
                        <label className="input-label">GLM-5 API Key</label>
                        {settings.glmApiKey === '••••••••' && (
                            <div style={{
                                marginBottom: 8, padding: '8px 12px',
                                background: 'linear-gradient(135deg, rgba(5,150,105,0.08), rgba(16,185,129,0.04))',
                                border: '1px solid rgba(5,150,105,0.3)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 12, color: '#059669', fontWeight: 500,
                            }}>
                                ✅ GLM-5 API Key 已配置，文章生成将优先使用 GLM-5
                            </div>
                        )}
                        <input
                            id="settings-glm-api-key"
                            className="input"
                            type="password"
                            placeholder="请输入 GLM-5 API Key（如 sk-...）"
                            value={settings.glmApiKey === '••••••••' ? '' : settings.glmApiKey}
                            onChange={e => setSettings({ ...settings, glmApiKey: e.target.value })}
                        />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            配置后文章生成优先使用 GLM-5，失败时自动回退到 Gemini。对应 .env 中的 GLM_API_KEY
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">GLM 接口地址 (Base URL)</label>
                        <input
                            id="settings-glm-base-url"
                            className="input"
                            placeholder="https://api.edgefn.net/v1"
                            value={settings.glmBaseUrl}
                            onChange={e => setSettings({ ...settings, glmBaseUrl: e.target.value })}
                        />
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            默认为 https://api.edgefn.net/v1，可按需修改。对应 .env 中的 GLM_BASE_URL
                        </div>
                    </div>
                </div>

                <div className="input-group">
                    <label className="input-label">默认作者名</label>
                    <input
                        id="settings-author"
                        className="input"
                        placeholder="我是老朱"
                        value={settings.author}
                        onChange={e => setSettings({ ...settings, author: e.target.value })}
                    />
                </div>
            </div>

            {/* Section: 排版主题 */}
            <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    🎨 文章排版
                </h3>

                <div className="input-group">
                    <label className="input-label">排版主题</label>
                    <select
                        id="settings-theme"
                        className="input"
                        value={settings.theme}
                        onChange={e => setSettings({ ...settings, theme: e.target.value })}
                    >
                        <option value="default">经典主题 (default) — 传统排版，标题居中带底边</option>
                        <option value="grace">优雅主题 (grace) — 文字阴影，圆角卡片，精致引用</option>
                        <option value="simple">简洁主题 (simple) — 现代极简风，不对称圆角</option>
                    </select>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        主题将用于 Markdown → HTML 转换，直接影响公众号文章的排版样式
                    </div>
                </div>

                {/* Theme Preview */}
                <div style={{
                    marginTop: 8,
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    background: settings.theme === 'default'
                        ? 'linear-gradient(135deg, #f8f4f0, #faf8f5)'
                        : settings.theme === 'grace'
                            ? 'linear-gradient(135deg, #f0f0ff, #f5f0fa)'
                            : 'linear-gradient(135deg, #f5f9f8, #f0f5f3)',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        {settings.theme === 'default' && '📜 经典主题预览'}
                        {settings.theme === 'grace' && '✨ 优雅主题预览'}
                        {settings.theme === 'simple' && '🪟 简洁主题预览'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                        {settings.theme === 'default' && '标题居中，带下划线装饰。二级标题使用彩色背景白字。整体风格成熟稳重，适合正式内容。'}
                        {settings.theme === 'grace' && '文字带阴影效果，圆角卡片式布局。引用块经过精心装饰。整体风格优雅精致，适合文艺类内容。'}
                        {settings.theme === 'simple' && '现代极简设计，不对称圆角元素。清爽留白，视觉干净利落。适合技术类和日常阅读内容。'}
                    </div>
                </div>
            </div>

            {/* Section: 微信推送方式 */}
            <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    📤 微信推送方式
                </h3>

                {/* Method Selector */}
                <div className="input-group">
                    <label className="input-label">推送方式</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div
                            id="method-browser"
                            onClick={() => setSettings({ ...settings, publishMethod: 'browser' })}
                            style={{
                                flex: 1,
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-md)',
                                border: `2px solid ${settings.publishMethod === 'browser' ? 'var(--accent-purple)' : 'var(--border)'}`,
                                background: settings.publishMethod === 'browser' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(99, 102, 241, 0.04))' : 'var(--bg-input)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div style={{
                                fontSize: 14, fontWeight: 600,
                                color: settings.publishMethod === 'browser' ? 'var(--accent-purple)' : 'var(--text-primary)',
                                marginBottom: 4,
                            }}>
                                🌐 浏览器自动化
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                通过 Chrome 浏览器模拟操作，需要先扫码登录一次
                            </div>
                        </div>
                        <div
                            id="method-api"
                            onClick={() => setSettings({ ...settings, publishMethod: 'api' })}
                            style={{
                                flex: 1,
                                padding: '16px 20px',
                                borderRadius: 'var(--radius-md)',
                                border: `2px solid ${settings.publishMethod === 'api' ? 'var(--accent-purple)' : 'var(--border)'}`,
                                background: settings.publishMethod === 'api' ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(99, 102, 241, 0.04))' : 'var(--bg-input)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div style={{
                                fontSize: 14, fontWeight: 600,
                                color: settings.publishMethod === 'api' ? 'var(--accent-purple)' : 'var(--text-primary)',
                                marginBottom: 4,
                            }}>
                                ⚡ 微信 API (推荐)
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                直接调用微信官方 API，速度快、稳定，支持封面图
                            </div>
                        </div>
                    </div>
                </div>

                {/* Browser Path - always shown, used for both WeChat browser automation and XHS rendering */}
                <div className="input-group" style={{ animation: 'fadeIn 0.2s ease' }}>
                    <label className="input-label">浏览器路径（Chrome / Chromium）</label>
                    <input
                        id="settings-chrome-path"
                        className="input"
                        placeholder="D:\Program Files\GptChrome\GptBrowser.exe"
                        value={settings.chromePath}
                        onChange={e => setSettings({ ...settings, chromePath: e.target.value })}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        Chrome 或 Chromium 内核浏览器的可执行文件路径。同时用于：① 微信公众号浏览器自动化推送；② 小红书图文卡片渲染截图（Playwright）。
                    </div>
                </div>

                {/* API Settings */}
                {settings.publishMethod === 'api' && (
                    <div style={{ animation: 'fadeIn 0.2s ease' }}>
                        <div className="input-group">
                            <label className="input-label">AppID</label>
                            <input
                                id="settings-wechat-appid"
                                className="input"
                                placeholder="请输入微信公众号 AppID"
                                value={settings.wechatAppId}
                                onChange={e => setSettings({ ...settings, wechatAppId: e.target.value })}
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label">AppSecret</label>
                            <input
                                id="settings-wechat-appsecret"
                                className="input"
                                type="password"
                                placeholder="请输入微信公众号 AppSecret"
                                value={settings.wechatAppSecret}
                                onChange={e => setSettings({ ...settings, wechatAppSecret: e.target.value })}
                            />
                        </div>
                        <div style={{ padding: 14, background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
                                <strong style={{ color: 'var(--text-secondary)' }}>🔑 获取方式：</strong><br />
                                1. 登录 <a href="https://mp.weixin.qq.com" target="_blank" style={{ color: 'var(--accent-purple)' }}>微信公众平台</a><br />
                                2. 进入「设置与开发」→「基本配置」<br />
                                3. 复制 AppID 和 AppSecret<br />
                                <br />
                                <strong style={{ color: 'var(--text-secondary)' }}>📋 IP 白名单：</strong><br />
                                需要在「基本配置」中把当前服务器 IP 加入白名单
                            </div>
                        </div>
                    </div>
                )}

                {/* Method Comparison */}
                <div style={{
                    marginTop: 4,
                    padding: 16,
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>📊 两种方式对比</div>
                    <table style={{ width: '100%', fontSize: 12, color: 'var(--text-muted)', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border-light)' }}></th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border-light)' }}>🌐 浏览器方式</th>
                                <th style={{ textAlign: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border-light)' }}>⚡ 接口方式</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['速度', '较慢 (~3分钟)', '快速 (~30秒)'],
                                ['稳定性', '依赖 DOM', '官方接口'],
                                ['封面图', '❌', '✅ 自动上传'],
                                ['评论控制', '❌', '✅'],
                                ['需登录', '扫码一次', '不需要'],
                                ['需凭证', '不需要', '应用 ID + 密钥'],
                            ].map(([label, browser, api], i) => (
                                <tr key={i}>
                                    <td style={{ padding: '6px 8px', fontWeight: 500, color: 'var(--text-secondary)' }}>{label}</td>
                                    <td style={{ textAlign: 'center', padding: '6px 8px' }}>{browser}</td>
                                    <td style={{ textAlign: 'center', padding: '6px 8px' }}>{api}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Section: 小红书配置 */}
            <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                    📸 小红书图文配置
                </h3>

                <div className="input-group">
                    <label className="input-label">小红书 Cookie (XHS_COOKIE)</label>

                    {/* Status indicator */}
                    {settings.xhsCookieSet === 'true' && (
                        <div style={{
                            marginBottom: 8, padding: '8px 12px',
                            background: 'linear-gradient(135deg, rgba(5,150,105,0.08), rgba(16,185,129,0.04))',
                            border: '1px solid rgba(5,150,105,0.3)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12, color: '#059669', fontWeight: 500,
                        }}>
                            ✅ Cookie 已配置。如需更新，请在下方粘贴新值后保存；留空则保留原有 Cookie。
                        </div>
                    )}

                    <textarea
                        id="settings-xhs-cookie"
                        className="input"
                        rows={4}
                        placeholder={settings.xhsCookieSet === 'true'
                            ? '（已配置，粘贴新 Cookie 可覆盖更新）'
                            : '粘贴小红书网页版完整 Cookie 字符串...'}
                        value={settings.xhsCookie}
                        onChange={e => setSettings({ ...settings, xhsCookie: e.target.value })}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.7 }}>
                        配置后可将生成的小红书图文自动推送到草稿箱。获取方式：🔑 登录 <a href="https://www.xiaohongshu.com" target="_blank" style={{ color: 'var(--accent-purple)' }}>小红书网页版</a> → F12 开发者工具 → Network 任意请求 → 复制请求头中的 Cookie 字段值。Cookie 需包含 <code>a1</code> 和 <code>web_session</code> 字段。
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div style={{ maxWidth: 640, marginTop: 20 }}>
                <button
                    id="settings-save-btn"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 16 }}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <>
                            <span className="spinner" />
                            保存中...
                        </>
                    ) : saved ? '✅ 已保存' : '💾 保存设置'}
                </button>

                <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>💡 提示</div>
                    <ul style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 16, lineHeight: 1.8 }}>
                        <li>设置保存后立即生效，无需重启应用</li>
                        <li>排版主题会同步到 <code>EXTEND.md</code> 配置文件</li>
                        <li>API 凭证保存在数据库中，不会泄露到文件系统</li>
                        <li>浏览器方式需要首次扫码登录，登录态会被保存</li>
                    </ul>
                </div>
            </div>
        </>
    );
}
