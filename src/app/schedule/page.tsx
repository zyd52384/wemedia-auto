'use client';

import { useEffect, useState } from 'react';

interface Task {
    id: string;
    name: string;
    keywords: string;
    cronExpr: string;
    useHumanizer: boolean;
    enabled: boolean;
    lastRunAt: string | null;
    createdAt: string;
    _count: { articles: number };
}

export default function SchedulePage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', keywords: '', cronExpr: '0 9 * * *', useHumanizer: false });
    const [loading, setLoading] = useState(true);

    const fetchTasks = async () => {
        const res = await fetch('/api/schedule');
        const data = await res.json();
        setTasks(data.tasks || []);
        setLoading(false);
    };

    useEffect(() => { fetchTasks(); }, []);

    const handleCreate = async () => {
        if (!form.name || !form.keywords) return;
        const keywords = form.keywords.split(/[,，、\n]+/).map(k => k.trim()).filter(Boolean);

        await fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, keywords }),
        });
        setShowModal(false);
        setForm({ name: '', keywords: '', cronExpr: '0 9 * * *', useHumanizer: false });
        fetchTasks();
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        await fetch(`/api/schedule/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !enabled }),
        });
        fetchTasks();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('确定删除此定时任务？')) return;
        await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
        fetchTasks();
    };

    const cronDesc = (expr: string) => {
        const presets: Record<string, string> = {
            '0 9 * * *': '每天 9:00',
            '0 9 * * 1-5': '工作日 9:00',
            '0 */6 * * *': '每6小时',
            '0 0 * * 0': '每周日 0:00',
        };
        return presets[expr] || expr;
    };

    return (
        <>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="page-title">⏰ 定时任务</h1>
                    <p className="page-subtitle">自动化定时生成并发布文章</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    ＋ 新建任务
                </button>
            </div>

            {loading ? (
                <div className="empty-state">
                    <div className="spinner" style={{ width: 32, height: 32, borderColor: 'var(--border)', borderTopColor: 'var(--accent-purple)' }} />
                </div>
            ) : tasks.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">⏰</div>
                    <div className="empty-state-title">暂无定时任务</div>
                    <div className="empty-state-text">点击"新建任务"创建你的第一个自动发布任务</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {tasks.map(task => (
                        <div className="card" key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{task.name}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                    <span>🕐 {cronDesc(task.cronExpr)}</span>
                                    <span>📝 {task._count.articles} 篇文章</span>
                                    <span>🔑 {JSON.parse(task.keywords).join(', ')}</span>
                                    {task.useHumanizer && <span>🧹 去AI味</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div
                                    className={`toggle ${task.enabled ? 'active' : ''}`}
                                    onClick={() => handleToggle(task.id, task.enabled)}
                                >
                                    <div className="toggle-knob" />
                                </div>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(task.id)}>删除</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">新建定时任务</h3>

                        <div className="input-group">
                            <label className="input-label">任务名称</label>
                            <input className="input" placeholder="例如：每日AI资讯" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                        </div>

                        <div className="input-group">
                            <label className="input-label">关键词列表（逗号分隔）</label>
                            <input className="input" placeholder="AI最新动态, ChatGPT, 数字经济" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} />
                        </div>

                        <div className="input-group">
                            <label className="input-label">执行频率（定时表达式）</label>
                            <select className="input" value={form.cronExpr} onChange={e => setForm({ ...form, cronExpr: e.target.value })}>
                                <option value="0 9 * * *">每天 9:00</option>
                                <option value="0 9 * * 1-5">工作日 9:00</option>
                                <option value="0 */6 * * *">每6小时</option>
                                <option value="0 0 * * 0">每周日 0:00</option>
                            </select>
                        </div>

                        <div className="toggle-group">
                            <div className={`toggle ${form.useHumanizer ? 'active' : ''}`} onClick={() => setForm({ ...form, useHumanizer: !form.useHumanizer })}>
                                <div className="toggle-knob" />
                            </div>
                            <span className="toggle-label">去除 AI 痕迹</span>
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>取消</button>
                            <button className="btn btn-primary" onClick={handleCreate} disabled={!form.name || !form.keywords}>创建</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
