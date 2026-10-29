// client/src/components/clients/LinkProjectModal.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function LinkProjectModal({ clientId, onClose, onLinked }) {
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  const fetchProjects = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const { data } = await api.get(`/projects/search/linkable`, {
        params: { q: query, exclude_client_id: clientId }
      });
      setProjects(data.projects);
    } catch {
      toast.error('Failed to search projects');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProjects();
  }, [fetchProjects]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchProjects(search);
  };

  const handleLink = async (projectId) => {
    setLinkingId(projectId);
    try {
      await api.patch(`/projects/${projectId}`, { client_id: clientId });
      toast.success('Project linked successfully');
      onLinked(projectId);
      // Remove from list
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to link project');
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg card border border-[#E0E0E0] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-5 border-b border-[#F0F0F0] flex items-center justify-between bg-white">
          <h3 className="text-base font-semibold text-[#1A1A1A]">Link Existing Projects</h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="p-5 bg-slate-50 border-b border-[#F0F0F0]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input 
              className="input flex-1" 
              placeholder="Search by project name or client name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="btn-primary px-4">Search</button>
          </form>
          <p className="text-[10px] text-muted mt-2">Showing projects not currently linked to this account.</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {loading ? (
            <div className="py-10 text-center">
               <div className="w-6 h-6 border-2 border-[#E05A1E]/30 border-t-[#E05A1E] rounded-full animate-spin mx-auto mb-2" />
               <p className="text-xs text-muted">Searching projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted italic">No linkable projects found.</p>
            </div>
          ) : (
            projects.map(p => (
              <div key={p.id} className="p-3 bg-white border border-[#EBEBEB] rounded-xl flex items-center justify-between hover:border-[#E05A1E]/30 transition-colors">
                <div className="min-w-0 pr-4">
                  <h4 className="text-sm font-bold text-[#1A1A1A] truncate">{p.name}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted truncate">Current: {p.client_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{p.type}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleLink(p.id)}
                  disabled={linkingId === p.id}
                  className="btn-secondary py-1.5 px-3 text-xs whitespace-nowrap"
                >
                  {linkingId === p.id ? 'Linking...' : 'Link to Account'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-[#F0F0F0] bg-white flex justify-end">
          <button onClick={onClose} className="btn-secondary text-xs">Close</button>
        </div>
      </div>
    </div>
  );
}
