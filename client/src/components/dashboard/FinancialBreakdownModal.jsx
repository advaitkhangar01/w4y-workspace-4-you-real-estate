import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function FinancialBreakdownModal({ isOpen, onClose, type, label }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && type) {
      const fetchBreakdown = async () => {
        try {
          setLoading(true);
          const { data } = await api.get(`/dashboard/admin/finances/breakdown?type=${type}`);
          setItems(data.items || []);
        } catch (err) {
          toast.error('Failed to load breakdown');
        } finally {
          setLoading(false);
        }
      };
      fetchBreakdown();
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col w-full max-w-2xl max-h-[80vh] overflow-hidden transition-all transform scale-100">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">{label} Breakdown</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Showing contributing items</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-slate-100 text-slate-400 hover:text-slate-600 hover:shadow-md transition-all flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {loading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center pb-4 border-b border-slate-50">
                  <div className="space-y-2">
                    <div className="skeleton h-4 w-40 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                  <div className="skeleton h-6 w-24 rounded" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-slate-400 italic text-sm">No data available for this breakdown</p>
            </div>
          ) : (
            <div className="space-y-0">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail</th>
                    <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {items.map((item, idx) => (
                    <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 pr-4">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-[#E05A1E] transition-colors">
                          {type === 'expenses' ? item.description : item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {type === 'expenses' ? (
                            <>
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-widest border border-slate-200">
                                {item.category}
                              </span>
                              {item.project_name && (
                                <span className="text-[10px] font-bold text-slate-400">@ {item.project_name}</span>
                              )}
                              <span className="text-[9px] font-bold text-slate-300 ml-auto tracking-widest uppercase">{new Date(item.date).toLocaleDateString()}</span>
                            </>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Project #{item.id}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        <p className="text-base font-black text-slate-900 tracking-tight font-mono">₹{item.amount.toLocaleString('en-IN')}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Verified Amount</p>
            <p className="text-2xl font-black text-[#E05A1E] tracking-tighter">
              ₹{items.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
