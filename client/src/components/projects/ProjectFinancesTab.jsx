// client/src/components/projects/ProjectFinancesTab.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { 
  Briefcase, FileText, TrendingUp, ArrowDownRight, 
  CheckCircle2, Activity, RefreshCw
} from 'lucide-react';

export default function ProjectFinancesTab({ projectId }) {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    total_income: 0, total_expense: 0, billed_income: 0,
    received_income: 0, pending_income: 0, unbilled_income: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchFinances = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [transRes, sumRes] = await Promise.all([
        api.get(`/finances/transactions?project_id=${projectId}`),
        api.get(`/finances/summary?project_id=${projectId}`)
      ]);
      setTransactions(transRes.data.transactions);
      setSummary(sumRes.data);
      setLastUpdated(new Date());
    } catch (err) {
      toast.error('Failed to load project accounts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchFinances();
  }, [fetchFinances]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  const netProfit = (parseFloat(summary.total_income) || 0) - (parseFloat(summary.total_expense) || 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Alert if no project value / documents set */}
      {Number(summary.total_income) === 0 && (
        <div className="p-4 bg-orange-50/60 border border-orange-100 rounded-xl flex gap-3 text-orange-800 text-xs">
          <div className="p-1 bg-orange-100/60 rounded-lg text-[#E05A1E] self-start">
            <TrendingUp size={16} />
          </div>
          <div>
            <p className="font-bold text-orange-950">No Document Amounts Set</p>
            <p className="mt-1 text-orange-900/80 leading-relaxed">
              The <strong>Total Project Value</strong> and <strong>Unbilled Amount</strong> are calculated based on values entered in the <strong>Documents</strong> tab. Please add amounts to your project documents to populate these metrics.
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Box 1: Total Project Value */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Project Value</p>
          <h3 className="text-2xl font-black text-gray-900 mt-2">₹{(Number(summary.total_income) || 0).toLocaleString('en-IN')}</h3>
          <div className="absolute top-0 right-0 p-3 opacity-5">
            <Briefcase size={40} />
          </div>
        </div>

        {/* Box 2: Billed Amount */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Billed Amount</p>
          <h3 className="text-2xl font-black text-blue-600 mt-2">₹{(Number(summary.billed_income) || 0).toLocaleString('en-IN')}</h3>
          <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600">
            <FileText size={40} />
          </div>
        </div>

        {/* Box 3: Unbilled Amount */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unbilled Amount</p>
          <h3 className="text-2xl font-black text-gray-600 mt-2">₹{(Number(summary.unbilled_income) || 0).toLocaleString('en-IN')}</h3>
          <div className="absolute top-0 right-0 p-3 opacity-5">
            <TrendingUp size={40} />
          </div>
        </div>

        {/* Box 4: Total Expenses */}
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Total Expenses</p>
          <h3 className="text-2xl font-black text-red-500 mt-2">₹{(Number(summary.total_expense) || 0).toLocaleString('en-IN')}</h3>
          <p className="text-[10px] text-muted mt-1 italic">Excl. vendor payments</p>
          <div className="absolute top-0 right-0 p-3 opacity-5 text-red-500">
            <ArrowDownRight size={40} />
          </div>
        </div>

        {/* Box 5: Received Amount */}
        <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Received Amount</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-2">₹{(Number(summary.received_income) || 0).toLocaleString('en-IN')}</h3>
          <div className="absolute top-0 right-0 p-3 opacity-10 text-emerald-600">
            <CheckCircle2 size={40} />
          </div>
        </div>

        {/* Box 6: Pending Amount */}
        <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden group">
          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pending Amount</p>
          <h3 className="text-2xl font-black text-orange-600 mt-2">₹{(Number(summary.pending_income) || 0).toLocaleString('en-IN')}</h3>
          <div className="absolute top-0 right-0 p-3 opacity-10 text-orange-500">
            <Activity size={40} />
          </div>
        </div>

        {/* Box 7: Profit & Loss */}
        <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group md:col-span-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Profit & Loss (Realized)</p>
              <div className="flex items-baseline gap-3 mt-2">
                <h3 className={`text-2xl font-black ${((Number(summary.received_income) || 0) - (Number(summary.total_expense) || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ₹{((Number(summary.received_income) || 0) - (Number(summary.total_expense) || 0)).toLocaleString('en-IN')}
                </h3>
                <span className="text-[10px] font-bold text-gray-400 italic">Formula: Received - Expenses</span>
              </div>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <Activity size={20} className="text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Transaction History */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 1 5-5" />
            </svg>
            Accounts Timeline
          </h3>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[10px] text-muted italic hidden sm:block">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchFinances(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#E05A1E] border border-[#E05A1E]/30 rounded-lg hover:bg-[#E05A1E] hover:text-white transition-all disabled:opacity-50"
              title="Refresh accounts data"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Syncing…' : 'Refresh'}
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 font-bold text-muted uppercase tracking-tighter">Date</th>
                <th className="px-4 py-3 font-bold text-muted uppercase tracking-tighter">Type</th>
                <th className="px-4 py-3 font-bold text-muted uppercase tracking-tighter">Details</th>
                <th className="px-4 py-3 font-bold text-muted uppercase tracking-tighter text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <tr><td colSpan="4" className="px-4 py-8 text-center text-muted italic">No financial history for this project</td></tr>
              ) : (
                transactions.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{new Date(t.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[9px] ${
                        t.type === 'income' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                        t.type === 'expense' ? 'bg-red-50 text-red-600 border border-red-100' :
                        t.type === 'payment_stage' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                        t.type === 'invoice' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' :
                        'bg-gray-50 text-gray-600 border border-gray-100'
                      }`}>
                        {t.type === 'payment_stage' ? 'Milestone' :
                         t.type === 'invoice' ? 'Invoice' :
                         (t.category || t.type || 'transaction').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-[#1A1A1A]">{t.description}</span>
                        {t.vendor_name && <span className="text-[10px] text-muted">Paid to: {t.vendor_name}</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${
                      t.type === 'income' ? 'text-emerald-600' :
                      t.type === 'expense' ? 'text-red-600' :
                      t.type === 'payment_stage' ? 'text-blue-600' :
                      t.type === 'invoice' ? 'text-indigo-600' :
                      'text-gray-600'
                    }`}>
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '•'} ₹{(Number(t.amount) || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
