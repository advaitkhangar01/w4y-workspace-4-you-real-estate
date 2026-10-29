// client/src/components/projects/RecordPaymentModal.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function RecordPaymentModal({ invoice, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const totalAmount = parseFloat(invoice.amount || 0);
  const alreadyReceived = parseFloat(invoice.received_amount || 0);
  const tdsAmount = parseFloat(invoice.tax_details?.tdsAmount || 0);
  const remainingBalance = Math.max(0, totalAmount - alreadyReceived - tdsAmount);

  useEffect(() => {
    // Default to the full remaining balance
    setAmount(remainingBalance.toString());
  }, [remainingBalance]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const paymentVal = parseFloat(amount);

    if (isNaN(paymentVal) || paymentVal <= 0) {
      toast.error('Please enter a valid positive payment amount');
      return;
    }

    if (paymentVal > remainingBalance + 0.01) {
      toast.error(`Payment amount exceeds the remaining balance of ₹${remainingBalance.toLocaleString('en-IN')}`);
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/record-payment`, { amount: paymentVal });
      toast.success(data.message || 'Payment recorded successfully!');
      if (onSave) onSave();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const fillFullBalance = () => {
    setAmount(remainingBalance.toString());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl overflow-hidden flex flex-col bg-white rounded-2xl">
        {/* Header */}
        <div className="p-4 border-b border-[#F0F0F0] flex items-center justify-between">
          <h3 className="text-sm font-black text-[#1A1A1A] uppercase tracking-wider">Record Payment</h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Info panel */}
        <div className="p-5 bg-slate-50 border-b border-[#F0F0F0] space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500 font-medium">Invoice:</span>
            <span className="font-mono font-bold text-[#E05A1E]">{invoice.invoice_no}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-gray-500 font-medium">Client:</span>
            <span className="text-[#1A1A1A] font-bold">{invoice.client_name}</span>
          </div>

          <hr className="border-[#F0F0F0]" />

          <div className={`grid ${tdsAmount > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2 pt-1 text-center`}>
            <div className="p-2 bg-white rounded-xl border border-gray-100">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total bill</p>
              <p className="text-xs font-black text-gray-800 mt-0.5">₹{totalAmount.toLocaleString('en-IN')}</p>
            </div>
            {tdsAmount > 0 && (
              <div className="p-2 bg-red-50/50 rounded-xl border border-red-100/50">
                <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider">TDS</p>
                <p className="text-xs font-black text-red-600 mt-0.5">₹{tdsAmount.toLocaleString('en-IN')}</p>
              </div>
            )}
            <div className="p-2 bg-white rounded-xl border border-gray-100">
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Received</p>
              <p className="text-xs font-black text-emerald-600 mt-0.5">₹{alreadyReceived.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-2 bg-orange-50/50 rounded-xl border border-orange-100/50">
              <p className="text-[9px] text-orange-400 font-bold uppercase tracking-wider">Pending</p>
              <p className="text-xs font-black text-orange-600 mt-0.5">₹{remainingBalance.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
              Payment Amount (₹)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalance}
                required
                className="input w-full pr-20 font-mono font-bold text-base"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                onClick={fillFullBalance}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-[#E05A1E] hover:text-[#b8420e] bg-orange-50 border border-orange-100 px-2 py-1 rounded"
              >
                Full Bal
              </button>
            </div>
            <p className="text-[10px] text-gray-400 italic">
              Recording this will create a ledger income entry under project receipt.
            </p>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-[#F0F0F0]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn-secondary text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !amount || parseFloat(amount) <= 0}
              className="btn-primary text-xs uppercase tracking-wider px-5 flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Recording...
                </>
              ) : (
                'Record Payment'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
