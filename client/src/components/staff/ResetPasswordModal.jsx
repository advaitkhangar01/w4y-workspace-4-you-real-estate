// client/src/components/staff/ResetPasswordModal.jsx
import { useState } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { Lock, X } from 'lucide-react';

export default function ResetPasswordModal({ userId, userName, onClose }) {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    setLoading(true);
    try {
      await api.patch(`/settings/users/${userId}/reset-password`, { newPassword });
      toast.success(`Password successfully reset for ${userName}`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white rounded-t-2xl">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
            Reset Password
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors p-2 hover:bg-gray-50 rounded-full">
            <X size={16} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-500 font-medium leading-relaxed">
            You are setting a new password for <strong className="text-gray-800">@{userName}</strong>. The employee will need to use this new credential to log in next time.
          </p>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">New Password *</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="password"
                required
                placeholder="Min 6 characters" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
              />
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={loading}
            className="btn-secondary flex-1 justify-center py-2.5 text-xs font-bold"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="btn-primary flex-1 justify-center py-2.5 text-xs font-black uppercase tracking-widest text-[10px] shadow-lg shadow-orange-100"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
