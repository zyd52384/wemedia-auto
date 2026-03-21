'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface XhsNote {
    id: string;
    title: string;
    keyword: string;
    theme: string;
    mode: string;
    status: string;
    images: string;
    createdAt: string;
}

const STATUS_MAP: Record<string, { cls: string; text: string }> = {
    done: { cls: 'badge-success', text: '✅ 已生成' },
    rendered: { cls: 'badge-success', text: '✅ 已生成' },
    published: { cls: 'badge-success', text: '✅ 已推送 XHS' },
    failed: { cls: 'badge-error', text: '❌ 失败' },
};

const THEME_LABEL: Record<string, string> = {
    default: '默认简约',
    'playful-geometric': '活泼几何',
    professional: '专业商务',
    botanical: '植物园自然',
    'neo-brutalism': '新粗野主义',
    retro: '复古怀旧',
    terminal: '终端命令行',
    sketch: '手绘素描',
};

const isGenerated = (status: string) => status === 'done' || status === 'rendered';

export default function XhsNotesPage() {
    const [notes, setNotes] = useState<XhsNote[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState<string | null>(null); // noteId being published
    const [deleting, setDeleting] = useState<string | null>(null); // noteId being deleted

    // Filter state
    const [titleFilter, setTitleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [debouncedTitle, setDebouncedTitle] = useState('');

    useEffect(() => {
        const t = setTimeout(() => setDebouncedTitle(titleFilter), 350);
        return () => clearTimeout(t);
    }, [titleFilter]);

    const fetchNotes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (debouncedTitle) params.set('title', debouncedTitle);
            // 'generated' is a virtual value meaning done OR rendered
            if (statusFilter === 'generated') {
                params.set('status', 'done');   // API will also pick rendered via OR
                params.set('statusOr', 'rendered');
            } else if (statusFilter) {
                params.set('status', statusFilter);
            }
            const res = await fetch(`/api/xhs-notes?${params.toString()}`);
            const data = await res.json();
            setNotes(data.notes || []);
            setTotal(data.total || 0);
        } catch { /* */ } finally {
            setLoading(false);
        }
    }, [debouncedTitle, statusFilter]);

    useEffect(() => { fetchNotes(); }, [fetchNotes]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('确定删除这条小红书图文？这将同时删除本地生成的图片文件。')) return;
        setDeleting(id);
        try {
            await fetch(`/api/xhs-notes/${id}`, { method: 'DELETE' });
            setNotes(prev => prev.filter(n => n.id !== id));
            setTotal(prev => prev - 1);
        } finally {
            setDeleting(null);
        }
    };

    const handlePublish = async (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('确定将该图文推送到小红书草稿箱？')) return;
        setPublishing(id);
        try {
            const res = await fetch(`/api/xhs-notes/${id}/publish`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                // Update local status
                setNotes(prev => prev.map(n => n.id === id ? { ...n, status: 'published' } : n));
                alert('✅ 已成功推送到小红书草稿箱！');
            } else {
                alert(`❌ 推送失败：${data.error}`);
            }
        } catch {
            alert('推送出错，请检查网络或重试。');
        } finally {
            setPublishing(null);
        }
    };

    const getImageCount = (note: XhsNote) => {
        try { return JSON.parse(note.images || '[]').length; } catch { return 0; }
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">🗂️ 小红书图文</h1>
                <p className="page-subtitle">共 {total} 条已生成的小红书图文卡片</p>
            </div>

            {/* Filter bar */}
            <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ flex: '1 1 220px', position: 'relative' }}>
                        <span style={{
                            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                            fontSize: 14, pointerEvents: 'none', color: 'var(--text-muted)',
                        }}>🔍</span>
                        <input
                            className="input"
                            style={{ paddingLeft: 32 }}
                            placeholder="搜索标题..."
                            value={titleFilter}
                            onChange={e => setTitleFilter(e.target.value)}
                        />
                    </div>

                    <div style={{ flex: '0 0 160px' }}>
                        <select
                            className="input"
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                        >
                            <option value="">全部状态</option>
                            <option value="generated">✅ 已生成（未发布）</option>
                            <option value="published">✅ 已推送 XHS</option>
                            <option value="failed">❌ 失败</option>
                        </select>
                    </div>

                    {(titleFilter || statusFilter) && (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => { setTitleFilter(''); setStatusFilter(''); }}
                        >
                            ✕ 清除筛选
                        </button>
                    )}

                    <div style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
                        {loading ? '查询中...' : `${total} 条结果`}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="empty-state">
                    <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
                </div>
            ) : notes.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">{titleFilter || statusFilter ? '🔍' : '🗂️'}</div>
                    <div className="empty-state-title">
                        {titleFilter || statusFilter ? '未找到匹配的图文' : '暂无小红书图文'}
                    </div>
                    <div className="empty-state-text">
                        {titleFilter || statusFilter ? '尝试调整筛选条件' : '前往「小红书生成」生成你的第一条图文内容'}
                    </div>
                    {!(titleFilter || statusFilter) && (
                        <Link href="/xhs-publish" className="btn btn-primary" style={{ marginTop: 16 }}>✨ 立即生成</Link>
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
                    {notes.map(note => {
                        const imageCount = getImageCount(note);
                        const status = STATUS_MAP[note.status] || STATUS_MAP.done;
                        const canPublish = isGenerated(note.status);
                        const isPub = publishing === note.id;

                        return (
                            <Link key={note.id} href={`/xhs-notes/${note.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div
                                    style={{
                                        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                                        background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                                        boxShadow: 'var(--shadow-sm)', transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                        cursor: 'pointer', height: '100%',
                                    }}
                                    onMouseEnter={e => {
                                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
                                        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                                    }}
                                    onMouseLeave={e => {
                                        (e.currentTarget as HTMLElement).style.transform = '';
                                        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                                    }}
                                >
                                    {/* Cover 3:4 */}
                                    <div style={{ position: 'relative', paddingBottom: '133.33%', background: 'var(--bg-input)' }}>
                                        <img
                                            src={`/api/xhs-image/${note.id}/0`}
                                            alt={note.title}
                                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        {imageCount > 0 && (
                                            <div style={{
                                                position: 'absolute', top: 8, right: 8,
                                                background: 'rgba(0,0,0,0.55)', color: '#fff',
                                                borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                                backdropFilter: 'blur(6px)',
                                            }}>📷 {imageCount}张</div>
                                        )}
                                        <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 2 }}>
                                            <span className={`badge ${status.cls}`} style={{ fontSize: 10 }}>{status.text}</span>
                                        </div>
                                        <button
                                            className="xhs-delete-btn"
                                            title="删除图文"
                                            disabled={deleting === note.id}
                                            onClick={e => handleDelete(note.id, e)}
                                            style={{
                                                position: 'absolute',
                                                bottom: 8,
                                                right: 8,
                                                zIndex: 2,
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                border: 'none',
                                                background: 'rgba(255,255,255,0.85)',
                                                backdropFilter: 'blur(4px)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 14,
                                                color: 'var(--text-muted)',
                                                transition: 'all 0.2s ease',
                                                opacity: deleting === note.id ? 0.5 : undefined,
                                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#FEE2E2';
                                                e.currentTarget.style.color = '#DC2626';
                                                e.currentTarget.style.transform = 'scale(1.1)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.85)';
                                                e.currentTarget.style.color = 'var(--text-muted)';
                                                e.currentTarget.style.transform = 'scale(1)';
                                            }}
                                        >
                                            {deleting === note.id ? '⏳' : '🗑'}
                                        </button>
                                    </div>

                                    {/* Body */}
                                    <div style={{ padding: '12px 14px 14px' }}>
                                        <div style={{
                                            fontWeight: 600, fontSize: 14, lineHeight: 1.4, marginBottom: 6,
                                            overflow: 'hidden', display: '-webkit-box',
                                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        }}>
                                            {note.title}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                            <span style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: 4 }}>
                                                🎨 {THEME_LABEL[note.theme] || note.theme}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                                            </span>
                                            {canPublish && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    style={{ padding: '2px 8px', fontSize: 11 }}
                                                    disabled={isPub}
                                                    onClick={e => handlePublish(note.id, e)}
                                                    title="推送到小红书草稿箱"
                                                >
                                                    {isPub ? '推送中...' : '🔴 发布'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </>
    );
}
