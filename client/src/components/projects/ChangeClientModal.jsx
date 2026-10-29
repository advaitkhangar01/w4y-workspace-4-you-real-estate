// client/src/components/projects/ChangeClientModal.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function ChangeClientModal({ projectId, currentClientId, onClose, onUpdated }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { data } = await api.get('/clients');
        setClients(data.clients || []);
      } catch {
        toast.error('Failed to load clients');
      } finally {
        setLoading(false);
      }
    };
    fetchClients();
  }, []);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    (c.company_name && c.company_name.toLowerCase().includes(search.toLowerCase()))
  );

  const handleUpdate = async (clientId) => {
    if (clientId === currentClientId) {
      onClose();
      return;
    }
    
    setUpdating(true);
    try {
      await api.patch(`/projects/${projectId}`, { client_id: clientId });
      toast.success('Project client updated');
      onUpdated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update client');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-4 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1A1A1A]">Change Project Client</h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="p-4 bg-slate-50 border-b border-[#F0F0F0]">
          <input 
            className="input w-full" 
            placeholder="Search clients..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="py-8 text-center"><div className="w-5 h-5 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto" /></div>
          ) : filteredClients.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">No clients found</div>
          ) : (
            filteredClients.map(c => (
              <button 
                key={c.id}
                onClick={() => handleUpdate(c.id)}
                disabled={updating}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between group ${
                  c.id === currentClientId ? 'bg-orange-50 border border-orange-100' : 'hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div>
                   <p className="text-sm font-bold text-[#1A1A1A]">{c.name}</p>
                   {c.company_name && <p className="text-[10px] text-[#E05A1E] font-bold uppercase tracking-tight">{c.company_name}</p>}
                </div>
                {c.id === currentClientId ? (
                  <span className="text-[10px] font-bold text-[#E05A1E] uppercase">Current</span>
                ) : (
                  <span className="text-[10px] font-bold text-muted group-hover:text-[#E05A1E] opacity-0 group-hover:opacity-100 transition-all">Select</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-[#F0F0F0] flex justify-end">
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
        </div>
      </div>
    </div>
  );
}
