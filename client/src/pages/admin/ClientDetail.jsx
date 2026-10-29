// client/src/pages/admin/ClientDetail.jsx
// Central hub for individual client management

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatIST } from '../../utils/time';
import { useAuth } from '../../context/AuthContext';
import LinkProjectModal from '../../components/clients/LinkProjectModal';
import ClientModal from '../../components/clients/ClientModal';

export default function ClientDetail() {
  const { isAdmin, isAccounts } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const fetchClientData = useCallback(async () => {
    try {
      const [clientRes, suggestionsRes] = await Promise.all([
        api.get(`/clients/${id}`),
        isAdmin ? api.get(`/projects/suggestions/${id}`) : Promise.resolve({ data: { suggestions: [] } })
      ]);
      setData(clientRes.data);
      setSuggestions(suggestionsRes.data.suggestions || []);
    } catch {
      toast.error('Failed to load client details');
      navigate('/clients');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, isAdmin]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchClientData(); }, [fetchClientData]);

  if (loading) return (
    <AppLayout>
      <div className="space-y-4 max-w-5xl mx-auto">
        <div className="skeleton h-8 w-48 rounded" />
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    </AppLayout>
  );

  if (!data) return null;

  const { client, addresses, banking, projects } = data;

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete account "${client.name}"?`)) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success('Account deleted');
      navigate('/clients');
    } catch {
      toast.error('Failed to delete client');
    }
  };

  const handleLinkSuccess = () => {
    fetchClientData(); // Refresh all data
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb & Navigation */}
        <nav className="flex items-center gap-2 text-xs font-medium">
          <Link to="/clients" className="text-muted hover:text-[#E05A1E] transition-colors">Client Accounts</Link>
          <span className="text-[#CCCCCC]">/</span>
          <span className="text-[#1A1A1A]">{client.name}</span>
        </nav>

        {/* Suggestions Alert */}
        {suggestions.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-500">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div>
                   <p className="text-sm font-bold text-amber-900">Sync Suggestion</p>
                   <p className="text-xs text-amber-700">Found {suggestions.length} existing project(s) that match this client's name but aren't linked.</p>
                </div>
             </div>
             <button 
               onClick={() => setShowLinkModal(true)}
               className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-colors shadow-sm"
             >
                Review & Link
             </button>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E0E0E0] shadow-sm">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
               <span className="text-[#E05A1E] text-2xl font-bold">{client.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[#1A1A1A]">{client.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                 {client.company_name && <span className="text-xs font-bold text-[#E05A1E] uppercase tracking-wider">{client.company_name}</span>}
                 <div className="flex gap-1.5 ml-2">
                    {client.gst_number && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold uppercase tracking-wider">GST Verified</span>}
                    {client.pan_number && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-bold uppercase tracking-wider">PAN Verified</span>}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-[#E05A1E] border border-orange-100 font-bold uppercase tracking-wider">Active</span>
                 </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => setShowEditModal(true)} className="btn-secondary px-3 py-2 text-xs">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            {isAdmin && (
              <button onClick={handleDelete} className="btn-secondary px-3 py-2 text-xs text-red-500 hover:text-red-600 border-red-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                Delete
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => setShowLinkModal(true)}
                className="btn-secondary px-4 py-2 text-xs hover:border-[#E05A1E]/50"
              >
                Link Existing Project
              </button>
            )}
            <div className="h-8 w-px bg-[#E0E0E0] mx-1" />
            {!isAccounts && (
              <button 
                onClick={() => navigate('/projects', { state: { preSelectClientId: client.id } })}
                className="btn-primary px-4 py-2 text-xs shadow-lg shadow-orange-100"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Project
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#EBEBEB] overflow-x-auto hide-scrollbar sticky top-0 bg-[#F5F5F5] z-20 pt-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'projects', label: 'Projects', count: projects.length },
            { id: 'billing', label: 'Billing & Addresses' },
            { id: 'activity', label: 'Activity' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-[#E05A1E] text-[#E05A1E]'
                  : 'border-transparent text-muted hover:text-[#1A1A1A]'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                  activeTab === tab.id ? 'bg-orange-100 text-[#E05A1E]' : 'bg-[#E0E0E0] text-muted'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Account Summary</h3>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-xs text-muted font-medium">Account Status</p>
                      <p className="text-base font-bold text-[#1A1A1A]">Active</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted font-medium">Total Engagement</p>
                      <p className="text-base font-bold text-[#E05A1E]">{projects.length} Projects</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted font-medium">Customer Since</p>
                      <p className="text-sm font-semibold">{formatIST(client.created_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted font-medium">Account Type</p>
                      <p className="text-sm font-semibold">{client.company_name ? 'Corporate Entity' : 'Individual'}</p>
                    </div>
                  </div>
                </div>

                <div className="card">
                   <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-3">Internal Notes</h3>
                   {client.notes ? (
                     <p className="text-sm text-[#444444] leading-relaxed whitespace-pre-wrap">{client.notes}</p>
                   ) : (
                     <p className="text-sm text-muted italic">No internal notes added for this client.</p>
                   )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="card bg-[#1A1A1A] text-white border-none">
                  <h3 className="text-xs font-bold text-[#E05A1E] uppercase tracking-widest mb-4">Quick Stats</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <span className="text-xs text-white/60">Active Projects</span>
                      <span className="text-sm font-bold">{projects.filter(p => p.status !== 'Completed').length}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/60">Saved Addresses</span>
                      <span className="text-sm font-bold">{addresses.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PROJECTS TAB */}
          {activeTab === 'projects' && (
            <div className="space-y-4">
               {projects.length === 0 ? (
                 <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-[#E0E0E0]">
                    <p className="text-muted text-sm">No projects linked to this client yet.</p>
                    {!isAccounts && (
                      <button onClick={() => navigate('/projects')} className="btn-primary mt-4 mx-auto text-xs">Create First Project</button>
                    )}
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {projects.map(p => {
                     const statusCls = p.status === 'Completed' ? 'badge-completed' : 
                                     p.status === 'Under Proposal' ? 'badge-absent' : 'badge-in-progress';
                     return (
                       <Link to={`/projects/${p.id}`} key={p.id} className="card group hover:border-[#E05A1E] transition-all flex items-center justify-between">
                          <div>
                             <h4 className="text-sm font-bold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">{p.name}</h4>
                             <p className="text-[10px] text-muted font-medium mt-0.5">{p.type}</p>
                          </div>
                          <span className={`badge ${statusCls}`}>{p.status}</span>
                       </Link>
                     );
                   })}
                 </div>
               )}
            </div>
          )}



          {/* BILLING & ADDRESSES TAB */}
          {activeTab === 'billing' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="space-y-6">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wider">📍 Saved Addresses</h3>
                  {addresses.length === 0 ? (
                    <p className="text-xs text-muted italic">No addresses saved.</p>
                  ) : (
                    addresses.map(a => (
                      <div key={a.id} className="card">
                         <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-bold px-2 py-0.5 bg-[#F5F5F5] border border-[#E0E0E0] rounded uppercase tracking-widest">{a.type}</span>
                         </div>
                         <p className="text-sm text-[#1A1A1A] leading-relaxed mb-2 font-medium">{a.address}</p>
                         <p className="text-xs text-muted">{a.city}, {a.state} - {a.pincode}</p>
                      </div>
                    ))
                  )}
               </div>

               <div className="space-y-6">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wider">💳 Banking Details</h3>
                  {banking.length === 0 ? (
                    <p className="text-xs text-muted italic">No banking records found.</p>
                  ) : (
                    banking.map(b => (
                      <div key={b.id} className="card relative overflow-hidden bg-slate-50">
                         {b.is_primary && <div className="absolute top-0 right-0 p-2"><span className="text-[8px] bg-[#E05A1E] text-white px-1.5 py-0.5 rounded font-bold">PRIMARY</span></div>}
                         <div className="space-y-4">
                            <div>
                               <p className="text-[10px] text-muted font-bold uppercase mb-1">Account Holder</p>
                               <p className="text-sm font-bold text-[#1A1A1A]">{b.account_name}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                               <div>
                                  <p className="text-[10px] text-muted font-bold uppercase mb-1">Bank</p>
                                  <p className="text-xs font-semibold">{b.bank_name}</p>
                                  <p className="text-[10px] text-muted">{b.branch}</p>
                               </div>
                               <div>
                                  <p className="text-[10px] text-muted font-bold uppercase mb-1">Account No.</p>
                                  <p className="text-xs font-mono font-bold">•••• •••• {b.account_number?.slice(-4)}</p>
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
                               <div>
                                  <p className="text-[10px] text-muted font-bold uppercase mb-1">IFSC Code</p>
                                  <p className="text-xs font-semibold">{b.ifsc}</p>
                               </div>
                               <div>
                                  <p className="text-[10px] text-muted font-bold uppercase mb-1">UPI ID</p>
                                  <p className="text-xs font-semibold">{b.upi_id || 'N/A'}</p>
                               </div>
                            </div>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeTab === 'activity' && (
            <div className="card flex flex-col items-center justify-center py-20 text-center border-dashed">
               <div className="w-12 h-12 bg-[#F5F5F5] rounded-full flex items-center justify-center mb-4 text-muted">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
               </div>
               <p className="text-sm font-medium text-muted">No recent activity detected</p>
               <p className="text-xs text-[#CCCCCC] mt-1">Comments and task updates will appear here in future updates.</p>
            </div>
          )}

        </div>
      </div>

      {showLinkModal && (
        <LinkProjectModal 
          clientId={id} 
          onClose={() => setShowLinkModal(false)} 
          onLinked={handleLinkSuccess} 
        />
      )}

      {showEditModal && (
        <ClientModal
          client={client}
          onClose={() => setShowEditModal(false)}
          onSave={fetchClientData}
        />
      )}
    </AppLayout>
  );
}
