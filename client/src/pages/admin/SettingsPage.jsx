/* eslint-disable no-unused-vars, react-hooks/immutability, react-hooks/exhaustive-deps */
import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import {
  Users,
  Clock,
  Calendar as CalendarIcon,
  Trash2,
  Plus,
  Shield,
  UserPlus,
  Key,
  Lock,
  Search,
  RefreshCw,
  X,
  MapPin,
  AlertTriangle,
  Server,
  Zap,
  Pencil,
  Layers,
  Archive,
  RotateCcw,
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('payroll');
  const [loading, setLoading] = useState(true);
  
  // Users State
  const [users, setUsers] = useState([]);
  const [userSubTab, setUserSubTab] = useState('active'); // 'active' | 'deactivated'
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'employee', department: '', phone: '', base_salary: '', hourly_rate: '', batch_id: '' });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState({ id: null, name: '', username: '', role: 'employee', department: '', phone: '', base_salary: '', hourly_rate: '', batch_id: '' });
  
  // Password Reset State
  const [resetModal, setResetModal] = useState({ show: false, userId: null, userName: '', newPassword: '' });

  // Batches State
  const [batches, setBatches] = useState([]);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [newBatch, setNewBatch] = useState({ name: '', office_start_time: '10:00', late_threshold_time: '10:15', half_day_cutoff_time: '13:00', min_working_hours: '9' });
  const [editingBatch, setEditingBatch] = useState({ id: null, name: '', office_start_time: '', late_threshold_time: '', half_day_cutoff_time: '', min_working_hours: '' });
  const [recalculating, setRecalculating] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Payroll Rules State
  const [payrollSettings, setPayrollSettings] = useState({
    office_start_time: '10:00',
    late_threshold_time: '10:15',
    late_penalty_rule_count: '3',
    late_penalty_rule_days: '0.5',
    half_day_cutoff_time: '13:00',
    min_working_hours: '9',
    // legacy fields
    late_threshold_mins: '15',
    late_penalty_amount: '50',
    half_day_threshold_hours: '4',
    half_day_penalty_percent: '50',
  });

  // Geo-fence State
  const [geoSettings, setGeoSettings] = useState({
    geofence_enabled:       'false',
    office_lat:             '',
    office_lng:             '',
    geofence_strict_radius: '25',
    geofence_buffer_radius: '50',
    geofence_max_accuracy:  '50',
  });

  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', is_paid: true });

  // Attendance Dropdowns Master State
  const [dropdowns, setDropdowns] = useState([]);
  const [activeDropdownTab, setActiveDropdownTab] = useState('request_category');
  const [showDropdownModal, setShowDropdownModal] = useState(false);
  const [editingDropdown, setEditingDropdown] = useState({ id: null, category: 'request_category', key: '', label: '', description: '', color: 'slate', display_order: 1, is_active: true });

  // Factory Reset State
  const [resetStep, setResetStep] = useState(1); // 1: Warning, 2: Preview/Confirm, 3: Success
  const [resetPreview, setResetPreview] = useState(null);
  const [resetConfirmCode, setResetConfirmCode] = useState('');
  const [userInputCode, setUserInputCode] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSummary, setResetSummary] = useState(null);

  useEffect(() => {
    fetchData();
  }, [activeTab, userSubTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const { data } = await api.get(`/settings/users?status=${userSubTab}`);
        setUsers(data.users || []);
        // Fetch batches to populate selector in user modals
        const { data: batchData } = await api.get('/settings/batches');
        setBatches(batchData || []);
      } else if (activeTab === 'batches') {
        const { data } = await api.get('/settings/batches');
        setBatches(data || []);
      } else if (activeTab === 'dropdowns') {
        const { data } = await api.get('/settings/dropdowns?all=true');
        setDropdowns(data || []);
      } else if (activeTab === 'payroll') {
        const { data } = await api.get('/settings/app');
        setPayrollSettings(prev => ({ ...prev, ...data }));
        const { data: batchData } = await api.get('/settings/batches');
        setBatches(batchData || []);
      } else if (activeTab === 'holidays') {
        const { data } = await api.get('/settings/holidays');
        setHolidays(data || []);
      } else if (activeTab === 'geofence') {
        const { data } = await api.get('/settings/app');
        setGeoSettings(prev => ({ ...prev, ...data }));
      } else if (activeTab === 'reset') {
        // Reset state when entering tab
        setResetStep(1);
        setResetPreview(null);
        setResetConfirmCode('');
        setUserInputCode('');
        setResetSummary(null);
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Memoized Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;
      return userSubTab === 'deactivated' ? u.is_active === false : u.is_active !== false;
    });
  }, [users, searchQuery, userSubTab]);

  // User Handlers
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (isSubmittingUser) return;
    setIsSubmittingUser(true);
    try {
      await api.post('/settings/users', newUser);
      toast.success('User created successfully');
      setShowUserModal(false);
      setNewUser({ name: '', username: '', password: '', role: 'employee', department: '', phone: '', base_salary: '', hourly_rate: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (isSubmittingUser) return;
    setIsSubmittingUser(true);
    try {
      await api.patch(`/settings/users/${editingUser.id}`, editingUser);
      toast.success('User updated successfully');
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/settings/users/${id}`);
      toast.success('User deleted');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleRestoreUser = async (u) => {
    if (!window.confirm(`Are you sure you want to reactivate ${u.name}? They will regain login access and reappear in active operational lists.`)) return;
    try {
      await api.patch(`/settings/users/${u.id}/restore`);
      toast.success(`${u.name} reactivated successfully`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reactivate user');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/settings/users/${resetModal.userId}/reset-password`, { 
        newPassword: resetModal.newPassword 
      });
      toast.success(`Password reset for ${resetModal.userName}`);
      setResetModal({ show: false, userId: null, userName: '', newPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed');
    }
  };

  // Geo-fence Handlers
  const handleUpdateGeoSettings = async (e) => {
    e.preventDefault();
    // Safeguard: cannot enable without lat/lng
    if (geoSettings.geofence_enabled === 'true') {
      if (!geoSettings.office_lat || !geoSettings.office_lng) {
        toast.error('Set office latitude and longitude before enabling geo-fence');
        return;
      }
    }
    try {
      await api.post('/settings/app', geoSettings);
      toast.success('Geo-fence settings saved');
    } catch (err) {
      toast.error('Failed to save geo-fence settings');
    }
  };

  // Payroll Handlers
  const handleUpdatePayrollSettings = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/app', payrollSettings);
      toast.success('Payroll rules updated');
    } catch (err) {
      toast.error('Failed to update settings');
    }
  };

  // Factory Reset Handlers
  const handleLoadResetPreview = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/factory-reset/preview');
      setResetPreview(data.counts);
      setResetConfirmCode(data.confirmationCode);
      setResetStep(2);
    } catch (err) {
      toast.error('Failed to load reset preview');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteReset = async () => {
    if (userInputCode !== resetConfirmCode) {
      toast.error('Invalid confirmation code');
      return;
    }

    setIsResetting(true);
    try {
      const { data } = await api.delete('/settings/factory-reset', {
        data: { confirmationCode: userInputCode }
      });
      setResetSummary(data.summary);
      setResetStep(3);
      toast.success('System reset successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Factory reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  // Holiday Handlers
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/holidays', newHoliday);
      toast.success('Holiday added');
      setNewHoliday({ date: '', name: '', is_paid: true });
      fetchData();
    } catch (err) {
      toast.error('Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (id) => {
    try {
      await api.delete(`/settings/holidays/${id}`);
      toast.success('Holiday removed');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  // Batch Handlers
  const handleCreateBatch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/batches', newBatch);
      toast.success('Attendance batch created successfully');
      setShowBatchModal(false);
      setNewBatch({ name: '', office_start_time: '10:00', late_threshold_time: '10:15', half_day_cutoff_time: '13:00', min_working_hours: '9' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create batch');
    }
  };

  const handleRecalculateAllAttendance = async () => {
    if (!window.confirm('Are you sure you want to recalculate past attendance for all employees against their current assigned batches?')) return;
    setRecalculating(true);
    try {
      const { data } = await api.post('/settings/batches/recalculate');
      toast.success(data.message || 'Past attendance records recalculated successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to recalculate attendance');
    } finally {
      setRecalculating(false);
    }
  };

  const handleUpdateBatch = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/settings/batches/${editingBatch.id}`, editingBatch);
      toast.success('Attendance batch updated & past records recalculated');
      setShowEditBatchModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update batch');
    }
  };

  const handleDeleteBatch = async (id) => {
    if (!window.confirm('Are you sure you want to delete this batch? All users assigned to it will fallback to global settings.')) return;
    try {
      await api.delete(`/settings/batches/${id}`);
      toast.success('Attendance batch deleted & records recalculated');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete batch');
    }
  };

  // Dropdown Handlers
  const handleSaveDropdown = async (e) => {
    e.preventDefault();
    try {
      if (editingDropdown.id) {
        await api.put(`/settings/dropdowns/${editingDropdown.id}`, editingDropdown);
        toast.success('Dropdown option updated successfully');
      } else {
        await api.post('/settings/dropdowns', editingDropdown);
        toast.success('Dropdown option created successfully');
      }
      setShowDropdownModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save dropdown option');
    }
  };

  const handleDeleteDropdown = async (id) => {
    if (!window.confirm('Are you sure you want to delete this dropdown option?')) return;
    try {
      await api.delete(`/settings/dropdowns/${id}`);
      toast.success('Option deleted successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete option');
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase italic">Administrative Control</h1>
            <p className="text-sm text-gray-500 font-medium tracking-tight">Manage users, payroll rules, and organization settings</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 w-fit rounded-xl">
        <button
            onClick={() => setActiveTab('geofence')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'geofence' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <MapPin size={14} /> Geo-Fence
          </button>
          <button 
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'payroll' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Clock size={14} /> Payroll & Batches
          </button>
          <button 
            onClick={() => setActiveTab('dropdowns')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'dropdowns' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Layers size={14} /> Attendance Dropdowns
          </button>
          <button 
            onClick={() => setActiveTab('holidays')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'holidays' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarIcon size={14} /> Holidays
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users size={14} /> Users
          </button>
          <button 
            onClick={() => setActiveTab('reset')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'reset' ? 'bg-red-50 shadow-sm text-red-600' : 'text-gray-500 hover:text-red-400'}`}
          >
            <AlertTriangle size={14} /> Factory Reset
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
          
          {/* User Management */}
          {activeTab === 'users' && (
            <div className="p-0">
              <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-gray-50/30">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Users & Roles</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Manage system access and permissions</p>
                  </div>
                  {/* Active vs Deactivated pill toggle */}
                  <div className="flex bg-gray-200/60 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setUserSubTab('active')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        userSubTab === 'active' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      <Users size={14} /> Active Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserSubTab('deactivated')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                        userSubTab === 'deactivated' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      <Archive size={14} /> Deactivated Archive
                    </button>
                  </div>
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={16} />
                    <input 
                      type="text" 
                      placeholder={userSubTab === 'active' ? "Search active users..." : "Search archived users..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm w-64 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {userSubTab === 'active' ? (
                  <button 
                    onClick={() => setShowUserModal(true)}
                    className="btn-primary"
                  >
                    <UserPlus size={18} /> 
                    <span className="font-bold uppercase tracking-widest text-[10px]">Add User</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-600">
                    <Archive size={14} className="text-gray-400" />
                    <span>{filteredUsers.length} Archived Account{filteredUsers.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-200">
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">User</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Role</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Department</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Phone</th>
                      {userSubTab === 'active' ? (
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Batch</th>
                      ) : (
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Deactivated On</th>
                      )}
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Salary / Hourly</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              u.is_active === false ? 'bg-gray-200 text-gray-600' : 'bg-primary/10 text-primary'
                            }`}>
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900 flex items-center gap-2">
                                <span>{u.name}</span>
                                {u.is_active === false && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                                    Deactivated
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 font-medium">@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                            u.role === 'back_office' || u.role === 'accounts' ? 'bg-emerald-100 text-emerald-700' :
                            u.role === 'design_head' ? 'bg-amber-100 text-amber-700' :
                            u.role === 'design' ? 'bg-orange-100 text-orange-700' :
                            u.role === 'liasoning' ? 'bg-teal-100 text-teal-700' :
                            u.role === 'civil_engineer' ? 'bg-indigo-100 text-indigo-700' :
                            u.role === 'project_head' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {u.role === 'design_head' ? 'Design Head' : 
                             u.role === 'design' ? 'Design' : 
                             u.role === 'back_office' ? 'Back Office' : 
                             u.role === 'accounts' ? 'Accounts' : 
                             u.role === 'liasoning' ? 'Liasoning' : 
                             u.role === 'civil_engineer' ? 'Civil Engineer' : 
                             u.role === 'project_head' ? 'Project Head' : 
                             u.role === 'employee' ? 'Employee' : u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">{u.department || '—'}</td>
                        <td className="px-6 py-4 text-gray-600 font-medium">{u.phone || '—'}</td>
                        {userSubTab === 'active' ? (
                          <td className="px-6 py-4 text-gray-600 font-medium">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.batch_name ? 'bg-orange-50 text-primary border border-orange-200' : 'bg-gray-100 text-gray-600'
                            }`}>
                              {u.batch_name || 'Global'}
                            </span>
                          </td>
                        ) : (
                          <td className="px-6 py-4 text-gray-500 font-medium text-xs">
                            {u.deactivated_at ? new Date(u.deactivated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        )}
                        <td className="px-6 py-4 text-gray-600">
                          <div className="font-bold">₹{Number(u.base_salary || 0).toLocaleString()}</div>
                          <div className="text-[10px] font-bold text-primary italic">₹{Number(u.hourly_rate || 0).toLocaleString()}/hr</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {userSubTab === 'active' ? (
                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingUser({
                                    id: u.id,
                                    name: u.name,
                                    username: u.username,
                                    role: u.role,
                                    department: u.department || '',
                                    phone: u.phone || '',
                                    base_salary: u.base_salary || 0,
                                    hourly_rate: u.hourly_rate || 0,
                                    batch_id: u.batch_id || '',
                                  });
                                  setShowEditModal(true);
                                }}
                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-all" 
                                title="Edit User"
                              >
                                <Pencil size={16} />
                              </button>
                              <button 
                                onClick={() => setResetModal({ show: true, userId: u.id, userName: u.name, newPassword: '' })}
                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-all" 
                                title="Reset Password"
                              >
                                <RefreshCw size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.id)} 
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" 
                                title="Delete User"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center">
                              <button 
                                onClick={() => handleRestoreUser(u)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all shadow-sm"
                                title="Reactivate User"
                              >
                                <RotateCcw size={14} /> Reactivate
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                          {userSubTab === 'active' ? 'No active users found' : 'No deactivated users in archive'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Attendance Dropdowns Management */}
          {activeTab === 'dropdowns' && (
            <div className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Layers className="text-primary" size={20} />
                    Attendance & Leave Master Options
                  </h2>
                  <p className="text-xs text-gray-500 font-medium">Manage all dynamic dropdown choices and categories available in the attendance section</p>
                </div>
                <button
                  onClick={() => {
                    setEditingDropdown({
                      id: null,
                      category: activeDropdownTab,
                      key: '',
                      label: '',
                      description: '',
                      color: 'slate',
                      display_order: (dropdowns.filter(d => d.category === activeDropdownTab).length + 1),
                      is_active: true
                    });
                    setShowDropdownModal(true);
                  }}
                  className="btn-primary"
                >
                  <Plus size={16} />
                  <span className="font-bold uppercase tracking-widest text-[10px]">Add New Option</span>
                </button>
              </div>

              {/* Sub-tabs for Dropdown Categories */}
              <div className="flex gap-2 p-1 bg-gray-50 rounded-xl mb-6 border border-gray-100">
                <button
                  onClick={() => setActiveDropdownTab('request_category')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeDropdownTab === 'request_category' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Request Categories
                </button>
                <button
                  onClick={() => setActiveDropdownTab('leave_subtype')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeDropdownTab === 'leave_subtype' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Leave Sub-types
                </button>
                <button
                  onClick={() => setActiveDropdownTab('work_location')}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    activeDropdownTab === 'work_location' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  Work Locations
                </button>
              </div>

              {/* Grid of Dropdown items */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dropdowns.filter(d => d.category === activeDropdownTab).map((item) => (
                  <div key={item.id} className="bg-gray-50/70 border border-gray-200 rounded-2xl p-4 flex flex-col justify-between hover:border-primary/30 transition-all group">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-primary border border-orange-200">
                          ● {item.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${item.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} title={item.is_active ? 'Active' : 'Inactive'} />
                          <span className="text-[10px] font-mono text-gray-400">Order: {item.display_order}</span>
                        </div>
                      </div>
                      <p className="text-xs font-bold text-gray-900 mb-1">Key: <code className="bg-gray-200 px-1.5 py-0.5 rounded text-[10px]">{item.key}</code></p>
                      <p className="text-xs text-gray-500 font-medium italic line-clamp-2">{item.description || 'No description provided'}</p>
                    </div>
                    
                    <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-gray-200/60">
                      <button
                        onClick={() => {
                          setEditingDropdown(item);
                          setShowDropdownModal(true);
                        }}
                        className="p-1.5 text-gray-600 hover:text-primary hover:bg-orange-50 rounded-lg transition-all text-xs font-bold flex items-center gap-1"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteDropdown(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete option"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {dropdowns.filter(d => d.category === activeDropdownTab).length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                    No dropdown options found for this category
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Geo-fence Configuration */}
          {activeTab === 'geofence' && (
            <div className="p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-emerald-50 rounded-2xl">
                    <MapPin className="text-emerald-600" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Geo-Fence Configuration</h2>
                    <p className="text-sm text-gray-500">Control employee check-in location boundaries</p>
                  </div>
                </div>

                <form onSubmit={handleUpdateGeoSettings} className="space-y-10">

                  {/* Master Toggle */}
                  <section className="space-y-4">
                    <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Master Switch
                    </h3>
                    <div className="flex items-center justify-between bg-gray-50 p-5 rounded-2xl border border-gray-100">
                      <div>
                        <p className="text-sm font-bold text-gray-800">Enable Geo-Fencing</p>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                          When enabled, employees must be within the defined radius to check in
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setGeoSettings(prev => ({
                          ...prev,
                          geofence_enabled: prev.geofence_enabled === 'true' ? 'false' : 'true'
                        }))}
                        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
                          geoSettings.geofence_enabled === 'true'
                            ? 'bg-emerald-500 shadow-lg shadow-emerald-200'
                            : 'bg-gray-200'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-all duration-300 ${
                          geoSettings.geofence_enabled === 'true' ? 'translate-x-7' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                    {geoSettings.geofence_enabled === 'false' && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-4">
                        <span className="text-amber-500 text-sm mt-0.5">⚠</span>
                        <p className="text-xs text-amber-700 font-medium">
                          Geo-fencing is <strong>disabled</strong>. Employees can check in from anywhere.
                          Location data is still captured for audit purposes.
                        </p>
                      </div>
                    )}
                    {geoSettings.geofence_enabled === 'true' && (
                      <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                        <span className="text-emerald-500 text-sm mt-0.5">✓</span>
                        <p className="text-xs text-emerald-700 font-medium">
                          Geo-fencing is <strong>active</strong>. Check-ins outside the buffer zone will be rejected.
                        </p>
                      </div>
                    )}
                  </section>

                  {/* Office Location */}
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Office Location
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Latitude</label>
                        <input
                          type="number" step="any"
                          value={geoSettings.office_lat}
                          onChange={(e) => setGeoSettings({...geoSettings, office_lat: e.target.value})}
                          placeholder="e.g. 21.107331867053905"
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-mono outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-medium italic">Decimal degrees (e.g. 21.1073)</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Longitude</label>
                        <input
                          type="number" step="any"
                          value={geoSettings.office_lng}
                          onChange={(e) => setGeoSettings({...geoSettings, office_lng: e.target.value})}
                          placeholder="e.g. 79.06281798771569"
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-mono outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-medium italic">Decimal degrees (e.g. 79.0628)</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-mono text-slate-500 flex items-center gap-3">
                      <MapPin size={14} className="text-emerald-500 shrink-0" />
                      <span>
                        {geoSettings.office_lat && geoSettings.office_lng
                          ? `📍 ${parseFloat(geoSettings.office_lat).toFixed(6)}, ${parseFloat(geoSettings.office_lng).toFixed(6)}`
                          : 'No office location set'}
                      </span>
                    </div>
                  </section>

                  {/* Radius Settings */}
                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Zone Radii &amp; Accuracy
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-emerald-600 uppercase tracking-tight">✅ Strict Zone (m)</label>
                        <div className="relative">
                          <input
                            type="number" min="1"
                            value={geoSettings.geofence_strict_radius}
                            onChange={(e) => setGeoSettings({...geoSettings, geofence_strict_radius: e.target.value})}
                            className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-emerald-400 transition-all"
                          />
                          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-emerald-400">M</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium italic">Direct check-in, high confidence</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-amber-600 uppercase tracking-tight">🟡 Buffer Zone (m)</label>
                        <div className="relative">
                          <input
                            type="number" min="1"
                            value={geoSettings.geofence_buffer_radius}
                            onChange={(e) => setGeoSettings({...geoSettings, geofence_buffer_radius: e.target.value})}
                            className="w-full bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-amber-400 transition-all"
                          />
                          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-400">M</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium italic">Allowed with GPS-variance warning</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">📡 Max GPS Accuracy (m)</label>
                        <div className="relative">
                          <input
                            type="number" min="1"
                            value={geoSettings.geofence_max_accuracy}
                            onChange={(e) => setGeoSettings({...geoSettings, geofence_max_accuracy: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-gray-400 transition-all"
                          />
                          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400">M</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium italic">Reject if GPS error exceeds this</p>
                      </div>
                    </div>

                    {/* Zone diagram */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 flex flex-col gap-3">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zone Preview</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold">
                          ● 0 – {geoSettings.geofence_strict_radius}m: Strict (Direct check-in)
                        </span>
                        <span className="text-gray-300 font-bold">→</span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold">
                          ⚠ {geoSettings.geofence_strict_radius}–{geoSettings.geofence_buffer_radius}m: Buffer (Allowed with warning)
                        </span>
                        <span className="text-gray-300 font-bold">→</span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-bold">
                          ✕ &gt;{geoSettings.geofence_buffer_radius}m: Rejected
                        </span>
                      </div>
                    </div>
                  </section>

                  <div className="pt-8 flex justify-end">
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 transition-all active:scale-95">
                      Save Geo-Fence Settings
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Payroll Rules */}
          {activeTab === 'payroll' && (
            <div className="p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Shield className="text-primary" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Payroll Calculation Rules</h2>
                    <p className="text-sm text-gray-500">Define office timings and automatic penalty structures</p>
                  </div>
                </div>

                <form onSubmit={handleUpdatePayrollSettings} className="space-y-10">
                  <section className="space-y-6">
                    <div>
                      <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Default Shift Thresholds (Global Fallback)
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-2 font-medium italic">
                        These default timings apply to all users set to "Default (Global Settings)" in the Users tab. 
                        Employees assigned to a custom batch under the "Batches" tab will use their batch-specific thresholds instead.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Office Start Time</label>
                        <input 
                          type="time"
                          value={payrollSettings.office_start_time}
                          onChange={(e) => setPayrollSettings({...payrollSettings, office_start_time: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-medium italic">Base time for late minutes calculation</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight text-red-500">Late Threshold (10:15 AM)</label>
                        <input 
                          type="time"
                          value={payrollSettings.late_threshold_time}
                          onChange={(e) => setPayrollSettings({...payrollSettings, late_threshold_time: e.target.value})}
                          className="w-full bg-gray-50 border-red-100 border rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-medium italic">Marked "Late" after this time</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight text-orange-500">Half-Day Cutoff (1:00 PM)</label>
                        <input 
                          type="time"
                          value={payrollSettings.half_day_cutoff_time}
                          onChange={(e) => setPayrollSettings({...payrollSettings, half_day_cutoff_time: e.target.value})}
                          className="w-full bg-gray-50 border-orange-100 border rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                        <p className="text-[10px] text-gray-400 font-medium italic">Automatic half-day if check-in after this</p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Min. Work Hours</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={payrollSettings.min_working_hours}
                            onChange={(e) => setPayrollSettings({
                              ...payrollSettings,
                              min_working_hours: e.target.value,
                              half_day_threshold_hours: e.target.value
                            })}
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                          />
                          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-400 uppercase">Hours</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium italic">Must work at least this much for full day</p>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Organization Banking (For Invoices)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Account Number</label>
                        <input 
                          type="text"
                          value={payrollSettings.company_bank_account_no || ''}
                          onChange={(e) => setPayrollSettings({...payrollSettings, company_bank_account_no: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                          placeholder="e.g. 1234567890"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">IFSC Code</label>
                        <input 
                          type="text"
                          value={payrollSettings.company_bank_ifsc || ''}
                          onChange={(e) => setPayrollSettings({...payrollSettings, company_bank_ifsc: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                          placeholder="e.g. HDFC0001234"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">Bank Name & Branch</label>
                        <input 
                          type="text"
                          value={payrollSettings.company_bank_name_branch || ''}
                          onChange={(e) => setPayrollSettings({...payrollSettings, company_bank_name_branch: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                          placeholder="e.g. HDFC Bank, Khamla Branch"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-gray-500 uppercase tracking-tight">UPI ID</label>
                        <input 
                          type="text"
                          value={payrollSettings.company_bank_upi_id || ''}
                          onChange={(e) => setPayrollSettings({...payrollSettings, company_bank_upi_id: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                          placeholder="e.g. name@upi"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-6">
                    <div>
                      <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] border-b border-gray-100 pb-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Late Penalty Rule
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-2 font-medium italic">
                        Late penalty rules apply globally to all employees, whether they use the default thresholds or are assigned to custom batches.
                      </p>
                    </div>
                    <div className="bg-orange-50/50 p-6 rounded-3xl border border-orange-100">
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="text-sm font-bold text-gray-700">Every</span>
                        <input 
                          type="number"
                          value={payrollSettings.late_penalty_rule_count}
                          onChange={(e) => setPayrollSettings({...payrollSettings, late_penalty_rule_count: e.target.value})}
                          className="w-20 bg-white border border-orange-200 rounded-xl px-4 py-2 text-sm font-black text-center outline-none focus:border-primary"
                        />
                        <span className="text-sm font-bold text-gray-700">late arrivals, deduct</span>
                        <input 
                          type="number" step="0.5"
                          value={payrollSettings.late_penalty_rule_days}
                          onChange={(e) => setPayrollSettings({...payrollSettings, late_penalty_rule_days: e.target.value})}
                          className="w-20 bg-white border border-orange-200 rounded-xl px-4 py-2 text-sm font-black text-center outline-none focus:border-primary"
                        />
                        <span className="text-sm font-bold text-gray-700">day(s) salary.</span>
                      </div>
                      <p className="mt-4 text-[11px] text-orange-600 font-bold bg-white/50 w-fit px-3 py-1 rounded-full border border-orange-100">
                        Current Rule: {payrollSettings.late_penalty_rule_count} lates = {payrollSettings.late_penalty_rule_days} day cut
                      </p>
                    </div>
                  </section>

                  <div className="pt-8 flex justify-end">
                    <button type="submit" className="btn-primary px-10 py-4 uppercase tracking-widest text-xs font-black">
                      Save Calculation Rules
                    </button>
                  </div>
                </form>
              </div>

              {/* Combined Batches Section */}
              <hr className="my-10 border-gray-200" />
              <div className="mt-4">
                <div className="flex flex-wrap gap-4 justify-between items-center mb-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Attendance Batches</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configure shifts and timings for employees</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleRecalculateAllAttendance}
                      disabled={recalculating}
                      className="px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-primary border border-orange-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                      title="Recalculate past attendance records for all employees based on current batches"
                    >
                      <RefreshCw size={14} className={recalculating ? 'animate-spin' : ''} />
                      <span className="uppercase tracking-wider text-[10px]">{recalculating ? 'Recalculating...' : 'Recalculate Past Attendance'}</span>
                    </button>
                    <button 
                      onClick={() => {
                        setNewBatch({ name: '', office_start_time: '10:00', late_threshold_time: '10:15', half_day_cutoff_time: '13:00', min_working_hours: '9' });
                        setShowBatchModal(true);
                      }}
                      className="btn-primary"
                    >
                      <Plus size={18} /> 
                      <span className="font-bold uppercase tracking-widest text-[10px]">Add Batch</span>
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Batch Name</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Office Start</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Late Threshold</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Half Day Cutoff</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Min Hours</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {batches.map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50/30 transition-colors">
                          <td className="px-6 py-4 font-bold text-gray-800">{b.name}</td>
                          <td className="px-6 py-4 font-medium text-gray-600">{b.office_start_time.substring(0, 5)}</td>
                          <td className="px-6 py-4 font-medium text-gray-600">{b.late_threshold_time.substring(0, 5)}</td>
                          <td className="px-6 py-4 font-medium text-gray-600">{b.half_day_cutoff_time.substring(0, 5)}</td>
                          <td className="px-6 py-4 font-medium text-gray-600">{b.min_working_hours} hours</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex justify-center gap-3">
                              <button 
                                onClick={() => {
                                  setEditingBatch({
                                    id: b.id,
                                    name: b.name,
                                    office_start_time: b.office_start_time.substring(0, 5),
                                    late_threshold_time: b.late_threshold_time.substring(0, 5),
                                    half_day_cutoff_time: b.half_day_cutoff_time.substring(0, 5),
                                    min_working_hours: b.min_working_hours
                                  });
                                  setShowEditBatchModal(true);
                                }}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary transition-all"
                                title="Edit Batch"
                              >
                                <Pencil size={15} />
                              </button>
                              <button 
                                onClick={() => handleDeleteBatch(b.id)}
                                className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-all"
                                title="Delete Batch"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {batches.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                            No batches configured. System will use default global settings.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Holidays */}
          {activeTab === 'holidays' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Add Holiday</h2>
                    <p className="text-sm text-gray-500 font-medium">Mark non-working days in the calendar</p>
                  </div>
                  <form onSubmit={handleAddHoliday} className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Holiday Name</label>
                      <input 
                        type="text" required
                        value={newHoliday.name}
                        onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})}
                        placeholder="e.g., Independence Day"
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Date</label>
                      <input 
                        type="date" required
                        value={newHoliday.date}
                        onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <button type="submit" className="w-full btn-primary py-3">Add to List</button>
                  </form>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <h2 className="text-lg font-bold text-gray-900">Holiday Schedule</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {holidays.map(h => (
                      <div key={h.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center group">
                        <div>
                          <div className="font-bold text-gray-900">{h.name}</div>
                          <div className="text-xs text-gray-500 font-medium">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </div>
                        <button onClick={() => handleDeleteHoliday(h.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Factory Reset */}
          {activeTab === 'reset' && (
            <div className="p-10">
              {resetStep === 1 && (
                <div className="max-w-2xl mx-auto text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                  <div className="inline-flex p-6 bg-red-50 rounded-full text-red-500 ring-8 ring-red-50/50">
                    <AlertTriangle size={48} />
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-3xl font-black text-gray-900 uppercase italic tracking-tight">Danger Zone</h2>
                    <p className="text-gray-500 font-medium">A factory reset will permanently wipe all business records from the system.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-6 text-left">
                    <div className="bg-red-50/30 p-6 rounded-3xl border border-red-100/50 space-y-4">
                      <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-2">
                        <Trash2 size={12} /> Permanent Deletion
                      </h3>
                      <ul className="space-y-2 text-xs font-bold text-gray-600">
                        <li className="flex items-center gap-2"><span>•</span> Clients & Contacts</li>
                        <li className="flex items-center gap-2"><span>•</span> Projects & Documents</li>
                        <li className="flex items-center gap-2"><span>•</span> Attendance & Leaves</li>
                        <li className="flex items-center gap-2"><span>•</span> Invoices & Finance</li>
                        <li className="flex items-center gap-2"><span>•</span> All Uploaded Files</li>
                      </ul>
                    </div>
                    <div className="bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100/50 space-y-4">
                      <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                        <Shield size={12} /> Safe / Preserved
                      </h3>
                      <ul className="space-y-2 text-xs font-bold text-gray-600">
                        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> User Accounts (Logins)</li>
                        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> App & Geo Settings</li>
                        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> Holiday Calendar</li>
                        <li className="flex items-center gap-2"><span className="text-emerald-500">✓</span> System Infrastructure</li>
                      </ul>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleLoadResetPreview}
                      className="bg-red-600 hover:bg-red-700 text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-red-100 transition-all active:scale-95"
                    >
                      Begin Reset Process
                    </button>
                  </div>
                </div>
              )}

              {resetStep === 2 && resetPreview && (
                <div className="max-w-xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setResetStep(1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"><X size={20} /></button>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Confirm Deletion</h2>
                      <p className="text-sm text-gray-500">Review the records that will be purged</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-3xl border border-gray-100 overflow-hidden">
                    <div className="p-6 space-y-3">
                      {Object.entries(resetPreview).map(([key, count]) => (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{key.replace('_', ' ')}</span>
                          <span className="text-sm font-black text-gray-900">{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="bg-red-50 p-4 flex items-center gap-3">
                      <AlertTriangle className="text-red-500" size={16} />
                      <p className="text-[10px] font-black text-red-700 uppercase tracking-widest">Action is irreversible</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-center space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Type confirmation code to proceed</p>
                      <div className="text-2xl font-black text-primary tracking-[0.5em] bg-orange-50 py-3 rounded-2xl border-2 border-dashed border-orange-200">
                        {resetConfirmCode}
                      </div>
                    </div>
                    <input 
                      type="text"
                      placeholder="Enter code here..."
                      value={userInputCode}
                      onChange={(e) => setUserInputCode(e.target.value.toUpperCase())}
                      className="w-full bg-white border-2 border-gray-200 rounded-2xl px-6 py-4 text-center text-xl font-black tracking-widest outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50 transition-all uppercase"
                    />
                  </div>

                  <button 
                    onClick={handleExecuteReset}
                    disabled={userInputCode !== resetConfirmCode || isResetting}
                    className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl ${
                      userInputCode === resetConfirmCode 
                        ? 'bg-red-600 text-white shadow-red-100 hover:bg-red-700 active:scale-[0.98]' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {isResetting ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw size={16} className="animate-spin" /> PURGING SYSTEM...
                      </div>
                    ) : 'EXECUTE FACTORY RESET'}
                  </button>
                </div>
              )}

              {resetStep === 3 && resetSummary && (
                <div className="max-w-md mx-auto text-center space-y-8 animate-in zoom-in-95 duration-500">
                  <div className="inline-flex p-6 bg-emerald-50 rounded-full text-emerald-500 ring-8 ring-emerald-50/50">
                    <Server size={48} />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-gray-900 uppercase">System Purged</h2>
                    <p className="text-sm text-gray-500 font-medium">Factory reset completed successfully.</p>
                  </div>

                  <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 text-left space-y-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Summary</p>
                    <div className="flex justify-between text-xs font-bold text-gray-600">
                      <span>Records Deleted:</span>
                      <span className="text-gray-900">{Object.values(resetSummary.tablesCleared).reduce((a, b) => a + b, 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-gray-600">
                      <span>Files Removed:</span>
                      <span className="text-gray-900">{resetSummary.filesDeleted.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-gray-600">
                      <span>Reset Time:</span>
                      <span className="text-gray-900">{new Date(resetSummary.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => window.location.href = '/'}
                    className="w-full bg-gray-900 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95"
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Create New User</h3>
                <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Full Name</label>
                    <input 
                      type="text" required
                      value={newUser.name}
                      onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Username</label>
                    <input 
                      type="text" required
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="password" required
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Role</label>
                    <select 
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Department / Designation</label>
                    <input 
                      type="text"
                      value={newUser.department}
                      onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                      placeholder="e.g. Design"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Phone Number</label>
                  <input 
                    type="text"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Attendance Batch</label>
                  <select 
                    value={newUser.batch_id || ''}
                    onChange={(e) => setNewUser({...newUser, batch_id: e.target.value})}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Default (Global Settings)</option>
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Base Salary (₹)</label>
                    <input 
                      type="number"
                      value={newUser.base_salary}
                      onChange={(e) => {
                        const val = e.target.value;
                        const b = batches.find(item => String(item.id) === String(newUser.batch_id));
                        const hrs = b?.min_working_hours ? parseFloat(b.min_working_hours) : 9.0;
                        const autoRate = parseFloat(val) > 0 ? (parseFloat(val) / (30 * hrs)).toFixed(2) : newUser.hourly_rate;
                        setNewUser({...newUser, base_salary: val, hourly_rate: autoRate});
                      }}
                      placeholder="e.g. 25000"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                      Hourly Rate (₹) {parseFloat(newUser.base_salary) > 0 && <span className="text-primary font-bold">(Auto)</span>}
                    </label>
                    <input 
                      type="text"
                      value={parseFloat(newUser.base_salary) > 0 
                        ? `₹${(parseFloat(newUser.base_salary) / (30 * (parseFloat(batches.find(b => String(b.id) === String(newUser.batch_id))?.min_working_hours || 9.0)))).toFixed(2)}/hr`
                        : '₹0.00/hr'}
                      readOnly
                      disabled
                      className="w-full border rounded-xl px-4 py-2.5 text-sm font-mono font-bold bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed select-none"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowUserModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmittingUser} className="btn-primary px-8 py-2.5 disabled:opacity-50">{isSubmittingUser ? 'Creating...' : 'Create User'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Edit User Details</h3>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Full Name</label>
                    <input 
                      type="text" required
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Username</label>
                    <input 
                      type="text" required
                      value={editingUser.username}
                      onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Role</label>
                    <select 
                      value={editingUser.role}
                      onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
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
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Department / Designation</label>
                    <input 
                      type="text"
                      value={editingUser.department}
                      onChange={(e) => setEditingUser({...editingUser, department: e.target.value})}
                      placeholder="e.g. Design"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Phone Number</label>
                  <input 
                    type="text"
                    value={editingUser.phone}
                    onChange={(e) => setEditingUser({...editingUser, phone: e.target.value})}
                    placeholder="e.g. 9876543210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Attendance Batch</label>
                  <select 
                    value={editingUser.batch_id || ''}
                    onChange={(e) => setEditingUser({...editingUser, batch_id: e.target.value})}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Default (Global Settings)</option>
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Base Salary (₹)</label>
                    <input 
                      type="number"
                      value={editingUser.base_salary}
                      onChange={(e) => {
                        const val = e.target.value;
                        const b = batches.find(item => String(item.id) === String(editingUser.batch_id));
                        const hrs = b?.min_working_hours ? parseFloat(b.min_working_hours) : 9.0;
                        const autoRate = parseFloat(val) > 0 ? (parseFloat(val) / (30 * hrs)).toFixed(2) : editingUser.hourly_rate;
                        setEditingUser({...editingUser, base_salary: val, hourly_rate: autoRate});
                      }}
                      placeholder="e.g. 25000"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                      Hourly Rate (₹) {parseFloat(editingUser.base_salary) > 0 && <span className="text-primary font-bold">(Auto)</span>}
                    </label>
                    <input 
                      type="text"
                      value={parseFloat(editingUser.base_salary) > 0 
                        ? `₹${(parseFloat(editingUser.base_salary) / (30 * (parseFloat(batches.find(b => String(b.id) === String(editingUser.batch_id))?.min_working_hours || 9.0)))).toFixed(2)}/hr`
                        : '₹0.00/hr'}
                      readOnly
                      disabled
                      className="w-full border rounded-xl px-4 py-2.5 text-sm font-mono font-bold bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed select-none"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowEditModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmittingUser} className="btn-primary px-8 py-2.5 disabled:opacity-50">{isSubmittingUser ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Password Reset Modal */}
        {resetModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Reset Password</h3>
                  <p className="text-xs text-gray-500 font-medium">Changing password for {resetModal.userName}</p>
                </div>
                <button onClick={() => setResetModal({ ...resetModal, show: false })} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">New Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="password" required
                      placeholder="Min. 6 characters"
                      value={resetModal.newPassword}
                      onChange={(e) => setResetModal({...resetModal, newPassword: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setResetModal({ ...resetModal, show: false })} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-[#C94E16] rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95">Reset Now</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Batch Add Modal */}
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Create Attendance Batch</h3>
                <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleCreateBatch} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Batch Name</label>
                  <input 
                    type="text" required
                    value={newBatch.name}
                    onChange={(e) => setNewBatch({...newBatch, name: e.target.value})}
                    placeholder="e.g. 9 AM Shift"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Office Start Time</label>
                    <input 
                      type="time" required
                      value={newBatch.office_start_time}
                      onChange={(e) => setNewBatch({...newBatch, office_start_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Late Threshold Time</label>
                    <input 
                      type="time" required
                      value={newBatch.late_threshold_time}
                      onChange={(e) => setNewBatch({...newBatch, late_threshold_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Half Day Cutoff Time</label>
                    <input 
                      type="time" required
                      value={newBatch.half_day_cutoff_time}
                      onChange={(e) => setNewBatch({...newBatch, half_day_cutoff_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Min Working Hours</label>
                    <input 
                      type="number" required step="0.5" min="1" max="24"
                      value={newBatch.min_working_hours}
                      onChange={(e) => setNewBatch({...newBatch, min_working_hours: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowBatchModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="btn-primary px-8 py-2.5">Create Batch</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Batch Edit Modal */}
        {showEditBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Edit Attendance Batch</h3>
                <button onClick={() => setShowEditBatchModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleUpdateBatch} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Batch Name</label>
                  <input 
                    type="text" required
                    value={editingBatch.name}
                    onChange={(e) => setEditingBatch({...editingBatch, name: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Office Start Time</label>
                    <input 
                      type="time" required
                      value={editingBatch.office_start_time}
                      onChange={(e) => setEditingBatch({...editingBatch, office_start_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Late Threshold Time</label>
                    <input 
                      type="time" required
                      value={editingBatch.late_threshold_time}
                      onChange={(e) => setEditingBatch({...editingBatch, late_threshold_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Half Day Cutoff Time</label>
                    <input 
                      type="time" required
                      value={editingBatch.half_day_cutoff_time}
                      onChange={(e) => setEditingBatch({...editingBatch, half_day_cutoff_time: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Min Working Hours</label>
                    <input 
                      type="number" required step="0.5" min="1" max="24"
                      value={editingBatch.min_working_hours}
                      onChange={(e) => setEditingBatch({...editingBatch, min_working_hours: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowEditBatchModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="btn-primary px-8 py-2.5">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* Dropdown Master Option Modal */}
        {showDropdownModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingDropdown.id ? 'Edit Dropdown Option' : 'Create Dropdown Option'}
                </h3>
                <button onClick={() => setShowDropdownModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleSaveDropdown} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Option Category</label>
                  <select
                    value={editingDropdown.category}
                    onChange={(e) => setEditingDropdown({ ...editingDropdown, category: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary font-bold"
                  >
                    <option value="request_category">Request Category</option>
                    <option value="leave_subtype">Leave Sub-type</option>
                    <option value="work_location">Work Location</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Label Name</label>
                  <input
                    type="text" required
                    value={editingDropdown.label}
                    onChange={(e) => setEditingDropdown({ ...editingDropdown, label: e.target.value })}
                    placeholder="e.g. Maternity Leave / Half Day"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Key Slug (System Identifier)</label>
                  <input
                    type="text"
                    value={editingDropdown.key || ''}
                    onChange={(e) => setEditingDropdown({ ...editingDropdown, key: e.target.value })}
                    placeholder="e.g. maternity_leave (auto-generated if blank)"
                    disabled={!!editingDropdown.id}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary font-mono text-xs disabled:opacity-60"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingDropdown.description || ''}
                    onChange={(e) => setEditingDropdown({ ...editingDropdown, description: e.target.value })}
                    placeholder="Brief description of this option..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Display Order</label>
                    <input
                      type="number" required min="1"
                      value={editingDropdown.display_order || 1}
                      onChange={(e) => setEditingDropdown({ ...editingDropdown, display_order: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Status</label>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingDropdown({ ...editingDropdown, is_active: !editingDropdown.is_active })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          editingDropdown.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {editingDropdown.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowDropdownModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="btn-primary px-8 py-2.5">Save Option</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
