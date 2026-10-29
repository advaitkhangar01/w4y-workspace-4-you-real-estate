// client/src/components/projects/VendorsTab.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { Lock, Trash2 } from 'lucide-react';

export default function VendorsTab({ projectId, isAdmin, isAccounts, isDesignHead }) {
  const [projectVendors, setProjectVendors] = useState([]);
  const [allVendors, setAllVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const [closedMonths, setClosedMonths] = useState(new Set());
  const [unlockedMonths, setUnlockedMonths] = useState(new Set());

  const fetchVendors = useCallback(async () => {
    try {
      const [projVendorsRes, allVendorsRes] = await Promise.all([
        api.get(`/projects/${projectId}/vendors`),
        api.get('/vendors')
      ]);
      setProjectVendors(projVendorsRes.data.vendors);
      setAllVendors(allVendorsRes.data.vendors);
    } catch (err) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchPayments = useCallback(async () => {
    try {
      const { data } = await api.get(`/finances/transactions?project_id=${projectId}&category=vendor_payment`);
      setPayments(data.transactions);
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setPaymentsLoading(false);
    }
  }, [projectId]);

  const fetchClosedMonths = useCallback(async () => {
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
  }, []);

  const handleDeletePayment = async (id, date) => {
    if (!window.confirm('Are you sure you want to delete this vendor payment record?')) return;
    try {
      await api.delete(`/finances/transactions/${id}`);
      toast.success('Vendor payment deleted successfully');
      fetchPayments();
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

  useEffect(() => {
    fetchVendors();
    if (isAdmin || isAccounts) {
      fetchPayments();
      fetchClosedMonths();
    }
  }, [fetchVendors, fetchPayments, fetchClosedMonths, isAdmin, isAccounts]);

  const handleAddVendor = async (e) => {
    e.preventDefault();
    if (!selectedVendorId) return;

    try {
      await api.post(`/projects/${projectId}/vendors`, { vendor_id: selectedVendorId });
      toast.success('Vendor added to project');
      setShowAddModal(false);
      setSelectedVendorId('');
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add vendor');
    }
  };

  const handleRemoveVendor = async (vendorId) => {
    if (!window.confirm('Remove this vendor from the project?')) return;

    try {
      await api.delete(`/projects/${projectId}/vendors/${vendorId}`);
      toast.success('Vendor removed');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to remove vendor');
    }
  };

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedVendorForPayment, setSelectedVendorForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');

  const handleMakePayment = async (e) => {
    e.preventDefault();
    if (!selectedVendorForPayment || !paymentAmount) return;

    try {
      await api.post('/finances/transactions', {
        type: 'expense',
        category: 'vendor_payment',
        amount: parseFloat(paymentAmount),
        description: paymentDescription || `Payment to ${selectedVendorForPayment.name} for project`,
        project_id: projectId,
        vendor_id: selectedVendorForPayment.id,
        date: new Date().toISOString().split('T')[0]
      });
      toast.success('Payment recorded successfully');
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentDescription('');
      setSelectedVendorForPayment(null);
      fetchPayments();
    } catch (err) {
      toast.error('Failed to record payment');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
    );
  }

  // Filter out vendors already in the project
  const availableVendors = allVendors.filter(
    v => !projectVendors.some(pv => pv.id === v.id)
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          Project Vendors
        </h3>
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary py-1.5 px-3 text-xs flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Vendor
        </button>
      </div>

      {projectVendors.length === 0 ? (
        <div className="card py-12 text-center border-dashed">
          <p className="text-gray-500 font-medium">No vendors assigned to this project</p>
          <p className="text-xs text-gray-400 mt-1">Click "Add Vendor" to link a vendor from the catalog.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectVendors.map(v => (
            <div key={v.id} className="card relative group hover:shadow-md transition-all">
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {(isAdmin || isAccounts) && (
                    <button 
                      onClick={() => { setSelectedVendorForPayment(v); setShowPaymentModal(true); }}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Pay Vendor"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => handleRemoveVendor(v.id)}
                      className="p-1.5 text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from project"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center font-bold text-slate-400 border border-slate-100">
                  {v.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#1A1A1A]">{v.name}</h4>
                  <span className="text-[10px] font-bold text-[#E05A1E] uppercase tracking-tighter bg-orange-50 px-1.5 py-0.5 rounded">{v.category}</span>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-50 pt-3">
                {v.phone && (
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1-2 2 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    {v.phone}
                  </div>
                )}
                {v.email && (
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    {v.email}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl scale-in-center">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-[#1A1A1A]">Add Vendor to Project</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-[#1A1A1A]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleAddVendor} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase ml-1">Select Vendor from Catalog</label>
                <select
                  className="input mt-1 w-full"
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  required
                >
                  <option value="">-- Choose a Vendor --</option>
                  {/* Group available vendors by category */}
                  {Object.entries(
                    availableVendors.reduce((acc, v) => {
                      if (!acc[v.category]) acc[v.category] = [];
                      acc[v.category].push(v);
                      return acc;
                    }, {})
                  ).map(([category, vendors]) => (
                    <optgroup key={category} label={category}>
                      {vendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {availableVendors.length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1 italic">All vendors from the catalog are already assigned to this project.</p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-bold text-muted hover:text-[#1A1A1A]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!selectedVendorId}
                  className="btn-primary py-2 px-6 text-xs"
                >
                  Link Vendor
                </button>
              </div>
            </form>
            
            <div className="mt-6 pt-4 border-t border-slate-50">
              <p className="text-[10px] text-muted text-center italic">
                Need to add a new vendor to the catalog? 
                <a href="/vendors" className="text-[#E05A1E] ml-1 hover:underline">Go to Vendor Catalog</a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pay Vendor Modal */}
      {showPaymentModal && selectedVendorForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl scale-in-center">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-[#1A1A1A]">Record Vendor Payment</h3>
                <p className="text-xs text-muted">Paying: <span className="text-[#E05A1E] font-bold">{selectedVendorForPayment.name}</span></p>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-muted hover:text-[#1A1A1A]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <form onSubmit={handleMakePayment} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase ml-1">Payment Amount (₹)</label>
                <input 
                  type="number" 
                  className="input mt-1" 
                  placeholder="0.00"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted uppercase ml-1">Description / Remarks</label>
                <textarea 
                  className="input mt-1 min-h-[80px]" 
                  placeholder="e.g., Payment for plumbing materials..."
                  value={paymentDescription}
                  onChange={(e) => setPaymentDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-4 py-2 text-xs font-bold text-muted hover:text-[#1A1A1A]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!paymentAmount}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-6 rounded-lg text-xs font-bold transition-all"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment History Section */}
      {(isAdmin || isAccounts) && (
        <div className="card overflow-hidden mt-8 border-[#EBEBEB]">
          <div className="p-4 border-b border-[#EBEBEB] bg-gray-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 1 5-5" />
              </svg>
              Vendor Payment History
            </h3>
            <span className="text-[10px] font-bold text-muted uppercase bg-white px-2 py-1 rounded-full border border-[#EBEBEB]">
              {payments.length} Payments
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white border-b border-[#EBEBEB]">
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Date</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Vendor</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Description</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-right">Amount</th>
                  {isAdmin && <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-center w-12 no-print"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {paymentsLoading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="skeleton h-3 w-20 rounded" /></td>
                      <td className="px-6 py-4"><div className="skeleton h-3 w-32 rounded" /></td>
                      <td className="px-6 py-4"><div className="skeleton h-3 w-48 rounded" /></td>
                      <td className="px-6 py-4 text-right"><div className="skeleton h-3 w-16 ml-auto rounded" /></td>
                      {isAdmin && <td className="px-6 py-4"><div className="skeleton h-3 w-6 mx-auto rounded" /></td>}
                    </tr>
                  ))
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-6 py-12 text-center text-muted italic">
                      No vendor payments recorded for this project yet.
                    </td>
                  </tr>
                ) : (
                  payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-muted whitespace-nowrap">
                        {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-[#1A1A1A]">{p.vendor_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-muted line-clamp-1" title={p.description}>{p.description}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-mono font-bold text-emerald-600">
                          ₹{parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
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
              {payments.length > 0 && (
                <tfoot className="bg-gray-50/80 border-t border-[#EBEBEB] font-bold">
                  <tr>
                    <td colSpan="3" className="px-6 py-4 text-right text-[10px] uppercase tracking-widest text-muted">Project Total Vendor Payments</td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-[#1A1A1A]">
                        ₹{payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    {isAdmin && <td className="no-print"></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
