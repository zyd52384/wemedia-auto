'use client';

import { useState } from 'react';

type StepStatus = 'pending' | 'active' | 'done' | 'error' | 'skipped';

interface Step {
    id: string;
    label: string;
    status: StepStatus;
    message?: string;
}

const THEMES = [
    { value: 'default', label: '默认简约' },
    { value: 'playful-geometric', label: '活泼几何 (Memphis)' },
    { value: 'professional', label: '专业商务' },
    { value: 'botanical', label: '植物园自然' },
    { value: 'neo-brutalism', label: '新粗野主义' },
    { value: 'retro', label: '复古怀旧' },
    { value: 'terminal', label: '终端命令行' },
    { value: 'sketch', label: '手绘素描' }
];

const MODES = [
    { value: 'separator', label: '按段落分隔' },
    { value: 'auto-split', label: '按高度自动切分（推荐）' },
    { value: 'auto-fit', label: '封面海报单图（自动缩放）' },
    { value: 'dynamic', label: '动态高度自适应' }
];

export default function XhsPublishPage() {
    const [keyword, setKeyword] = useState('');
    const [theme, setTheme] = useState('default');
    const [mode, setMode] = useState('auto-split');
    const [pushToXhs, setPushToXhs] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [steps, setSteps] = useState<Step[]>([]);
    const [result, setResult] = useState<{ success: boolean; noteId?: string; error?: string } | null>(null);

    const buildInitialSteps = (push: boolean): Step[] => [
        { id: 'generating_note', label: '生成文案内容', status: 'pending' },
        { id: 'saving_local', label: '保存本地配置', status: 'pending' },
        { id: 'rendering_images', label: '渲染图文卡片', status: 'pending' },
        { id: 'pushing_xhs', label: '推送到小红书草稿箱', status: push ? 'pending' : 'skipped' },
    ];

    const handlePublish = async () => {
        if (!keyword.trim() || isPublishing) return;

        setIsPublishing(true);
        setResult(null);

        const initial = buildInitialSteps(pushToXhs);
        setSteps(initial);

        // Mark first step active
        setSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'active' } : s));

        try {
            const res = await fetch('/api/xhs-publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: keyword.trim(), theme, mode, pushToXhs }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setSteps(prev => prev.map((s): Step => ({
                    ...s,
                    status: s.status === 'skipped' ? 'skipped' : 'done',
                    message: s.status === 'skipped' ? '已跳过' : '✓',
                })));
                setResult({ success: true, noteId: data.noteId });
            } else {
                setSteps(prev =>
                    prev.map((s): Step => s.status === 'active' ? { ...s, status: 'error' } : s)
                );
                setResult({ success: false, error: data.error || '生成失败' });
            }
        } catch {
            setResult({ success: false, error: '网络错误，请检查服务是否运行' });
        } finally {
            setIsPublishing(false);
        }
    };

    const stepIcon = (status: StepStatus) => {
        if (status === 'done') return '✓';
        if (status === 'error') return '✕';
        if (status === 'active') return '⋯';
        if (status === 'skipped') return '−';
        return '·';
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">📸 小红书图文生成</h1>
                <p className="page-subtitle">输入关键词，自动撰写文案并渲染精美卡片，可选一键推送到小红书草稿箱</p>
            </div>

            <div className="card" style={{ maxWidth: 640 }}>
                <div className="input-group">
                    <label className="input-label">图文主题或创意</label>
                    <textarea
                        className="input"
                        placeholder="例如：5个让效率翻倍的AI工具推荐"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        disabled={isPublishing}
                        rows={4}
                        style={{ height: 'auto', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                    <div className="input-group" style={{ flex: 1, marginTop: 0 }}>
                        <label className="input-label">视觉风格</label>
                        <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)} disabled={isPublishing}>
                            {THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>
                    <div className="input-group" style={{ flex: 1, marginTop: 0 }}>
                        <label className="input-label">排版模式</label>
                        <select className="input" value={mode} onChange={(e) => setMode(e.target.value)} disabled={isPublishing}>
                            {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Push to XHS toggle */}
                <div style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${pushToXhs ? 'var(--accent-purple)' : 'var(--border)'}`,
                    background: pushToXhs ? 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(99,102,241,0.04))' : 'var(--bg-input)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: isPublishing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                }} onClick={() => !isPublishing && setPushToXhs(!pushToXhs)}>
                    <div className={`toggle ${pushToXhs ? 'active' : ''}`} style={{ flexShrink: 0, pointerEvents: 'none' }}>
                        <div className="toggle-knob" />
                    </div>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: pushToXhs ? 'var(--accent-purple)' : 'var(--text-primary)' }}>
                            🔴 推送到小红书草稿箱
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            生成完图片后，自动调用 XHS Cookie 将笔记上传到创作者平台草稿箱。需先在「设置」页面配置小红书 Cookie。
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handlePublish}
                    disabled={!keyword.trim() || isPublishing}
                    style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 16, marginTop: 16 }}
                >
                    {isPublishing ? (
                        <>
                            <span className="spinner" />
                            正在制作中...
                        </>
                    ) : (
                        `✨ 一键生成${pushToXhs ? ' + 推送草稿' : '图文卡片'}`
                    )}
                </button>
            </div>

            {(isPublishing || (steps.length > 0 && result !== null)) && (
                <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>流水线进度</h3>
                    <div className="progress-container">
                        {steps.map((step) => (
                            <div className="progress-step" key={step.id}>
                                <div className={`progress-dot ${step.status === 'skipped' ? 'done' : step.status}`}
                                    style={{ opacity: step.status === 'skipped' ? 0.35 : 1 }}>
                                    {stepIcon(step.status)}
                                </div>
                                <span className={`progress-text ${step.status === 'active' ? 'active' : ''}`}
                                    style={{ opacity: step.status === 'skipped' ? 0.4 : 1 }}>
                                    {step.label}
                                    {step.message && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>({step.message})</span>}
                                </span>
                            </div>
                        ))}
                    </div>

                    {result && (
                        <div style={{
                            marginTop: 20,
                            padding: 16,
                            borderRadius: 'var(--radius-md)',
                            background: result.success ? '#ECFDF5' : '#FEF2F2',
                            color: result.success ? '#059669' : '#DC2626',
                            fontWeight: 600,
                            textAlign: 'center',
                        }}>
                            {result.success
                                ? `🎉 图文卡片生成成功！已保存到 xhs-notes 目录${pushToXhs ? '，并推送到小红书草稿箱' : '。可前往草稿箱发布。'}`
                                : `❌ ${result.error}`}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
