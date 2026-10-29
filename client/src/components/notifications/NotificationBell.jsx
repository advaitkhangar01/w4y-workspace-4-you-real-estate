// client/src/components/notifications/NotificationBell.jsx
import React from 'react';
import { useNotifications } from '../../context/NotificationContext';

export default function NotificationBell() {
  const { unreadCount, isDrawerOpen, setIsDrawerOpen } = useNotifications();

  return (
    <button
      onClick={() => setIsDrawerOpen(!isDrawerOpen)}
      className="relative p-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-[#E05A1E]/30"
      title="Notifications"
      aria-label="Toggle notifications drawer"
    >
      {/* Bell Icon */}
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>

      {/* Red Counter Badge */}
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1 text-[11px] font-extrabold text-white bg-[#E05A1E] rounded-full border-2 border-white animate-pulse">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
