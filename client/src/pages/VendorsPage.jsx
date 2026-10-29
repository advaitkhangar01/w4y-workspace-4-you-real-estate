// client/src/pages/VendorsPage.jsx
// Vendor catalog - Kanban style grouping with CRUD

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Lock, Trash2 } from 'lucide-react';

const VENDOR_CATEGORIES = [
  'Carpenter', 'Electrician', 'Plumber', 'POP', 'Contractor', 
  'Painter', 'Fabricator', 'Glass Work', 'Tile Work', 
  'Civil Work', 'Other'
];

const CATEGORY_ICONS = {
  'Carpenter': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2 22 9.5M13 3.5l7.5 7.5M2 22l7.5-7.5M11 11l-3-3"/>
    </svg>
  ),
  'Electrician': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  'Plumber': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z"/>
    </svg>
  ),
  'POP': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v8a6 6 0 0 1-6 6H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 17v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4"/>
    </svg>
  ),
  'Contractor': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  'Painter': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"/>
      <circle cx="12" cy="7.5" r="1.5" />
      <circle cx="7.5" cy="12" r="1.5" />
      <circle cx="16.5" cy="12" r="1.5" />
      <circle cx="12" cy="16.5" r="1.5" />
    </svg>
  ),
  'Fabricator': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <line x1="9.8" y1="8.2" x2="20" y2="18.4"/>
      <line x1="9.8" y1="15.8" x2="20" y2="5.6"/>
    </svg>
  ),
  'Glass Work': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
      <line x1="15" y1="3" x2="15" y2="21"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
    </svg>
  ),
  'Tile Work': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>
  ),
  'Civil Work': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
      <path d="M2 9h20M2 16h20M7 2v7M17 2v7M12 9v7M7 16v6M17 16v6"/>
    </svg>
  ),
  'Other': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  'All': (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
};

const CATEGORY_COLORS = {
  'Carpenter': 'from-amber-500/10 to-orange-500/10 text-amber-600 border-amber-500/20 hover:border-amber-500',
  'Electrician': 'from-yellow-500/10 to-amber-500/10 text-yellow-600 border-yellow-500/20 hover:border-yellow-500',
  'Plumber': 'from-blue-500/10 to-cyan-500/10 text-blue-600 border-blue-500/20 hover:border-blue-500',
  'POP': 'from-purple-500/10 to-pink-500/10 text-purple-600 border-purple-500/20 hover:border-purple-500',
  'Contractor': 'from-indigo-500/10 to-blue-500/10 text-indigo-600 border-indigo-500/20 hover:border-indigo-500',
  'Painter': 'from-teal-500/10 to-emerald-500/10 text-teal-600 border-teal-500/20 hover:border-teal-500',
  'Fabricator': 'from-pink-500/10 to-rose-500/10 text-pink-600 border-pink-500/20 hover:border-pink-500',
  'Glass Work': 'from-sky-500/10 to-teal-500/10 text-sky-600 border-sky-500/20 hover:border-sky-500',
  'Tile Work': 'from-violet-500/10 to-fuchsia-500/10 text-violet-600 border-violet-500/20 hover:border-violet-500',
  'Civil Work': 'from-stone-500/10 to-neutral-500/10 text-stone-600 border-stone-500/20 hover:border-stone-500',
  'Other': 'from-slate-500/10 to-zinc-500/10 text-slate-600 border-slate-500/20 hover:border-slate-500',
  'All': 'from-[#E05A1E]/10 to-orange-500/10 text-[#E05A1E] border-[#E05A1E]/20 hover:border-[#E05A1E]'
};

// --- Modal for Create/Edit
function VendorModal({ vendor, onClose, onSave }) {
  const [form, setForm] = useState(vendor || { 
    name: '', category: 'Carpenter', phone: '', email: '', remarks: '' 
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.category) {
      toast.error('Name and category are required');
      return;
    }
    setLoading(true);
    try {
      if (vendor?.id) {
        const { data } = await api.patch(`/vendors/${vendor.id}`, form);
        toast.success('Vendor updated');
        onSave(data);
      } else {
        const { data } = await api.post('/vendors', form);
        toast.success('Vendor added');
        onSave(data);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[#1A1A1A]">
            {vendor ? 'Edit Vendor' : 'Add New Vendor'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Vendor Name *</label>
            <input className="input" placeholder="e.g. Rajesh Carpentry" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Category *</label>
            <select className="input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Phone</label>
              <input className="input" placeholder="10-digit number" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Email</label>
              <input className="input" type="email" placeholder="email@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Remarks / Notes</label>
            <textarea className="input min-h-[80px]" placeholder="Experience, specialty, etc." value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : vendor ? 'Update Vendor' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { isAdmin } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ show: false, vendor: null });
  const [historyModal, setHistoryModal] = useState({ show: false, vendor: null });
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchVendors = useCallback(async () => {
    try {
      const { data } = await api.get('/vendors');
      setVendors(data.vendors);
      setGrouped(data.grouped);
    } catch {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete vendor "${name}"?`)) return;
    try {
      await api.delete(`/vendors/${id}`);
      toast.success('Vendor deleted');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to delete vendor');
    }
  };

  const handleSave = () => {
    fetchVendors();
  };

  // Filter vendors based on selected category and search term
  const getFilteredVendors = () => {
    let list = vendors;
    if (selectedCategory && selectedCategory !== 'All') {
      list = vendors.filter(v => v.category === selectedCategory);
    }
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      list = list.filter(v => 
        v.name.toLowerCase().includes(query) ||
        (v.phone && v.phone.includes(query)) ||
        (v.email && v.email.toLowerCase().includes(query)) ||
        (v.remarks && v.remarks.toLowerCase().includes(query))
      );
    }
    return list;
  };

  const filteredVendors = getFilteredVendors();

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Breadcrumbs and Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <span 
                className="hover:text-[#E05A1E] cursor-pointer transition-colors"
                onClick={() => { setSelectedCategory(null); setSearchTerm(''); }}
              >
                Vendors
              </span>
              {selectedCategory && (
                <>
                  <span>/</span>
                  <span className="text-slate-900 font-medium">
                    {selectedCategory === 'All' ? 'All Specialists' : `${selectedCategory}s`}
                  </span>
                </>
              )}
            </div>
            
            <h1 className="text-2xl font-black tracking-tight text-[#1A1A1A]">
              {selectedCategory 
                ? (selectedCategory === 'All' ? 'All Specialists' : `${selectedCategory}s`)
                : 'Vendor Directory'
              }
            </h1>
            <p className="text-muted text-sm mt-0.5">
              {selectedCategory 
                ? `${filteredVendors.length} found in this view`
                : `${vendors.length} active specialists categorized`
              }
            </p>
          </div>

          <div className="flex items-center gap-3">
            {selectedCategory && (
              <button 
                onClick={() => { setSelectedCategory(null); setSearchTerm(''); }}
                className="btn-secondary py-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                Back to Grid
              </button>
            )}
            <button onClick={() => setModal({ show: true, vendor: null })} className="btn-primary py-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Vendor
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="w-10 h-10 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !selectedCategory ? (
          /* Dashboard Categories Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 animate-in fade-in duration-300">
            {/* "All Specialists" Card */}
            <div 
              onClick={() => setSelectedCategory('All')}
              className="group relative overflow-hidden bg-white border border-[#EBEFF5] rounded-2xl p-6 shadow-soft-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer flex flex-col justify-between min-h-[160px]"
            >
              {/* Subtle background graphic */}
              <div className="absolute top-0 right-0 p-8 translate-x-4 -translate-y-4 opacity-5 group-hover:scale-110 transition-transform duration-300">
                {CATEGORY_ICONS['All']}
              </div>

              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${CATEGORY_COLORS['All']}`}>
                  {CATEGORY_ICONS['All']}
                </div>
                <span className="text-2xl font-black text-slate-800">
                  {vendors.length}
                </span>
              </div>

              <div className="mt-6">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-[#E05A1E] transition-colors">
                  All Specialists
                </h3>
                <p className="text-xs text-muted mt-1">
                  View entire database of registered vendors
                </p>
              </div>
            </div>

            {/* Individual Category Cards */}
            {VENDOR_CATEGORIES.map((category) => {
              const count = vendors.filter(v => v.category === category).length;

              return (
                <div 
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className="group relative overflow-hidden bg-white border border-[#EBEFF5] rounded-2xl p-6 shadow-soft-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer flex flex-col justify-between min-h-[160px]"
                >
                  {/* Subtle background graphic */}
                  <div className="absolute top-0 right-0 p-8 translate-x-4 -translate-y-4 opacity-5 group-hover:scale-110 transition-transform duration-300">
                    {CATEGORY_ICONS[category] || CATEGORY_ICONS['Other']}
                  </div>

                  <div className="flex justify-between items-start">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${CATEGORY_COLORS[category] || CATEGORY_COLORS['Other']}`}>
                      {CATEGORY_ICONS[category] || CATEGORY_ICONS['Other']}
                    </div>
                    <span className="text-2xl font-black text-slate-800">
                      {count}
                    </span>
                  </div>

                  <div className="mt-6">
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-slate-950 transition-colors flex items-center gap-1.5">
                      {category}s
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-4px] group-hover:translate-x-0 duration-300 text-[#E05A1E]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                      </span>
                    </h3>
                    <p className="text-xs text-muted mt-1">
                      {count === 0 ? 'No active vendors linked' : `Manage specialists & contracts`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Category Details View */
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Search and Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-[#EBEFF5] shadow-soft-sm">
              <div className="relative w-full sm:max-w-xs">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Search name, phone, notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input pl-10"
                />
              </div>

              {/* Category Quick Select pills inside Detail View */}
              <div className="flex gap-2 overflow-x-auto w-full sm:w-auto py-1 scrollbar-none">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                    selectedCategory === 'All'
                      ? 'bg-[#E05A1E] text-white shadow-glow-orange'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  All
                </button>
                {VENDOR_CATEGORIES.map(cat => {
                  const count = vendors.filter(v => v.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-[#E05A1E] text-white shadow-glow-orange'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredVendors.length === 0 ? (
              <div className="card py-16 text-center border-dashed border-[#EBEFF5]">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400 mb-3 border border-slate-100">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </div>
                <h4 className="text-base font-bold text-slate-900">No matching vendors</h4>
                <p className="text-xs text-muted mt-1 max-w-md mx-auto">
                  Try refining your search terms or select a different category to view available specialists.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {filteredVendors.map((v) => (
                  <div key={v.id} className="card group relative flex flex-col justify-between hover:border-[rgba(224,90,30,0.3)] hover:shadow-md transition-all duration-200">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-bold text-[#1A1A1A] truncate">{v.name}</h4>
                          <span className={`inline-block text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r px-2 py-0.5 rounded mt-1.5 ${
                            v.category === 'Carpenter' ? 'bg-amber-50 text-amber-600' :
                            v.category === 'Electrician' ? 'bg-yellow-50 text-yellow-600' :
                            v.category === 'Plumber' ? 'bg-blue-50 text-blue-600' :
                            v.category === 'POP' ? 'bg-purple-50 text-purple-600' :
                            v.category === 'Contractor' ? 'bg-indigo-50 text-indigo-600' :
                            v.category === 'Painter' ? 'bg-teal-50 text-teal-600' :
                            v.category === 'Fabricator' ? 'bg-pink-50 text-pink-600' :
                            v.category === 'Glass Work' ? 'bg-sky-50 text-sky-600' :
                            v.category === 'Tile Work' ? 'bg-violet-50 text-violet-600' :
                            v.category === 'Civil Work' ? 'bg-stone-50 text-stone-600' :
                            'bg-slate-50 text-slate-600'
                          }`}>
                            {v.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => setModal({ show: true, vendor: v })}
                            className="p-1.5 text-muted hover:text-[#E05A1E] hover:bg-[#FFF4EE] rounded-lg transition-all"
                            title="Edit Vendor"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>
                          {isAdmin && (
                            <button 
                              onClick={() => handleDelete(v.id, v.name)}
                              className="p-1.5 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete Vendor"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 border-t border-[#F5F6F9] pt-3.5 mt-3.5">
                        {v.phone && (
                          <div className="flex items-center gap-2.5 text-xs text-muted">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                            </svg>
                            {v.phone}
                          </div>
                        )}
                        {v.email && (
                          <div className="flex items-center gap-2.5 text-xs text-muted">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                            </svg>
                            {v.email}
                          </div>
                        )}
                        {v.remarks && (
                          <p className="text-xs text-muted line-clamp-2 italic pt-2.5 border-t border-[#F5F6F9] mt-2.5">{v.remarks}</p>
                        )}
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <div className="flex items-center justify-between mt-5 pt-3.5 border-t border-[#F5F6F9]">
                         <button 
                           onClick={() => setHistoryModal({ show: true, vendor: v })}
                           className="text-xs font-bold text-[#E05A1E] hover:underline flex items-center gap-1"
                         >
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 1 5-5" /></svg>
                           Payment History
                         </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modal.show && (
        <VendorModal 
          vendor={modal.vendor} 
          onClose={() => setModal({ show: false, vendor: null })} 
          onSave={handleSave}
        />
      )}

      {historyModal.show && (
        <VendorHistoryModal 
          vendor={historyModal.vendor} 
          isAdmin={isAdmin}
          onClose={() => setHistoryModal({ show: false, vendor: null })} 
        />
      )}
    </AppLayout>
  );
}

function VendorHistoryModal({ vendor, isAdmin, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closedMonths, setClosedMonths] = useState(new Set());
  const [unlockedMonths, setUnlockedMonths] = useState(new Set());

  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data } = await api.get(`/finances/transactions?vendor_id=${vendor.id}&category=vendor_payment`);
        setPayments(data.transactions);
      } catch (err) {
        toast.error('Failed to load payment history');
      } finally {
        setLoading(false);
      }
    }
    async function fetchClosedMonths() {
      try {
        const { data } = await api.get('/monthly-close/history');
        const closed = new Set();
        const unlocked = new Set();
        data.forEach(log => {
          closed.add(`${log.month}-${log.year}`);
          if (log.is_unlocked) {
            unlocked.add(`${log.month}-${log.year}`);
          }
        });
        setClosedMonths(closed);
        setUnlockedMonths(unlocked);
      } catch (err) {
        console.error('Failed to load closed months:', err);
      }
    }
    fetchHistory();
    fetchClosedMonths();
  }, [vendor.id]);

  const handleDeletePayment = async (id, date) => {
    if (!window.confirm('Are you sure you want to delete this vendor payment record?')) return;
    try {
      await api.delete(`/finances/transactions/${id}`);
      toast.success('Vendor payment deleted successfully');
      // Refresh payments
      const { data } = await api.get(`/finances/transactions?vendor_id=${vendor.id}&category=vendor_payment`);
      setPayments(data.transactions);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete payment');
    }
  };

  const isPaymentDeletable = (dateStr) => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    const isClosed = closedMonths.has(`${m}-${y}`);
    const isUnlocked = unlockedMonths.has(`${m}-${y}`);
    if (isClosed && !isUnlocked) return false;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl card border border-[#E0E0E0] shadow-2xl animate-in fade-in zoom-in duration-200 p-0 overflow-hidden">
        <div className="p-6 border-b border-[#F0F0F0] flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-[#1A1A1A]">Payment History</h3>
            <p className="text-xs text-muted">Vendor: <span className="text-[#E05A1E] font-bold">{vendor.name}</span></p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white border-b border-[#F0F0F0] sticky top-0">
              <tr>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Project</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Description</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest text-right">Amount</th>
                {isAdmin && <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest text-center w-12 no-print"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-16 rounded" /></td>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-32 rounded" /></td>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-48 rounded" /></td>
                    <td className="px-6 py-4 text-right"><div className="skeleton h-3 w-12 ml-auto rounded" /></td>
                    {isAdmin && <td className="px-6 py-4"><div className="skeleton h-3 w-6 mx-auto rounded" /></td>}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-6 py-10 text-center text-muted italic">No payments found for this vendor</td>
                </tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-muted">
                      {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#1A1A1A]">
                      {p.project_name || 'General'}
                    </td>
                    <td className="px-6 py-4 text-muted italic">
                      {p.description}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                      ₹{parseFloat(p.amount).toLocaleString()}
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-center no-print">
                        {isPaymentDeletable(p.date) ? (
                          <button
                            onClick={() => handleDeletePayment(p.id, p.date)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete payment record"
                          >
                            <Trash2 size={12} className="mx-auto" />
                          </button>
                        ) : (
                          <span className="text-gray-300 cursor-help" title="Period is locked. Unlock the period to delete.">
                            <Lock size={10} className="mx-auto" />
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-[#F0F0F0] flex justify-between items-center">
          <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Total Paid To Date</span>
          <span className="text-base font-black text-[#1A1A1A]">
            ₹{payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
