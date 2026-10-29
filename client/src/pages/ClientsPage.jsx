// client/src/pages/ClientsPage.jsx
// Advanced Client Management - Multi-entity (Contacts, Addresses, Banking)

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

import ClientModal from '../components/clients/ClientModal';

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ show: false, client: null });
  const [search, setSearch] = useState('');

  const fetchClients = useCallback(async () => {
    try {
      const { data } = await api.get('/clients');
      setClients(data.clients || []);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleDelete = async (e, id, name) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete account "${name}"? This will remove all associated contacts, addresses and banking data.`)) return;
    try {
      await api.delete(`/clients/${id}`);
      toast.success('Client deleted');
      fetchClients();
    } catch {
      toast.error('Failed to delete client');
    }
  };

  const filtered = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.primary_contact_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Client Accounts</h1>
            <p className="text-muted text-sm mt-0.5">{clients.length} accounts under management</p>
          </div>
          <button onClick={() => setModal({ show: true, client: null })} className="btn-primary shadow-lg shadow-orange-100">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Client Account
          </button>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input 
              className="input pl-10" 
              placeholder="Search by name or company..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="w-10 h-10 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-[#E0E0E0]">
             <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto text-[#CCCCCC] mb-3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <p className="text-muted text-sm font-medium">No accounts found matching your criteria</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((c) => (
              <Link 
                to={`/clients/${c.id}`} 
                key={c.id} 
                className="card group hover:border-[#E05A1E] transition-all duration-300 relative overflow-hidden bg-white shadow-sm hover:shadow-xl block"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
                  <button 
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setModal({ show: true, client: c }); }} 
                    className="p-2 bg-white rounded-lg border border-[#E0E0E0] text-muted hover:text-[#E05A1E] shadow-sm transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={(e) => handleDelete(e, c.id, c.name)} 
                      className="p-2 bg-white rounded-lg border border-[#E0E0E0] text-muted hover:text-red-500 shadow-sm transition-all"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#E05A1E] text-lg font-bold">{c.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-[#1A1A1A] truncate">{c.name}</h4>
                    {c.company_name ? (
                      <p className="text-xs font-semibold text-[#E05A1E] truncate">{c.company_name}</p>
                    ) : (
                       <p className="text-xs text-muted">Individual Client</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs border-t border-[#F0F0F0] pt-4">
                    <div className="space-y-1">
                      <p className="text-muted font-medium">Primary Contact</p>
                      <p className="font-bold text-[#1A1A1A]">{c.primary_contact_name || 'N/A'}</p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-muted font-medium">Projects</p>
                      <p className="font-bold text-[#E05A1E]">{c.project_count || 0}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.gst_number && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold uppercase tracking-wider">GST Registered</span>}
                    {c.pan_number && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-bold uppercase tracking-wider">PAN Verified</span>}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F5] text-muted border border-[#E0E0E0] font-bold uppercase tracking-wider">Active</span>
                  </div>

                  {c.primary_contact_phone && (
                    <div className="flex items-center gap-2 text-xs text-muted bg-[#F8F9FA] p-2 rounded-lg border border-[#F0F0F0]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      {c.primary_contact_phone}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {modal.show && (
        <ClientModal 
          client={modal.client} 
          onClose={() => setModal({ show: false, client: null })} 
          onSave={fetchClients}
        />
      )}
    </AppLayout>
  );
}
