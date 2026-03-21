'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Stats {
  total: number;
  published: number;
  draft: number;
  failed: number;
}

interface RecentArticle {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ total: 0, published: 0, draft: 0, failed: 0 });
  const [recent, setRecent] = useState<RecentArticle[]>([]);

  useEffect(() => {
    fetch('/api/articles?limit=5')
      .then(res => res.json())
      .then(data => {
        setRecent(data.articles || []);
        const articles = data.articles || [];
        setStats({
          total: data.total || 0,
          published: articles.filter((a: RecentArticle) => a.status === 'published').length,
          draft: articles.filter((a: RecentArticle) => a.status === 'draft').length,
          failed: articles.filter((a: RecentArticle) => a.status === 'failed').length,
        });
      })
      .catch(() => { });
  }, []);

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; text: string }> = {
      published: { cls: 'badge-success', text: '✅ 已发布' },
      draft: { cls: 'badge-default', text: '📝 草稿' },
      failed: { cls: 'badge-error', text: '❌ 失败' },
    };
    const s = map[status] || map.draft;
    return <span className={`badge ${s.cls}`}>{s.text}</span>;
  };

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">仪表盘</h1>
        <p className="page-subtitle">WeMedia Auto · 微信公众号自动发布平台</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-label">总文章数</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-label">已发布</div>
          <div className="stat-value">{stats.published}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-label">草稿</div>
          <div className="stat-value">{stats.draft}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-label">失败</div>
          <div className="stat-value">{stats.failed}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>快速操作</h2>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/publish" className="btn btn-primary">🚀 一键发布</Link>
          <Link href="/schedule" className="btn btn-secondary">⏰ 定时任务</Link>
          <Link href="/articles" className="btn btn-secondary">📝 文章列表</Link>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>最近文章</h2>
        {recent.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-title">暂无文章</div>
            <div className="empty-state-text">点击"一键发布"开始创建你的第一篇文章</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(article => (
                  <tr key={article.id}>
                    <td>
                      <Link href={`/articles/${article.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
                        {article.title}
                      </Link>
                    </td>
                    <td>{statusBadge(article.status)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {new Date(article.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
