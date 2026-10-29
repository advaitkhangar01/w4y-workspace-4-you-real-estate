// client/src/context/NotificationContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthContext';
import api from '../api/client';
import { COMPANY_CONFIG } from '../config/company';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNotificationId, setLastNotificationId] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  const prevUnreadRef = useRef(0);
  const prevMaxIdRef = useRef(0);

  // Helper: Play subtle notification sound chime (optional fallback)
  const playChime = useCallback(() => {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRl9vAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...='); // Short silent fallback or standard beep
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore browser autoplay restriction
    } catch (_) {
      // Audio autoplay restriction ignored
    }
  }, []);

  // 1. Fetch Lightweight Unread Counter
  const checkUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications/unread-count');
      const data = res.data;
      const newUnread = data.unreadCount || 0;
      const newMaxId = data.lastNotificationId || 0;

      // Detect new notification arrival
      if (newMaxId > prevMaxIdRef.current && prevMaxIdRef.current > 0 && newUnread > prevUnreadRef.current) {
        toast.custom((t) => (
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white shadow-xl rounded-xl pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-amber-500/30 p-4`}>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">New Notification 🔔</p>
              <p className="text-sm font-medium text-gray-900 mt-1">You have new activity in {COMPANY_CONFIG.brand}</p>
            </div>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                setIsDrawerOpen(true);
              }}
              className="ml-3 text-xs font-semibold text-[#E05A1E] hover:underline self-center"
            >
              View
            </button>
          </div>
        ), { duration: 4000 });
        playChime();
      }

      setUnreadCount(newUnread);
      setLastNotificationId(newMaxId);
      prevUnreadRef.current = newUnread;
      prevMaxIdRef.current = newMaxId;
    } catch (err) {
      console.error('Error polling unread notifications:', err);
    }
  }, [user, playChime]);

  // 2. Fetch Full Notifications List
  const fetchNotifications = useCallback(async (filterSection = 'all', pageNum = 1, append = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const params = { page: pageNum, limit: 20 };
      if (filterSection !== 'all') params.section = filterSection;

      const res = await api.get('/notifications', { params });
      const data = res.data;

      setNotifications(prev => append ? [...prev, ...data.notifications] : data.notifications);
      setUnreadCount(data.unreadCount);
      setHasMore(data.notifications.length === 20);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching notifications list:', err);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // 3. Mark Single as Read
  const markAsRead = async (id) => {
    try {
      const res = await api.patch(`/notifications/${id}/read`);
      if (res.status === 200) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  // 4. Mark All as Read
  const markAllAsRead = async () => {
    try {
      const res = await api.patch('/notifications/read-all');
      if (res.status === 200) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
        toast.success('All notifications marked as read');
      }
    } catch (err) {
      console.error('Error marking all notifications read:', err);
    }
  };

  // 5. Admin Broadcast Announcement
  const sendBroadcast = async (broadcastData) => {
    try {
      const res = await api.post('/notifications/broadcast', broadcastData);
      const data = res.data;
      toast.success(data.message || 'Announcement broadcasted successfully');
      checkUnreadCount();
      return true;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to send broadcast';
      toast.error(errMsg);
      return false;
    }
  };

  // Setup Smart Polling with Page Visibility API Throttling
  useEffect(() => {
    if (!user) return;

    checkUnreadCount();

    let pollInterval = setInterval(checkUnreadCount, 30000); // 30s active

    const handleVisibilityChange = () => {
      clearInterval(pollInterval);
      if (document.hidden) {
        pollInterval = setInterval(checkUnreadCount, 120000); // 120s inactive
      } else {
        checkUnreadCount();
        pollInterval = setInterval(checkUnreadCount, 30000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, checkUnreadCount]);

  // Refetch list when Drawer opens or Filter changes
  useEffect(() => {
    if (isDrawerOpen) {
      fetchNotifications(activeFilter, 1, false);
    }
  }, [isDrawerOpen, activeFilter, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        loading,
        isDrawerOpen,
        setIsDrawerOpen,
        activeFilter,
        setActiveFilter,
        hasMore,
        page,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        sendBroadcast,
        checkUnreadCount
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  return useContext(NotificationContext);
}
