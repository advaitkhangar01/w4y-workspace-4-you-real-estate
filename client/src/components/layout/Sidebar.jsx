// client/src/components/layout/Sidebar.jsx
// Collapsible sidebar with role-aware navigation

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useState } from 'react'; // eslint-disable-line no-unused-vars
import { COMPANY_CONFIG } from '../../config/company';

const ADMIN_LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/admin/profile', label: 'My Profile', icon: 'user' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/builder', label: 'Builder', icon: 'construction' },
  { to: '/tasks', label: 'Tasks', icon: 'check_square' },
  { to: '/vendors', label: 'Vendors', icon: 'tool' },
  { to: '/clients', label: 'Clients', icon: 'users' },
  { to: '/admin/staff', label: 'Staff', icon: 'briefcase' },
  { to: '/attendance', label: 'Attendance', icon: 'clock' },
  { to: '/daily-reports', label: 'Daily Reports', icon: 'file_spreadsheet' },
  { to: '/admin/invoice', label: 'Invoice', icon: 'receipt' },
  { to: '/admin/accounting', label: 'Accounting', icon: 'calculator' },
  {to: '/admin/reports', label: 'Reports', icon: 'file_spreadsheet'},
  {to: '/admin/history', label: 'History', icon: 'archive'},
  {to: '/admin/settings', label: 'Settings', icon: 'settings'},
];

// Accounts: financial-first nav, no settings
const ACCOUNTS_LINKS = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/admin/profile', label: 'My Profile', icon: 'user' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/builder', label: 'Builder', icon: 'construction' },
  { to: '/tasks', label: 'Tasks', icon: 'check_square' },
  { to: '/admin/invoice', label: 'Invoice', icon: 'receipt' },
  { to: '/admin/accounting', label: 'Accounting', icon: 'calculator' },
  { to: '/admin/reports', label: 'Reports', icon: 'file_spreadsheet' },
  { to: '/clients', label: 'Clients', icon: 'users' },
  { to: '/vendors', label: 'Vendors', icon: 'tool' },
  { to: '/attendance', label: 'Attendance', icon: 'clock' },
  { to: '/daily-reports', label: 'Daily Reports', icon: 'file_spreadsheet' },
  { to: '/admin/history', label: 'History', icon: 'archive' },
];

const EMP_LINKS = [
  { to: '/employee/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/employee/profile', label: 'My Profile', icon: 'user' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/builder', label: 'Builder', icon: 'construction' },
  { to: '/tasks', label: 'Tasks', icon: 'check_square' },
  { to: '/attendance', label: 'Attendance', icon: 'clock' },
  { to: '/daily-reports', label: 'Daily Reports', icon: 'file_spreadsheet' },
  { to: '/clients', label: 'Clients', icon: 'users' },
  { to: '/vendors', label: 'Vendors', icon: 'tool' },
];

// Project Head / Design Head: Projects, Tasks, Clients, Vendors, Attendance & Daily Reports
const PROJECT_DESIGN_HEAD_LINKS = [
  { to: '/employee/dashboard', label: 'Dashboard', icon: 'grid' },
  { to: '/employee/profile', label: 'My Profile', icon: 'user' },
  { to: '/projects', label: 'Projects', icon: 'folder' },
  { to: '/builder', label: 'Builder', icon: 'construction' },
  { to: '/tasks', label: 'Tasks', icon: 'check_square' },
  { to: '/clients', label: 'Clients', icon: 'users' },
  { to: '/attendance', label: 'Attendance', icon: 'clock' },
  { to: '/daily-reports', label: 'Daily Reports', icon: 'file_spreadsheet' },
  { to: '/vendors', label: 'Vendors', icon: 'tool' },
];

const ICONS = {
  construction: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 22l10-10"/>
      <path d="M9 5l4 4"/>
      <path d="M15 3l6 6-4 4-6-6 4-4z"/>
      <path d="M14 10l-1.5 1.5"/>
    </svg>
  ),
  check_square: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  folder: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  briefcase: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  tool: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  receipt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
      <path d="M16 14H8" />
      <path d="M16 18H8" />
      <path d="M16 10h-2" />
      <path d="M8 10h.01" />
    </svg>
  ),
  calculator: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
      <line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/>
      <path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  file_spreadsheet: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="10" y1="9" x2="10" y2="9" />
    </svg>
  ),
  archive: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  ),
};

export default function Sidebar({ collapsed = false, onClose }) {
  const { user, logout, isAdmin, isAccounts, isProjectOrDesignHead } = useAuth();
  const navigate = useNavigate();
  
  const links = isAdmin 
    ? ADMIN_LINKS 
    : (isAccounts 
        ? ACCOUNTS_LINKS
        : (isProjectOrDesignHead
            ? PROJECT_DESIGN_HEAD_LINKS
            : EMP_LINKS));

  function handleLogout() {
    logout();
    toast.success('Signed out');
    navigate('/login');
  }

  return (
    <aside className="w-full h-full bg-white/70 backdrop-blur-md border-r border-[#E2E8F0]/60 flex flex-col overflow-hidden transition-all duration-300 shadow-lg shadow-slate-100/50">
      {/* Logo Section */}
      <div className="p-4 border-b border-[#E2E8F0]/60 bg-transparent relative z-10 flex-shrink-0">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="h-9 flex-shrink-0 flex items-center justify-center">
            <img src={COMPANY_CONFIG.logoUrl} alt={COMPANY_CONFIG.brand} className="h-8 w-auto max-w-full object-contain" />
          </div>
          <div className={`min-w-0 transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
            <div className="text-sm font-black text-[#1A1A1A] leading-tight truncate uppercase tracking-tight whitespace-nowrap">{COMPANY_CONFIG.brand}</div>
            <div className="text-[10px] font-bold text-[#E05A1E] uppercase tracking-widest whitespace-nowrap">
              {user?.role === 'design_head' ? 'Design Head' :
               user?.role === 'design' ? 'Design' :
               user?.role === 'back_office' ? 'Back Office' :
               user?.role === 'accounts' ? 'Accounts Dept.' :
               user?.role === 'liasoning' ? 'Liasoning' :
               user?.role === 'civil_engineer' ? 'Civil Engineer' :
               user?.role === 'project_head' ? 'Project Head' :
               user?.role}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            title={collapsed ? link.label : undefined}
            className={({ isActive }) =>
              `sidebar-link hover:bg-white/60 transition-all duration-200 ${collapsed ? 'justify-center !px-0 mx-1 rounded-lg' : ''} ${isActive ? 'active' : ''} ${collapsed && isActive ? '!pl-0 !border-l-0 bg-[#FFF4EE]/70 backdrop-blur-sm' : ''}`
            }
          >
            <div className="flex-shrink-0 flex items-center justify-center">
              {ICONS[link.icon]}
            </div>
            <span className={`font-bold tracking-tight whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
              {link.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-[#E2E8F0]/60 bg-white/30 backdrop-blur-sm flex-shrink-0">
        <div 
          className={`flex items-center ${collapsed ? 'justify-center !px-0' : 'gap-3 px-3'} py-2 mb-2`}
          title={collapsed ? `${user?.name} (${user?.department || user?.role})` : undefined}
        >
          <div className="w-8 h-8 rounded-full bg-orange-50/80 border border-orange-200/60 flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-[#E05A1E] text-xs font-black">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className={`overflow-hidden transition-all duration-300 ${collapsed ? 'opacity-0 w-0 h-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
            <div className="text-sm font-bold text-[#1A1A1A] truncate whitespace-nowrap">{user?.name?.split(' ')[0]}</div>
            <div className="text-[10px] font-bold text-gray-400 uppercase truncate whitespace-nowrap">{user?.department || user?.role}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign Out" : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center !px-0' : 'gap-3 px-3'} py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-red-500 hover:bg-red-50/60 hover:text-red-600 transition-all duration-200`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span className={`whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0 h-0 overflow-hidden' : 'opacity-100 w-auto'}`}>
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  );
}
