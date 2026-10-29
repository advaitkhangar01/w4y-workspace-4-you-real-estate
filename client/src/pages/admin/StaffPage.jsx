/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
// client/src/pages/admin/StaffPage.jsx
// Premium Staff Directory & Telemetry Hub for Administrators

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import UserModal from '../../components/staff/UserModal';
import { 
  Users, 
  Search, 
  Briefcase, 
  Phone, 
  ChevronRight, 
  MapPin, 
  Grid,
  Filter,
  CheckCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';

function StatCard({ title, value, sub, icon: Icon, colorClass, bgClass, borderClass }) {
  return (
    <div className={`card ${bgClass} border ${borderClass} shadow-sm overflow-hidden relative group transition-all duration-300 hover:shadow-md`}>
      <div className="flex justify-between items-center relative z-10">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
          <h3 className={`text-3xl font-black ${colorClass} tracking-tight`}>{value}</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">{sub}</p>
        </div>
        <div className={`p-3 rounded-2xl ${bgClass} border ${borderClass} ${colorClass} group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={22} />
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 w-full h-1 ${colorClass.split(' ')[0]} scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500`} />
    </div>
  );
}

export default function StaffPage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/staff');
      setStaff(data.staff || []);
    } catch (err) {
      toast.error('Failed to retrieve staff directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Unique list of departments and roles for filters
  const rolesList = useMemo(() => {
    const roles = staff.map(s => s.role).filter(Boolean);
    return ['all', ...new Set(roles)];
  }, [staff]);

  const deptsList = useMemo(() => {
    const depts = staff.map(s => s.department).filter(Boolean);
    return ['all', ...new Set(depts)];
  }, [staff]);

  // Telemetry stats
  const stats = useMemo(() => {
    const total = staff.length;
    const presentToday = staff.filter(s => s.attendance_status_today === 'working' || s.attendance_status_today === 'completed').length;
    const absentToday = total - presentToday;
    
    // Most active department
    const depts = {};
    staff.forEach(s => {
      if (s.department) depts[s.department] = (depts[s.department] || 0) + 1;
    });
    let topDept = 'N/A';
    let max = 0;
    Object.entries(depts).forEach(([d, count]) => {
      if (count > max) {
        max = count;
        topDept = d;
      }
    });

    return { total, presentToday, absentToday, topDept };
  }, [staff]);

  // Filters staff list
  const filteredStaff = useMemo(() => {
    return staff.filter(s => {
      const matchesSearch = 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.phone && s.phone.includes(searchQuery)) ||
        (s.department && s.department.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesRole = selectedRole === 'all' || s.role === selectedRole;
      const matchesDept = selectedDept === 'all' || s.department === selectedDept;

      return matchesSearch && matchesRole && matchesDept;
    });
  }, [staff, searchQuery, selectedRole, selectedDept]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase italic">Staff Management Hub</h1>
            <p className="text-sm text-gray-500 font-medium tracking-tight">Access complete analytical profiles, attendance records, and tasks</p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="btn-primary flex items-center gap-2 uppercase tracking-widest text-[10px] font-black"
          >
            <Users size={14} /> Add New Employee
          </button>
        </div>

        {/* Telemetry Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Total Team" 
            value={loading ? '—' : stats.total} 
            sub="Registered Employees" 
            icon={Users} 
            colorClass="text-[#E05A1E]" 
            bgClass="bg-[rgba(224,90,30,0.04)]" 
            borderClass="border-[rgba(224,90,30,0.1)]" 
          />
          <StatCard 
            title="Active Today" 
            value={loading ? '—' : stats.presentToday} 
            sub="Checked-In Today" 
            icon={CheckCircle} 
            colorClass="text-emerald-600" 
            bgClass="bg-emerald-50/30" 
            borderClass="border-emerald-100" 
          />
          <StatCard 
            title="Absent Today" 
            value={loading ? '—' : stats.absentToday} 
            sub="Out of Office" 
            icon={XCircle} 
            colorClass="text-red-500" 
            bgClass="bg-red-50/30" 
            borderClass="border-red-100" 
          />
          <StatCard 
            title="Largest Dept" 
            value={loading ? '—' : stats.topDept} 
            sub="Most team members" 
            icon={Briefcase} 
            colorClass="text-purple-600" 
            bgClass="bg-purple-50/30" 
            borderClass="border-purple-100" 
          />
        </div>

        {/* Search & Filter Hub */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex flex-wrap gap-4 items-center justify-between">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text"
              placeholder="Search by name, username, phone or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium"
            />
          </div>

          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
              <Filter size={14} className="text-gray-400" />
              <span className="text-xs font-black uppercase text-gray-400 tracking-wider">Role</span>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Roles</option>
                {rolesList.filter(r => r !== 'all').map(role => {
                  const roleLabels = {
                    admin: 'Admin',
                    design_head: 'Design Head',
                    design: 'Design',
                    liasoning: 'Liasoning',
                    civil_engineer: 'Civil Engineer',
                    project_head: 'Project Head',
                    employee: 'Employee',
                    back_office: 'Back Office',
                    accounts: 'Accounts'
                  };
                  return (
                    <option key={role} value={role}>{roleLabels[role] || role.toUpperCase()}</option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl">
              <Grid size={14} className="text-gray-400" />
              <span className="text-xs font-black uppercase text-gray-400 tracking-wider">Dept</span>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-transparent text-xs font-bold text-gray-700 outline-none cursor-pointer"
              >
                <option value="all">All Departments</option>
                {deptsList.filter(d => d !== 'all').map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Directory Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card skeleton h-48 rounded-2xl" />
            ))}
          </div>
        ) : (
          <>
            {filteredStaff.length === 0 ? (
              <div className="text-center py-20 bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col items-center">
                <HelpCircle className="text-gray-300 mb-4 animate-bounce" size={48} />
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">No team members match your criteria</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Try clearing your filters or query</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredStaff.map((member) => {
                  const isPresent = member.attendance_status_today === 'working' || member.attendance_status_today === 'completed';
                  const roleColors = 
                    member.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                    member.role === 'back_office' || member.role === 'accounts' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                    member.role === 'design_head' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                    member.role === 'design' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                    member.role === 'liasoning' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                    member.role === 'civil_engineer' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                    member.role === 'project_head' ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                    'bg-blue-50 text-blue-700 border-blue-100';

                  return (
                    <div 
                      key={member.id}
                      onClick={() => navigate(`/admin/staff/${member.id}`)}
                      className="group bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/50 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between min-h-[200px]"
                    >
                      {/* Top profile part */}
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary font-black text-lg shadow-sm">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate group-hover:text-primary transition-colors">{member.name}</h4>
                          <p className="text-xs font-semibold text-gray-400">@{member.username}</p>
                          <div className="flex gap-2 mt-2 items-center flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${roleColors}`}>
                              {member.role === 'design_head' ? 'Design Head' : 
                               member.role === 'design' ? 'Design' : 
                               member.role === 'back_office' ? 'Back Office' : 
                               member.role === 'accounts' ? 'Accounts' : 
                               member.role === 'liasoning' ? 'Liasoning' : 
                               member.role === 'civil_engineer' ? 'Civil Engineer' : 
                               member.role === 'project_head' ? 'Project Head' : 
                               member.role === 'employee' ? 'Employee' : member.role}
                            </span>
                            {member.department && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                {member.department}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Middle metadata stats */}
                      <div className="grid grid-cols-2 gap-4 border-t border-b border-gray-100 my-4 py-3 text-xs font-medium text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-300" />
                          <span className="truncate">{member.phone || '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 justify-end">
                          <Briefcase size={13} className="text-slate-300" />
                          <span className="font-bold text-primary">{member.active_projects_count} Active Projects</span>
                        </div>
                      </div>

                      {/* Footer Actions & Status */}
                      <div className="flex justify-between items-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                          isPresent 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-red-50 text-red-500 border-red-100'
                        }`}>
                          ● {isPresent ? 'Present Today' : 'Absent'}
                        </span>
                        
                        <div className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-[#E05A1E] opacity-75 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">
                          View details
                          <ChevronRight size={14} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {showCreateModal && (
        <UserModal 
          onClose={() => setShowCreateModal(false)}
          onSave={fetchStaff}
        />
      )}
    </AppLayout>
  );
}
