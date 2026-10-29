// client/src/components/layout/AppLayout.jsx
// Main shell - sidebar + content with mobile hamburger

import { useState } from 'react';
import Sidebar from './Sidebar';
import NotificationBell from '../notifications/NotificationBell';
import NotificationDrawer from '../notifications/NotificationDrawer';
import { COMPANY_CONFIG } from '../../config/company';

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const newVal = !prev;
      try {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(newVal));
      } catch (e) {
        console.error(e);
      }
      return newVal;
    });
  };

  return (
    <div className="flex min-h-screen bg-base">
      {/* Slide-over Notification Center Drawer */}
      <NotificationDrawer />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - desktop always visible, mobile slide-in */}
      <div className={`
        no-print
        fixed lg:sticky top-0 z-30 h-screen transition-all duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        w-60 ${collapsed ? 'lg:w-20' : 'lg:w-60'}
      `}>
        <Sidebar collapsed={collapsed} onClose={() => setSidebarOpen(false)} />
        
        {/* Collapse Toggle Button (Desktop Only) */}
        <button
          onClick={handleToggleCollapse}
          className="hidden lg:flex absolute top-6 -right-3.5 z-40 w-7 h-7 items-center justify-center bg-white border border-[#E0E0E0] rounded-full shadow-sm text-slate-500 hover:text-slate-900 hover:scale-110 active:scale-95 transition-all duration-200"
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {collapsed ? (
              <path d="M9 18l6-6-6-6" />
            ) : (
              <path d="M15 18l-6-6 6-6" />
            )}
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar (Desktop & Mobile) */}
        <header className="no-print sticky top-0 z-10 glass border-b border-[#E0E0E0] px-4 lg:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#F0F0F0] text-muted"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <img src={COMPANY_CONFIG.logoUrl} alt={COMPANY_CONFIG.brand} className="h-7 w-auto object-contain rounded lg:hidden" />
              <span className="font-semibold text-[#1A1A1A] text-sm hidden sm:inline">{COMPANY_CONFIG.brand}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
