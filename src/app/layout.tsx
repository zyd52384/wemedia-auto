'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const navItems = [
  { href: '/', icon: '📊', label: '仪表盘' },
  { href: '/publish', icon: '🚀', label: '一键发布微信文章' },
  { href: '/articles', icon: '📝', label: '微信文章列表' },
  { href: '/xhs-publish', icon: '📸', label: '小红书生成' },
  { href: '/xhs-notes', icon: '🗂️', label: '小红书图文' },
  { href: '/schedule', icon: '⏰', label: '定时任务' },
  { href: '/settings', icon: '⚙️', label: '设置' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <html lang="zh-CN">
      <head>
        <title>WeMedia Auto · 微信公众号自动发布</title>
        <meta name="description" content="一键生成并发布微信公众号文章" />
      </head>
      <body>
        <div className="app-layout">
          <nav className="sidebar">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">W</div>
              <span className="sidebar-logo-text">WeMedia Auto</span>
            </div>
            <div className="sidebar-nav">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
