'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Article {
    id: string;
    title: string;
    keyword: string;
    status: string;
    humanized: boolean;
    createdAt: string;
    hasCover: boolean;
    writerStyle: string;
}

export default function ArticlesPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [writerStyleFilter, setWriterStyleFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: '12' });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            if (writerStyleFilter) params.set('writerStyle', writerStyleFilter);

            const res = await fetch(`/api/articles?${params}`);
            const data = await res.json();
            setArticles(data.articles || []);
            setTotal(data.total || 0);
        } catch {
            setArticles([]);
        }
        setLoading(false);
    };

    useEffect(() => { fetchArticles(); }, [page, statusFilter, writerStyleFilter]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchArticles();
    };

    const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`确定删除文章「${title}」吗？此操作不可恢复。`)) return;

        setDeleting(id);
        try {
            const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setArticles(prev => prev.filter(a => a.id !== id));
                setTotal(prev => prev - 1);
            }
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setDeleting(null);
        }
    };

    const statusBadge = (status: string) => {
        const map: Record<string, { cls: string; text: string }> = {
            published: { cls: 'badge-success', text: '已发布' },
            draft: { cls: 'badge-default', text: '草稿' },
            failed: { cls: 'badge-error', text: '失败' },
        };
        const s = map[status] || map.draft;
        return <span className={`badge ${s.cls}`}>{s.text}</span>;
    };

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">📝 文章列表</h1>
                <p className="page-subtitle">共 {total} 篇文章</p>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                        className={`btn ${writerStyleFilter === '' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setWriterStyleFilter(''); setPage(1); }}
                        style={{ padding: '6px 16px' }}
                    >
                        全部
                    </button>
                    <button
                        className={`btn ${writerStyleFilter === 'general' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setWriterStyleFilter('general'); setPage(1); }}
                        style={{ padding: '6px 16px' }}
                    >
                        ✍️ 通用写作
                    </button>
                    <button
                        className={`btn ${writerStyleFilter === 'tech' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setWriterStyleFilter('tech'); setPage(1); }}
                        style={{ padding: '6px 16px' }}
                    >
                        🔬 科技技术
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 24 }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        className="input"
                        placeholder="搜索标题或关键词..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ flex: 1, minWidth: 200 }}
                    />
                    <select
                        className="input"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        style={{ width: 140 }}
                    >
                        <option value="">全部状态</option>
                        <option value="published">已发布</option>
                        <option value="draft">草稿</option>
                        <option value="failed">失败</option>
                    </select>
                    <button type="submit" className="btn btn-primary btn-sm">搜索</button>
                </form>
            </div>

            {loading ? (
                <div className="empty-state">
                    <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
                </div>
            ) : articles.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📭</div>
                    <div className="empty-state-title">暂无文章</div>
                    <div className="empty-state-text">
                        <Link href="/publish" style={{ color: 'var(--accent-purple)' }}>去发布一篇 →</Link>
                    </div>
                </div>
            ) : (
                <>
                    <div className="article-grid">
                        {articles.map(article => (
                            <Link href={`/articles/${article.id}`} className="article-card" key={article.id} style={{ position: 'relative' }}>
                                <button
                                    className="article-delete-btn"
                                    title="删除文章"
                                    disabled={deleting === article.id}
                                    onClick={(e) => handleDelete(e, article.id, article.title)}
                                    style={{
                                        position: 'absolute',
                                        top: 10,
                                        right: 10,
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
                                        opacity: deleting === article.id ? 0.5 : undefined,
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
                                    {deleting === article.id ? '⏳' : '🗑'}
                                </button>
                                <div className="article-card-cover">
                                    {article.hasCover ? (
                                        <img src={`/api/cover/${article.id}`} alt={article.title} loading="lazy" />
                                    ) : '📄'}
                                </div>
                                <div className="article-card-body">
                                    <div className="article-card-title">{article.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                        <span title={article.keyword} style={{
                                            maxWidth: 100,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            🔑 {article.keyword}
                                        </span>
                                        <span style={{
                                            background: 'var(--bg-hover)',
                                            padding: '2px 6px',
                                            borderRadius: 4,
                                            color: article.writerStyle === 'tech' ? 'var(--accent-blue)' : 'var(--text-secondary)'
                                        }}>
                                            {article.writerStyle === 'tech' ? '🔬 科技' : '✍️ 通用'}
                                        </span>
                                        {article.humanized && <span>🧹 已去AI味</span>}
                                    </div>
                                    <div className="article-card-meta">
                                        {statusBadge(article.status)}
                                        <span className="article-card-date">
                                            {new Date(article.createdAt).toLocaleDateString('zh-CN')}
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    {total > 12 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24 }}>
                            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                上一页
                            </button>
                            <span style={{ padding: '6px 12px', fontSize: 14, color: 'var(--text-muted)' }}>
                                第 {page} 页
                            </span>
                            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={articles.length < 12}>
                                下一页
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}
