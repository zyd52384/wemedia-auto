'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ArticleDetail {
    id: string;
    title: string;
    keyword: string;
    summary: string;
    author: string;
    status: string;
    humanized: boolean;
    content: string;
    humanizedContent: string;
    coverPath: string;
    hasCover: boolean;
    titles: string[];
    createdAt: string;
    publishedAt: string;
    errorMsg: string;
}

export default function ArticleDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [article, setArticle] = useState<ArticleDetail | null>(null);
    const [showHumanized, setShowHumanized] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/articles/${params.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    router.push('/articles');
                    return;
                }
                setArticle(data);
            })
            .catch(() => router.push('/articles'))
            .finally(() => setLoading(false));
    }, [params.id]);

    const handleDelete = async () => {
        if (!confirm('确定删除这篇文章？')) return;
        await fetch(`/api/articles/${params.id}`, { method: 'DELETE' });
        router.push('/articles');
    };

    if (loading) {
        return (
            <div className="empty-state">
                <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
            </div>
        );
    }

    if (!article) return null;

    const statusInfo: Record<string, { cls: string; text: string }> = {
        published: { cls: 'badge-success', text: '✅ 已发布' },
        draft: { cls: 'badge-default', text: '📝 草稿' },
        failed: { cls: 'badge-error', text: '❌ 失败' },
    };
    const status = statusInfo[article.status] || statusInfo.draft;

    // Remove frontmatter for display
    const displayContent = (article.content || '').replace(/^---[\s\S]*?---\n*/, '');
    const displayHumanized = (article.humanizedContent || '').replace(/^---[\s\S]*?---\n*/, '');

    return (
        <>
            <div style={{ marginBottom: 20 }}>
                <Link href="/articles" style={{ color: 'var(--accent-purple)', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
                    ← 返回文章列表
                </Link>
            </div>

            <div className="page-header">
                <h1 className="page-title">{article.title}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <span className={`badge ${status.cls}`}>{status.text}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        作者: {article.author} · {new Date(article.createdAt).toLocaleString('zh-CN')}
                    </span>
                    {article.humanized && <span className="badge badge-default">🧹 已去AI味</span>}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>🗑️ 删除</button>
            </div>

            {article.keyword && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>主题关键词 / 提示词</div>
                    <pre style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', margin: 0 }}>{article.keyword}</pre>
                </div>
            )}

            {article.summary && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>摘要</div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{article.summary}</p>
                </div>
            )}

            {article.titles && article.titles.length > 1 && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10 }}>💥 备选爆款标题</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {article.titles.map((t, i) => (
                            <div key={i} style={{
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-sm)',
                                background: t === article.title ? 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06))' : 'var(--bg-input)',
                                border: t === article.title ? '1px solid var(--accent-purple)' : '1px solid transparent',
                                fontSize: 14,
                                color: 'var(--text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
                                {t}
                                {t === article.title && <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: 10 }}>✓ 已选用</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {article.errorMsg && (
                <div className="card" style={{ marginBottom: 20, borderColor: '#FECACA', background: '#FEF2F2' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--error)', marginBottom: 6 }}>错误信息</div>
                    <p style={{ fontSize: 14, color: '#DC2626' }}>{article.errorMsg}</p>
                </div>
            )}

            {article.hasCover && (
                <div className="card" style={{ marginBottom: 20, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>🖼️ 封面图</div>
                    <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-input)' }}>
                        <img
                            src={`/api/cover/${article.id}`}
                            alt={article.title}
                            style={{ width: '100%', maxHeight: 400, objectFit: 'contain', display: 'block' }}
                        />
                    </div>
                </div>
            )}

            {article.humanized && article.humanizedContent && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button
                        className={`btn ${!showHumanized ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setShowHumanized(false)}
                    >
                        原始版本
                    </button>
                    <button
                        className={`btn ${showHumanized ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        onClick={() => setShowHumanized(true)}
                    >
                        去AI味版本
                    </button>
                </div>
            )}

            <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {showHumanized ? '去AI味版本' : '文章正文'}（文本格式）
                </div>
                <pre style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 14,
                    lineHeight: 1.8,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font)',
                }}>
                    {showHumanized ? displayHumanized : displayContent}
                </pre>
            </div>
        </>
    );
}
