// client/src/components/notifications/NotificationDrawer.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../context/NotificationContext';
import { useAuth } from '../../context/AuthContext';

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSecs = Math.floor((now - past) / 1000);

  if (diffInSecs < 60) return 'Just now';
  const diffInMins = Math.floor(diffInSecs / 60);
  if (diffInMins < 60) return `${diffInMins}m ago`;
  const diffInHours = Math.floor(diffInMins / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return past.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function NotificationDrawer() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    isDrawerOpen,
    setIsDrawerOpen,
    notifications,
    loading,
    unreadCount,
    activeFilter,
    setActiveFilter,
    markAsRead,
    markAllAsRead,
    sendBroadcast,
    fetchNotifications
  } = useNotifications();

  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    target_role: '',
    action_url: ''
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  if (!isDrawerOpen) return null;

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'projects', label: 'Projects' },
    { key: 'leaves', label: 'Leaves' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'daily_reports', label: 'Reports' },
    { key: 'system', label: 'System' },
  ];

  const handleNotificationClick = (item) => {
    if (!item.is_read) {
      markAsRead(item.id);
    }
    if (item.action_url) {
      setIsDrawerOpen(false);
      navigate(item.action_url);
    }
  };

  const handleBroadcastSubmit = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title.trim() || !broadcastForm.message.trim()) return;

    setIsBroadcasting(true);
    const success = await sendBroadcast(broadcastForm);
    setIsBroadcasting(false);

    if (success) {
      setBroadcastForm({ title: '', message: '', target_role: '', action_url: '' });
      setShowBroadcastModal(false);
    }
  };

  const getSectionBadgeStyle = (section) => {
    switch (section) {
      case 'tasks':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'projects':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'leaves':
      case 'attendance':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'invoices':
      case 'accounting':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'daily_reports':
        return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'system':
      default:
        return 'bg-red-100 text-red-800 border-red-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => setIsDrawerOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-[#E05A1E] text-white rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Stay updated on your daily activities</p>
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs font-medium text-[#E05A1E] hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-200/50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-3 border-b border-gray-100 bg-white flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
                  activeFilter === f.key
                    ? 'bg-[#E05A1E] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Admin Broadcast Button (Only for admin role) */}
          {user?.role === 'admin' && (
            <div className="px-4 py-2 border-b border-gray-100 bg-amber-50/50 flex justify-between items-center">
              <span className="text-xs text-amber-800 font-medium">Admin Control Center</span>
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="text-xs px-3 py-1 font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm flex items-center gap-1"
              >
                <span>📢</span> Send Broadcast
              </button>
            </div>
          )}

          {/* Notifications Content Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading && notifications.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-8 h-8 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-500">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                  🔔
                </div>
                <p className="text-sm font-semibold text-gray-800">No notifications found</p>
                <p className="text-xs text-gray-500 mt-1">You are all caught up for this section.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                    !item.is_read
                      ? 'bg-amber-50/30 border-amber-200/80 shadow-sm hover:border-amber-300'
                      : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  {/* Unread indicator dot */}
                  {!item.is_read && (
                    <span className="absolute top-3.5 left-2 w-2 h-2 bg-[#E05A1E] rounded-full" />
                  )}

                  <div className={!item.is_read ? 'pl-3' : ''}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase border ${getSectionBadgeStyle(item.section)}`}>
                        {item.section.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-gray-400 font-medium">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-gray-900 leading-snug">{item.title}</h4>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{item.message}</p>

                    {item.action_url && (
                      <div className="mt-2 text-[11px] font-semibold text-[#E05A1E] hover:underline flex items-center gap-1">
                        <span>View details</span>
                        <span>→</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Admin Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>📢</span> Broadcast Announcement
              </h3>
              <button onClick={() => setShowBroadcastModal(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleBroadcastSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Announcement Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Office Holiday Notice"
                  value={broadcastForm.title}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E05A1E]/30 focus:border-[#E05A1E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Announcement Message</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Enter details of your announcement for staff..."
                  value={broadcastForm.message}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E05A1E]/30 focus:border-[#E05A1E]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Target Role (Optional)</label>
                <select
                  value={broadcastForm.target_role}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, target_role: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#E05A1E]/30 focus:border-[#E05A1E]"
                >
                  <option value="">All Roles (Entire Staff)</option>
                  <option value="employee">Employees</option>
                  <option value="project_head">Project Heads</option>
                  <option value="design_head">Design Heads</option>
                  <option value="back_office">Back Office / Accounts</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBroadcasting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#E05A1E] hover:bg-[#c84d16] rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isBroadcasting ? 'Broadcasting...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
