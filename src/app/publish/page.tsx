'use client';

import { useState, useEffect } from 'react';

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface Step {
    id: string;
    label: string;
    status: StepStatus;
    message?: string;
}

const INITIAL_STEPS: Step[] = [
    { id: 'generating_article', label: '生成文章', status: 'pending' },
    { id: 'humanizing', label: '去AI痕迹', status: 'pending' },
    { id: 'saving_local', label: '保存本地', status: 'pending' },
    { id: 'generating_cover', label: '生成封面', status: 'pending' },
    { id: 'converting_html', label: '转换排版', status: 'pending' },
    { id: 'publishing_wechat', label: '推送微信', status: 'pending' },
];

export default function PublishPage() {
    const [keyword, setKeyword] = useState('');
    const [useHumanizer, setUseHumanizer] = useState(false);
    const [writerStyle, setWriterStyle] = useState<'general' | 'tech'>('general');
    const [isPublishing, setIsPublishing] = useState(false);
    const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
    const [result, setResult] = useState<{ success: boolean; articleId?: string; error?: string } | null>(null);

    // Load default writer style from settings
    useEffect(() => {
        fetch('/api/settings')
            .then(r => r.json())
            .then(data => {
                if (data.writerStyle) setWriterStyle(data.writerStyle);
            })
            .catch(() => { });
    }, []);

    const handlePublish = async () => {
        if (!keyword.trim() || isPublishing) return;

        setIsPublishing(true);
        setResult(null);

        // Reset steps
        const newSteps: Step[] = INITIAL_STEPS.map(s => ({
            ...s,
            status: 'pending' as const,
        }));
        // Skip humanizer step display if not enabled
        if (!useHumanizer) {
            newSteps[1] = { ...newSteps[1], status: 'done' as const, message: '已跳过' };
        }
        setSteps(newSteps);

        // Simulate step-by-step progress by setting first step active
        setSteps(prev => prev.map((s, i): Step => {
            if (i === 0) return { ...s, status: 'active' as const };
            return s;
        }));

        try {
            const res = await fetch('/api/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword: keyword.trim(), useHumanizer, writerStyle }),
            });

            const data = await res.json();

            if (res.ok && data.success) {
                // Mark all steps done
                setSteps(prev =>
                    prev.map((s): Step => ({
                        ...s,
                        status: 'done' as const,
                        message: s.id === 'humanizing' && !useHumanizer ? '已跳过' : '✓',
                    }))
                );
                setResult({ success: true, articleId: data.articleId });
            } else {
                setSteps(prev =>
                    prev.map((s): Step => s.status === 'active' ? { ...s, status: 'error' as const } : s)
                );
                setResult({ success: false, error: data.error || '发布失败' });
            }
        } catch (e) {
            setResult({ success: false, error: '网络错误，请检查服务是否运行' });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">🚀 一键发布</h1>
                <p className="page-subtitle">输入关键词，自动生成文章并发布到微信公众号</p>
            </div>

            <div className="card" style={{ maxWidth: 640 }}>
                <div className="input-group">
                    <label className="input-label">主题关键词</label>
                    <textarea
                        className="input"
                        placeholder="请输入主题关键词或提供参考资料..."
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        disabled={isPublishing}
                        rows={4}
                        style={{ height: 'auto', resize: 'vertical' }}
                    />
                </div>

                <div className="toggle-group">
                    <div
                        className={`toggle ${useHumanizer ? 'active' : ''}`}
                        onClick={() => !isPublishing && setUseHumanizer(!useHumanizer)}
                    >
                        <div className="toggle-knob" />
                    </div>
                    <span className="toggle-label">去除 AI 痕迹（人性化处理）</span>
                </div>

                <div className="input-group" style={{ marginTop: 8 }}>
                    <label className="input-label">写作风格</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            type="button"
                            className={`btn ${writerStyle === 'general' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => !isPublishing && setWriterStyle('general')}
                            disabled={isPublishing}
                            style={{ flex: 1, justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}
                        >
                            ✍️ 通用写作
                        </button>
                        <button
                            type="button"
                            className={`btn ${writerStyle === 'tech' ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => !isPublishing && setWriterStyle('tech')}
                            disabled={isPublishing}
                            style={{ flex: 1, justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}
                        >
                            🔬 科技技术
                        </button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        {writerStyle === 'tech'
                            ? '科技模式：1500-2500字，深度技术解析，数据驱动，适合 AI、开源工具、科技热点'
                            : '通用模式：1000-1500字，故事化开头，情感化表达，适合生活、职场等通用话题'
                        }
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={handlePublish}
                    disabled={!keyword.trim() || isPublishing}
                    style={{ width: '100%', justifyContent: 'center', padding: '14px 20px', fontSize: 16 }}
                >
                    {isPublishing ? (
                        <>
                            <span className="spinner" />
                            发布中...
                        </>
                    ) : (
                        '🚀 开始一键发布'
                    )}
                </button>
            </div>

            {(isPublishing || result) && (
                <div className="card" style={{ maxWidth: 640, marginTop: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>发布进度</h3>
                    <div className="progress-container">
                        {steps.map((step) => (
                            <div className="progress-step" key={step.id}>
                                <div className={`progress-dot ${step.status}`}>
                                    {step.status === 'done' ? '✓' : step.status === 'error' ? '✕' : step.status === 'active' ? '⋯' : '·'}
                                </div>
                                <span className={`progress-text ${step.status === 'active' ? 'active' : ''}`}>
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
                            {result.success ? '🎉 发布成功！文章已保存到微信草稿箱' : `❌ ${result.error}`}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
