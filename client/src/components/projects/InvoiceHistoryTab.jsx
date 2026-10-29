import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { Lock, CreditCard, CheckCircle2, FileText } from 'lucide-react';
import RecordPaymentModal from './RecordPaymentModal';

export default function InvoiceHistoryTab({ projectId, project }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all', 'received', 'pending'
  const [unbilledStages, setUnbilledStages] = useState([]);
  const unbilledTotal = unbilledStages.reduce((sum, st) => sum + parseFloat(st.amount || 0), 0);
  const navigate = useNavigate();
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleMarkPaid = async (id) => {
    if (!window.confirm('Are you sure you want to mark this invoice as Paid? This will automatically record a finance income transaction.')) return;
    try {
      await api.post(`/invoices/${id}/mark-paid`);
      toast.success('Invoice marked as paid and income recorded!');
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark invoice as paid');
    }
  };

  const filteredInvoicesList = useMemo(() => {
    let list = invoices;
    if (invoiceFilter === 'received') {
      list = invoices.filter(inv => inv.status === 'paid' || (inv.status !== 'cancelled' && parseFloat(inv.received_amount || 0) > 0));
    } else if (invoiceFilter === 'pending') {
      list = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled' && parseFloat(inv.pending_amount || 0) > 0);
    }
    return list;
  }, [invoices, invoiceFilter]);

  const handleGenerateBillFromStage = (inv) => {
    navigate('/admin/invoice', {
      state: {
        preFill: {
          payment_stage_id: parseInt(inv.id.replace('stage-', '')),
          project_id: projectId,
          billToName: project?.client_display_name || project?.client_name || '',
          billToCompany: project?.client_company || '',
          billToAddress: project?.client_address || project?.location || '',
          billToGst: project?.gst_number || '',
          billToPhone: project?.primary_contact_phone || project?.client_phone || project?.project_stakeholder_phone || '',
          billToEmail: project?.primary_contact_email || project?.client_email || project?.project_stakeholder_email || '',
          items: [
            {
              id: Date.now(),
              description: `${inv.invoice_no.replace(' (Stage)', '')} - ${project?.name || ''}`,
              quantity: 1,
              rate: inv.amount || 0
            }
          ]
        }
      }
    });
  };

  const invoiceTotalsBreakdown = useMemo(() => {
    let totalPrincipal = 0;
    let totalGst = 0;
    let totalGrand = 0;

    filteredInvoicesList.forEach(inv => {
      const amount = parseFloat(inv.amount || 0);
      if (inv.is_payment_stage) {
        totalPrincipal += amount;
        totalGrand += amount;
        return;
      }

      const taxDetails = inv.tax_details || {};
      const isGstEnabled = taxDetails.isGstEnabled !== false;

      if (!isGstEnabled) {
        totalPrincipal += amount;
        totalGrand += amount;
        return;
      }

      const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
      const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
      const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
      const isIgst = !!taxDetails.isIgst;

      const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

      if (totalTaxPercent <= 0) {
        totalPrincipal += amount;
        totalGrand += amount;
      } else {
        const principal = amount / (1 + totalTaxPercent / 100);
        const gst = amount - principal;
        totalPrincipal += principal;
        totalGst += gst;
        totalGrand += amount;
      }
    });

    return {
      principal: totalPrincipal,
      gst: totalGst,
      grand: totalGrand
    };
  }, [filteredInvoicesList]);

  const fetchInvoices = useCallback(async () => {
    try {
      const [invoiceRes, stageRes] = await Promise.all([
        api.get(`/invoices?project_id=${projectId}`),
        api.get(`/documents/payment-stages?project_id=${projectId}`)
      ]);
      setInvoices(Array.isArray(invoiceRes.data?.invoices) ? invoiceRes.data.invoices : []);
      setUnbilledStages(
        (stageRes.data?.paymentStages || []).filter(s =>
          s.status?.toLowerCase() === 'payment initiated' && !s.has_active_invoice
        )
      );
    } catch (err) {
      toast.error('Failed to load invoice history');
      setInvoices([]); // Ensure empty state renders cleanly
      setUnbilledStages([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleViewInvoice = (invoice) => {
    navigate('/admin/invoice', { 
      state: { 
        preFill: {
          // Explicit mapping — never spread raw DB record to avoid snake_case/null contamination
          project_id: invoice.project_id || null,
          payment_stage_id: invoice.payment_stage_id || null,
          invoiceNo: invoice.invoice_no || '',
          date: invoice.date ? String(invoice.date).split('T')[0] : '',
          dueDate: invoice.due_date ? String(invoice.due_date).split('T')[0] : '',
          billToName: invoice.client_name || '',
          billToCompany: invoice.client_company || invoice.client_company_full || '',
          billToAddress: invoice.bill_to_address || '',
          billToGst: invoice.bill_to_gst || '',
          billToPhone: invoice.bill_to_phone || '',
          billToEmail: invoice.bill_to_email || '',
          accountNo: invoice.account_no || '',
          ifsc: invoice.ifsc || '',
          bankName: invoice.bank_name || '',
          items: Array.isArray(invoice.items) && invoice.items.length > 0
            ? invoice.items
            : [{ id: Date.now(), description: '', hsn: '', quantity: 1, rate: 0 }],
          cgstPercent: invoice.tax_details?.cgstPercent ?? 9,
          sgstPercent: invoice.tax_details?.sgstPercent ?? 9,
          igstPercent: invoice.tax_details?.igstPercent ?? 18,
          tdsPercent: invoice.tax_details?.tdsPercent ?? 10,
          isTdsEnabled: invoice.tax_details?.isTdsEnabled ?? false,
        } 
      } 
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-full rounded-lg" />
        <div className="skeleton h-12 w-full rounded-lg" />
        <div className="skeleton h-12 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Invoice Archive
          </h3>
          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-[#EBEBEB] shadow-inner">
            {[
              { id: 'all', label: 'All' },
              { id: 'received', label: 'Received' },
              { id: 'pending', label: 'Pending' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setInvoiceFilter(filter.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  invoiceFilter === filter.id
                    ? 'bg-white shadow-sm text-primary'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={() => navigate('/admin/invoice', { 
            state: { 
              preFill: { 
                project_id: projectId,
                billToName: project?.client_display_name || project?.client_name || '',
                billToCompany: project?.client_company || '',
                billToAddress: project?.client_address || project?.location || '',
                billToGst: project?.gst_number || '',
                billToPhone: project?.primary_contact_phone || project?.client_phone || project?.project_stakeholder_phone || '',
                billToEmail: project?.primary_contact_email || project?.client_email || project?.project_stakeholder_email || '',
                items: [{ id: Date.now(), description: '', quantity: 1, rate: 0 }]
              } 
            } 
          })}
          className="text-[10px] font-bold text-[#E05A1E] uppercase tracking-widest hover:underline"
        >
          + Generate New
        </button>
      </div>

      {unbilledStages.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="text-amber-500 mt-0.5">⚠️</span>
          <div>
            <p className="text-xs font-bold text-amber-800">
              {unbilledStages.length} milestone(s) are initiated but not yet billed
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              Unbilled value: ₹{unbilledTotal.toLocaleString('en-IN')} —
              Click "+ Generate New" to select and bill them, or use the "Payment Stages" tab.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-hidden border border-[#EBEBEB] rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-[#F0F0F0] text-muted font-bold uppercase tracking-tighter">
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">S.No.</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice #</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Principal</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">GST</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total Amount</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Received</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pending</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
              <th className="px-2 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {filteredInvoicesList.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-2 py-10 text-center text-muted italic">
                  {invoiceFilter === 'received' ? 'No received or partially paid invoices found for this project.' :
                   invoiceFilter === 'pending' ? 'No pending invoices found for this project.' :
                   'No invoices found for this project.'}
                </td>
              </tr>
            ) : (
              filteredInvoicesList.map((inv, index) => {
                const amount = parseFloat(inv.amount || 0);
                    let principal = amount;
                    let gst = 0;

                    if (!inv.is_payment_stage) {
                      const taxDetails = inv.tax_details || {};
                      const isGstEnabled = taxDetails.isGstEnabled !== false;

                      if (isGstEnabled) {
                        const cgstPercent = parseFloat(taxDetails.cgstPercent ?? 9);
                        const sgstPercent = parseFloat(taxDetails.sgstPercent ?? 9);
                        const igstPercent = parseFloat(taxDetails.igstPercent ?? 18);
                        const isIgst = !!taxDetails.isIgst;
                        const totalTaxPercent = isIgst ? igstPercent : (cgstPercent + sgstPercent);

                        if (totalTaxPercent > 0) {
                          principal = amount / (1 + totalTaxPercent / 100);
                          gst = amount - principal;
                        }
                    }
                  }

                  return (
                      <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-2 py-2 text-gray-500 font-medium">
                          {index + 1}
                        </td>
                        <td className="px-2 py-2 text-[#1A1A1A] font-medium whitespace-nowrap">
                          {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-2 py-2 font-mono text-[#E05A1E] font-bold text-xs whitespace-nowrap">
                          {inv.invoice_no}
                        </td>
                        <td className="px-2 py-2 text-[#1A1A1A] text-right font-mono font-semibold whitespace-nowrap">
                          ₹{principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2 text-gray-500 text-right font-mono font-semibold whitespace-nowrap">
                          ₹{gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2 text-[#1A1A1A] font-bold text-right font-mono text-xs whitespace-nowrap">
                          ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-2 text-emerald-600 font-mono font-bold whitespace-nowrap">
                          ₹{parseFloat(inv.received_amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-2 py-2 text-orange-600 font-mono font-bold whitespace-nowrap">
                          ₹{parseFloat(inv.pending_amount || 0).toLocaleString('en-IN')}
                        </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
                      inv.is_payment_stage ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      inv.status === 'sent' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      inv.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-100' :
                      'bg-orange-50 text-orange-700 border-orange-100'
                    }`}>
                      {inv.is_payment_stage ? 'Payment Stage' : inv.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {inv.is_payment_stage ? (
                      ['bill generated', 'bill delivered', 'paid'].includes(inv.stage_status?.toLowerCase()) ? (
                        <button
                          disabled
                          className="bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest cursor-not-allowed flex items-center justify-center gap-1 ml-auto whitespace-nowrap"
                          title="Bill already generated for this payment stage"
                        >
                          <Lock size={10} />
                          Billed
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateBillFromStage(inv)}
                          className="bg-[#E05A1E] text-white px-1.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#b8420e] transition-all whitespace-nowrap"
                        >
                          + Bill Stage
                        </button>
                      )
                    ) : (
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {inv.status !== 'paid' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedInvoiceForPayment(inv);
                                setShowPaymentModal(true);
                              }}
                              className="bg-orange-50 hover:bg-orange-100 text-[#E05A1E] border border-orange-200 px-1.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-1"
                              title="Record Partial Payment"
                            >
                              <CreditCard size={10} />
                              Pay
                            </button>
                            <button
                              onClick={() => handleMarkPaid(inv.id)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-1"
                              title="Mark as Paid"
                            >
                              <CheckCircle2 size={10} />
                              Paid
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => handleViewInvoice(inv)}
                          className="bg-[#1A1A1A] text-white px-1.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest hover:bg-[#E05A1E] transition-all flex items-center gap-1"
                        >
                          <FileText size={10} />
                          View
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )})
            )}
          </tbody>
          {filteredInvoicesList.length > 0 && (
            <tfoot className="bg-gray-50 font-bold border-t border-[#F0F0F0] text-[10px]">
              <tr className="border-b border-[#F0F0F0]/50">
                <td className="px-2 py-2 text-gray-500 uppercase font-bold" colSpan={3}>
                  Total of {filteredInvoicesList.length} {filteredInvoicesList.length === 1 ? 'Invoice' : 'Invoices'}
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-gray-700">
                  ₹{invoiceTotalsBreakdown.principal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold text-gray-500">
                  ₹{invoiceTotalsBreakdown.gst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2 text-right font-mono text-[#E05A1E] font-bold">
                  ₹{invoiceTotalsBreakdown.grand.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2 text-emerald-600 font-mono font-bold">
                  ₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.received_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-2 py-2 text-orange-600 font-mono font-bold">
                  ₹{filteredInvoicesList.reduce((sum, i) => sum + parseFloat(i.pending_amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl">ℹ️</span>
        <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
          The <strong>Invoice Archive</strong> stores the exact state of the document at the time of generation. 
          Updating project details later will not affect archived invoices to maintain compliance.
        </p>
      </div>

      {showPaymentModal && selectedInvoiceForPayment && (
        <RecordPaymentModal
          invoice={selectedInvoiceForPayment}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoiceForPayment(null);
          }}
          onSave={fetchInvoices}
        />
      )}
    </div>
  );
}
