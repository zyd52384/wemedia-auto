'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface XhsNoteDetail {
    id: string;
    title: string;
    summary: string;
    keyword: string;
    theme: string;
    mode: string;
    status: string;
    images: string;
    filePath: string;
    mdContent: string;
    createdAt: string;
    updatedAt: string;
}

const STATUS_MAP: Record<string, { cls: string; text: string }> = {
    done: { cls: 'badge-success', text: '✅ 已生成（本地）' },
    rendered: { cls: 'badge-success', text: '✅ 已生成（本地）' },
    published: { cls: 'badge-success', text: '✅ 已推送小红书' },
    failed: { cls: 'badge-error', text: '❌ 失败' },
};

const THEME_LABEL: Record<string, string> = {
    default: '默认简约',
    'playful-geometric': '活泼几何 (Memphis)',
    professional: '专业商务',
    botanical: '植物园自然',
    'neo-brutalism': '新粗野主义',
    retro: '复古怀旧',
    terminal: '终端命令行',
    sketch: '手绘素描',
};

const MODE_LABEL: Record<string, string> = {
    separator: '按段落分隔',
    'auto-split': '按高度自动切分',
    'auto-fit': '封面海报单图（自动缩放）',
    dynamic: '动态高度自适应',
};

export default function XhsNoteDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [note, setNote] = useState<XhsNoteDetail | null>(null);
    const [images, setImages] = useState<string[]>([]);
    const [activeImg, setActiveImg] = useState(0);
    const [loading, setLoading] = useState(true);
    const [publishing, setPublishing] = useState(false);

    useEffect(() => {
        fetch(`/api/xhs-notes/${params.id}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) { router.push('/xhs-notes'); return; }
                setNote(data);
                try { setImages(JSON.parse(data.images || '[]')); } catch { /* */ }
            })
            .catch(() => router.push('/xhs-notes'))
            .finally(() => setLoading(false));
    }, [params.id]);

    const handleDelete = async () => {
        if (!confirm('确定删除这条小红书图文？将同时删除本地图片文件。')) return;
        await fetch(`/api/xhs-notes/${params.id}`, { method: 'DELETE' });
        router.push('/xhs-notes');
    };

    const handlePublish = async () => {
        if (!note || !confirm('确定将该图文推送到小红书草稿箱？')) return;
        setPublishing(true);
        try {
            const res = await fetch(`/api/xhs-notes/${params.id}/publish`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setNote(prev => prev ? { ...prev, status: 'published' } : prev);
                alert('✅ 已成功推送到小红书草稿箱！');
            } else {
                alert(`❌ 推送失败：${data.error}`);
            }
        } catch {
            alert('推送出错，请检查网络或重试。');
        } finally {
            setPublishing(false);
        }
    };

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
            </div>
        );
    }

    if (!note) return null;

    const status = STATUS_MAP[note.status] || STATUS_MAP.done;

    return (
        <>
            <div style={{ marginBottom: 20 }}>
                <Link href="/xhs-notes" style={{ color: 'var(--accent-purple)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                    ← 返回小红书图文列表
                </Link>
            </div>

            <div className="page-header">
                <h1 className="page-title" style={{ fontSize: 22 }}>{note.title}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${status.cls}`}>{status.text}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {new Date(note.createdAt).toLocaleString('zh-CN')}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                {(note.status === 'done' || note.status === 'rendered') && (
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={handlePublish}
                        disabled={publishing}
                    >
                        {publishing ? '推送中...' : '🔴 推送到草稿箱'}
                    </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑️ 删除图文</button>
                <Link href="/xhs-publish" className="btn btn-secondary btn-sm">✨ 再次生成</Link>
            </div>

            {/* Meta info */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>图文主题 / 创意输入</div>
                        <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{note.keyword}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>副标题 / 摘要</div>
                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{note.summary || '—'}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>视觉风格</div>
                        <div style={{ fontSize: 14 }}>🎨 {THEME_LABEL[note.theme] || note.theme}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>排版模式</div>
                        <div style={{ fontSize: 14 }}>📐 {MODE_LABEL[note.mode] || note.mode}</div>
                    </div>
                </div>
            </div>

            {/* Generated content: title + body from note.md */}
            {note.mdContent && (() => {
                // Strip YAML front matter
                const body = note.mdContent.replace(/^---[\s\S]*?---\n*/m, '').trim();
                return (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                            📄 生成的图文正文内容
                        </div>
                        <pre style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: 13,
                            lineHeight: 1.9,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font)',
                            margin: 0,
                            maxHeight: 360,
                            overflowY: 'auto',
                            padding: '12px 16px',
                            background: 'var(--bg-input)',
                            borderRadius: 'var(--radius-sm)',
                        }}>
                            {body}
                        </pre>
                    </div>
                );
            })()}

            {/* Image gallery */}
            {images.length > 0 && (
                <div className="card">
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16 }}>
                        🖼️ 生成的图片卡片（共 {images.length} 张）
                    </div>

                    {/* Main preview */}
                    <div style={{
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: 'var(--bg-input)',
                        marginBottom: 12,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: 300,
                    }}>
                        <img
                            src={`/api/xhs-image/${note.id}/${activeImg}`}
                            alt={`${note.title} 第 ${activeImg + 1} 张`}
                            style={{
                                maxWidth: '100%',
                                maxHeight: 600,
                                objectFit: 'contain',
                                display: 'block',
                            }}
                        />
                    </div>

                    {/* Thumbnails */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {images.map((_, idx) => (
                            <div
                                key={idx}
                                onClick={() => setActiveImg(idx)}
                                style={{
                                    width: 72,
                                    height: 96,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    border: activeImg === idx
                                        ? '2px solid var(--accent-purple)'
                                        : '2px solid var(--border-light)',
                                    flexShrink: 0,
                                    transition: 'border-color 0.15s ease',
                                }}
                            >
                                <img
                                    src={`/api/xhs-image/${note.id}/${idx}`}
                                    alt={`缩略图 ${idx + 1}`}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Image filename hint */}
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                        第 {activeImg + 1} / {images.length} 张 · {activeImg === 0 ? '封面图' : `正文卡片 ${activeImg}`}
                    </div>
                </div>
            )}
        </>
    );
}
