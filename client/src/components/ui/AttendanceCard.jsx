// client/src/components/ui/AttendanceCard.jsx
import { useState } from 'react';
import api from '../../api/client';
import { formatTimeIST } from '../../utils/time';
import { mapAttendance } from '../../utils/attendance';
import toast from 'react-hot-toast';

export default function AttendanceCard({ attendance, onAction }) {
  const [locLoading, setLocLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const hasCheckedIn = !!attendance?.checkIn;
  const hasCheckedOut = !!attendance?.checkOut;

  async function getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,   // required for geo-fence effective-distance calc
        }),
        (err) => reject(new Error('Location access denied. Please allow location.')),
        { timeout: 10000, maximumAge: 0, enableHighAccuracy: true }
      );
    });
  }

  async function handleCheckIn() {
    setLocLoading(true);
    let coords = {};
    try {
      coords = await getLocation();
    } catch (err) {
      toast(err.message, { icon: '📍' });
    } finally {
      setLocLoading(false);
    }

    setActionLoading(true);
    try {
      await api.post('/attendance/checkin', coords);
      toast.success('Checked in! Have a great day 🌅');
      
      const updated = await api.get('/attendance/today');
      // The backend now returns { attendance: [], my_attendance: {} }
      onAction(mapAttendance(updated.data.my_attendance));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut() {
    setActionLoading(true);
    try {
      const { data } = await api.post('/attendance/checkout');
      toast.success(data.message || 'Checked out! See you tomorrow 👋');
      
      const updated = await api.get('/attendance/today');
      // The backend now returns { attendance: [], my_attendance: {} }
      onAction(mapAttendance(updated.data.my_attendance));
    } catch (err) {
      console.error('Check-out error:', err);
      toast.error(err.response?.data?.error || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  }

  const status = !attendance ? 'absent'
    : !hasCheckedIn ? 'absent'
    : hasCheckedOut ? 'completed'
    : 'working';

  const statusLabels = {
    absent: { label: 'Not yet checked in', badge: 'badge-absent' },
    working: { label: 'Currently working', badge: 'badge-working' },
    completed: { label: 'Day completed', badge: 'badge-completed' },
  };

  const s = statusLabels[status];

  return (
    <div className="card shadow-sm flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-[#1A1A1A]">Your Attendance</h3>
          <span className={`badge ${s.badge}`}>{s.label}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#F5F5F5] rounded-lg border border-[#E0E0E0] p-3 text-center">
            <p className="text-xs text-muted mb-1">Check-In</p>
            <p className={`text-sm font-bold ${hasCheckedIn ? 'text-emerald-600' : 'text-muted'}`}>
              {hasCheckedIn ? formatTimeIST(attendance.checkIn) : '—'}
            </p>
          </div>
          <div className="bg-[#F5F5F5] rounded-lg border border-[#E0E0E0] p-3 text-center">
            <p className="text-xs text-muted mb-1">Check-Out</p>
            <p className={`text-sm font-bold ${hasCheckedOut ? 'text-blue-600' : 'text-muted'}`}>
              {hasCheckedOut ? formatTimeIST(attendance.checkOut) : '—'}
            </p>
          </div>
        </div>

        {attendance?.lat && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted mb-4 bg-orange-50/50 p-1.5 rounded border border-orange-100/50 self-start w-fit">
            <span className="text-orange-400">📍</span>
            <span>{parseFloat(attendance.lat).toFixed(4)}, {parseFloat(attendance.lng).toFixed(4)} (Verified)</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleCheckIn}
          disabled={hasCheckedIn || actionLoading || locLoading}
          className="btn-success flex-1 justify-center py-2.5 shadow-sm shadow-emerald-200/50"
        >
          {(actionLoading && !hasCheckedIn) || locLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Check-In</span>
            </>
          )}
        </button>
        <button
          onClick={handleCheckOut}
          disabled={!hasCheckedIn || hasCheckedOut || actionLoading}
          className="btn-secondary flex-1 justify-center py-2.5 disabled:opacity-40"
        >
          {actionLoading && hasCheckedIn && !hasCheckedOut ? (
            <div className="w-4 h-4 border-2 border-[#CCCCCC] border-t-[#6B6B6B] rounded-full animate-spin" />
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>Check-Out</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
