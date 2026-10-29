/* eslint-disable react-hooks/set-state-in-effect */
// client/src/components/staff/UserModal.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { 
  User, 
  Mail, 
  Lock, 
  Briefcase, 
  Phone, 
  IndianRupee, 
  X,
  ShieldAlert
} from 'lucide-react';

export default function UserModal({ user: initialUser, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'employee',
    department: '',
    phone: '',
    base_salary: '',
    hourly_rate: '',
    batch_id: ''
  });

  useEffect(() => {
    // Fetch batches list on mount
    api.get('/settings/batches')
      .then(({ data }) => setBatches(data || []))
      .catch(err => console.error('Failed to load batches', err));
  }, []);

  useEffect(() => {
    if (initialUser) {
      setForm({
        name: initialUser.name || '',
        username: initialUser.username || '',
        password: '', // Password is not loaded for security
        role: initialUser.role || 'employee',
        department: initialUser.department || '',
        phone: initialUser.phone || '',
        base_salary: initialUser.base_salary || '',
        hourly_rate: initialUser.hourly_rate || '',
        batch_id: initialUser.batch_id || ''
      });
    }
  }, [initialUser]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Full Name is required');
    if (!form.username.trim()) return toast.error('Username is required');
    
    // Password required only for new users
    if (!initialUser && !form.password.trim()) {
      return toast.error('Password is required');
    }
    if (!initialUser && form.password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    setLoading(true);
    const b = batches.find(batch => String(batch.id) === String(form.batch_id));
    const hrs = b?.min_working_hours ? parseFloat(b.min_working_hours) : 9.0;
    const base = parseFloat(form.base_salary) || 0;
    const computedHourly = base > 0 ? parseFloat((base / (30 * hrs)).toFixed(2)) : 0;
    const payload = {
      ...form,
      name: form.name.trim(),
      username: form.username.trim().toLowerCase(),
      base_salary: base,
      hourly_rate: computedHourly,
      batch_id: form.batch_id ? parseInt(form.batch_id) : null
    };

    try {
      if (initialUser?.id) {
        await api.patch(`/settings/users/${initialUser.id}`, payload);
        toast.success('Employee profile updated');
      } else {
        await api.post('/settings/users', payload);
        toast.success('Employee registered successfully');
      }
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-gray-200 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white rounded-t-2xl">
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
            {initialUser ? 'Edit Employee Profile' : 'Register New Employee'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors p-2 hover:bg-gray-50 rounded-full">
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          
          {/* Section: Basic Identity */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <User size={18} />
              <h4 className="text-xs font-black uppercase tracking-wider">Basic Identity</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Full Name *</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patel" 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Username *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
                  <input 
                    type="text"
                    required
                    placeholder="ramesh" 
                    value={form.username} 
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>
            </div>

            {!initialUser && (
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Temporary Password *</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="password"
                    required
                    placeholder="Min 6 characters" 
                    value={form.password} 
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Organization & Contact */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-primary">
              <Briefcase size={18} />
              <h4 className="text-xs font-black uppercase tracking-wider">Organization &amp; Contact</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-bold text-gray-700 outline-none"
                >
                  <option value="employee">Employee</option>
                  <option value="civil_engineer">Civil Engineer</option>
                  <option value="liasoning">Liasoning</option>
                  <option value="design">Design</option>
                  <option value="design_head">Design Head</option>
                  <option value="back_office">Back Office</option>
                  <option value="project_head">Project Head</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Department</label>
                <input 
                  type="text"
                  placeholder="e.g. Interior Design" 
                  value={form.department} 
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input 
                    type="text"
                    placeholder="9876543210" 
                    value={form.phone} 
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-primary font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Attendance Batch</label>
                <select
                  value={form.batch_id || ''}
                  onChange={(e) => setForm({ ...form, batch_id: e.target.value })}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-bold text-gray-700 outline-none"
                >
                  <option value="">Default (Global Settings)</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Contract Compensation */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-primary">
              <IndianRupee size={18} />
              <h4 className="text-xs font-black uppercase tracking-wider">Contract Compensation</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">Base Monthly Salary (₹)</label>
                <input 
                  type="number"
                  placeholder="e.g. 35000" 
                  value={form.base_salary} 
                  onChange={(e) => {
                    const sal = e.target.value;
                    const b = batches.find(batch => String(batch.id) === String(form.batch_id));
                    const hrs = b?.min_working_hours ? parseFloat(b.min_working_hours) : 9.0;
                    const autoRate = parseFloat(sal) > 0 ? (parseFloat(sal) / (30 * hrs)).toFixed(2) : form.hourly_rate;
                    setForm({ ...form, base_salary: sal, hourly_rate: autoRate });
                  }}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Hourly Rate (₹/hr)</label>
                  <span className="text-[9px] font-bold text-primary bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                    Auto: Base / (30 × {batches.find(b => String(b.id) === String(form.batch_id))?.min_working_hours || 9}h)
                  </span>
                </div>
                <input 
                  type="text"
                  value={parseFloat(form.base_salary) > 0 
                    ? `₹${(parseFloat(form.base_salary) / (30 * (parseFloat(batches.find(b => String(b.id) === String(form.batch_id))?.min_working_hours || 9.0)))).toFixed(2)}/hr`
                    : '₹0.00/hr'} 
                  readOnly
                  disabled
                  className="w-full border rounded-xl px-4 py-2.5 text-sm font-mono font-bold bg-gray-100/70 text-gray-500 border-gray-200 cursor-not-allowed select-none"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            disabled={loading}
            className="btn-secondary flex-1 justify-center py-3"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="btn-primary flex-1 justify-center py-3 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-orange-100"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (initialUser ? 'Save Updates' : 'Register Employee')}
          </button>
        </div>
      </div>
    </div>
  );
}
