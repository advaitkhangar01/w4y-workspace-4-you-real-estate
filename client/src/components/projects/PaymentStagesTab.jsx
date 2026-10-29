import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { formatIST } from '../../utils/time';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  'payment initiated': { label: 'Payment Initiated', cls: 'bg-yellow-50 text-yellow-600 border-yellow-100 font-bold' },
  'bill generated': { label: 'Bill Generated', cls: 'bg-blue-50 text-blue-600' },
  'bill delivered': { label: 'Bill Delivered', cls: 'bg-orange-50 text-[#E05A1E]' },
  'pending': { label: 'Bill Delivered', cls: 'bg-orange-50 text-[#E05A1E]' }, // Backward compatibility
  'paid': { label: 'Paid', cls: 'bg-emerald-50 text-emerald-600' },
  'cancelled': { label: 'Cancelled', cls: 'bg-red-50 text-red-600' },
};

export default function PaymentStagesTab({ projectId, project }) {
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchStages = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents/payment-stages?project_id=${projectId}`);
      setStages(data.paymentStages || []);
    } catch (err) {
      toast.error('Failed to load payment stages');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchStages();
  }, [fetchStages]);

  const handleStatusChange = async (stageId, newStatus) => {
    try {
      await api.patch(`/documents/payment-stages/${stageId}`, { status: newStatus });
      setStages(prev => prev.map(s => s.id === stageId ? { ...s, status: newStatus } : s));
      toast.success('Status updated');
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleGenerateBill = (stage) => {
    // Navigate to InvoicePage with pre-filled state
    navigate('/admin/invoice', {
      state: {
        preFill: {
          payment_stage_id: stage.id,
          project_id: projectId,
          billToName: project.client_display_name || project.client_name || '',
          billToCompany: project.client_company || '',
          billToAddress: project.client_address || project.location || '',
          billToGst: project.gst_number || '',
          billToPhone: project.primary_contact_phone || project.client_phone || project.project_stakeholder_phone || '',
          billToEmail: project.primary_contact_email || project.client_email || project.project_stakeholder_email || '',
          shipToAddress: project.location || '',
          items: [
            {
              id: Date.now(),
              description: `${stage.document_type} - ${project.name}`,
              quantity: 1,
              rate: stage.amount || 0
            }
          ]
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Payment Stages
        </h3>
        <span className="badge badge-in-progress">{stages.length} Active Stages</span>
      </div>

      {stages.length === 0 ? (
        <div className="card py-12 text-center border-dashed">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 1 5-5" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No payment stages initiated yet</p>
          <p className="text-sm text-gray-400 mt-1">Initiate stages from the Documents tab using the checkbox.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {stages.map(stage => (
            <div key={stage.id} className="card hover:shadow-md transition-all group border-l-4 border-l-[#E05A1E]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-[#1A1A1A]">{stage.document_type}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      STATUS_CONFIG[stage.status]?.cls || 'bg-gray-50 text-gray-600'
                    }`}>
                      {STATUS_CONFIG[stage.status]?.label || stage.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    Initiated on {formatIST(stage.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-muted uppercase">Amount</p>
                    <p className="text-sm font-bold text-[#1A1A1A]">₹{Number(stage.amount).toLocaleString('en-IN')}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#E05A1E]"
                      value={stage.status}
                      onChange={(e) => handleStatusChange(stage.id, e.target.value)}
                    >
                      <option value="payment initiated">Payment Initiated</option>
                      <option value="bill generated">Bill Generated</option>
                      <option value="bill delivered">Bill Delivered</option>
                      <option value="paid">Paid</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    {stage.has_active_invoice ? (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-400 border border-gray-200 rounded-lg text-xs font-bold cursor-not-allowed select-none">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Already Billed
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateBill(stage)}
                        className="btn-primary py-1.5 px-3 text-xs flex items-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                          <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Bill
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
