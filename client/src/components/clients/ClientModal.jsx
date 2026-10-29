// client/src/components/clients/ClientModal.jsx
import { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function ClientModal({ client: initialClient, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company_name: '',
    gst_number: '',
    pan_number: '',
    notes: '',
    contacts: [{ name: '', role: 'POC', phone: '', email: '', is_primary: true }],
    addresses: [{ type: 'Office', address: '', city: '', state: '', pincode: '' }],
    banking: [{ account_name: '', account_number: '', ifsc: '', bank_name: '', branch: '', upi_id: '', is_primary: true }]
  });

  useEffect(() => {
    if (initialClient) {
      // Fetch full details if editing
      const fetchDetails = async () => {
        try {
          const { data } = await api.get(`/clients/${initialClient.id}`);
          setForm({
            name: data.client.name || '',
            company_name: data.client.company_name || '',
            gst_number: data.client.gst_number || '',
            pan_number: data.client.pan_number || '',
            notes: data.client.notes || '',
            contacts: data.contacts?.length ? data.contacts : [{ name: '', role: 'POC', phone: '', email: '', is_primary: true }],
            addresses: data.addresses?.length ? data.addresses : [{ type: 'Office', address: '', city: '', state: '', pincode: '' }],
            banking: data.banking?.length ? data.banking : [{ account_name: '', account_number: '', ifsc: '', bank_name: '', branch: '', upi_id: '', is_primary: true }]
          });
        } catch {
          toast.error('Failed to load client details');
        }
      };
      fetchDetails();
    }
  }, [initialClient]);

  const addContact = () => setForm({ ...form, contacts: [...form.contacts, { name: '', role: 'POC', phone: '', email: '', is_primary: false }] });
  const removeContact = (idx) => setForm({ ...form, contacts: form.contacts.filter((_, i) => i !== idx) });
  const updateContact = (idx, field, val) => {
    const next = [...form.contacts];
    if (field === 'is_primary' && val) {
      next.forEach((c, i) => c.is_primary = i === idx);
    } else {
      next[idx][field] = val;
    }
    setForm({ ...form, contacts: next });
  };

  const addAddress = () => setForm({ ...form, addresses: [...form.addresses, { type: 'Office', address: '', city: '', state: '', pincode: '' }] });
  const removeAddress = (idx) => setForm({ ...form, addresses: form.addresses.filter((_, i) => i !== idx) });
  const updateAddress = (idx, field, val) => {
    const next = [...form.addresses];
    next[idx][field] = val;
    setForm({ ...form, addresses: next });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Client name is required');
    
    // Ensure at least one contact exists and has a phone number
    if (!form.contacts[0]?.phone?.trim()) {
      return toast.error('Phone number is required');
    }

    // Auto-fill contact name if missing
    const updatedContacts = form.contacts.map(c => ({
      ...c,
      name: c.name.trim() || form.name.trim()
    }));

    setLoading(true);
    const payload = { ...form, contacts: updatedContacts };

    try {
      if (initialClient?.id) {
        await api.patch(`/clients/${initialClient.id}`, payload);
        toast.success('Client updated');
      } else {
        await api.post('/clients', payload);
        toast.success('Client created');
      }
      onSave();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl my-8 bg-white rounded-2xl border border-[#E0E0E0] shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-[#F0F0F0] sticky top-0 bg-white z-10 rounded-t-2xl">
          <h3 className="text-lg font-bold text-[#1A1A1A]">
            {initialClient ? 'Edit Client Account' : 'New Client Account'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors p-2 hover:bg-[#F5F5F5] rounded-full">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8 overflow-y-auto">
          {/* Section: Basic Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#E05A1E] mb-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h10"/></svg>
              <h4 className="text-sm font-bold uppercase tracking-wider">🧾 Basic Information</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Client Display Name *</label>
                <input className="input" placeholder="e.g. Mr. Rajesh Sharma" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Company Name</label>
                <input className="input" placeholder="e.g. Sharma Architects Pvt Ltd" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div>
                <label className="label">GST Number</label>
                <input className="input" placeholder="27XXXXX..." value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} />
              </div>
              <div>
                <label className="label">PAN Number</label>
                <input className="input" placeholder="ABCDE1234F" value={form.pan_number} onChange={(e) => setForm({ ...form, pan_number: e.target.value })} />
              </div>
              <div>
                <label className="label">Phone Number *</label>
                <input 
                  className="input" 
                  placeholder="e.g. 9876543210" 
                  value={form.contacts[0]?.phone || ''} 
                  onChange={(e) => updateContact(0, 'phone', e.target.value)} 
                />
              </div>
            </div>
            <div>
              <label className="label">Internal Notes</label>
              <textarea className="input min-h-[60px]" placeholder="Special requirements, billing cycle, etc." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {/* Section: Contacts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#E05A1E]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <h4 className="text-sm font-bold uppercase tracking-wider">👥 Stakeholders / Contacts</h4>
              </div>
              <button type="button" onClick={addContact} className="text-xs font-bold text-[#E05A1E] hover:underline">+ Add Contact</button>
            </div>
            
            <div className="space-y-3">
              {form.contacts.map((c, i) => (
                <div key={i} className="p-4 bg-[#F8F9FA] rounded-xl border border-[#E0E0E0] relative group">
                  {form.contacts.length > 1 && (
                    <button type="button" onClick={() => removeContact(i)} className="absolute top-2 right-2 p-1 text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Name *</label>
                      <input className="input h-9 px-2 text-xs" value={c.name} onChange={(e) => updateContact(i, 'name', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Role</label>
                      <select className="input h-9 px-2 text-xs" value={c.role} onChange={(e) => updateContact(i, 'role', e.target.value)}>
                        <option value="Manager">Manager</option>
                        <option value="POC">Point of Contact</option>
                        <option value="Assistant">Assistant</option>
                        <option value="Receptionist">Receptionist</option>
                        <option value="Accountant">Accountant</option>
                        <option value="Owner">Owner</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Phone</label>
                      <input className="input h-9 px-2 text-xs" value={c.phone} onChange={(e) => updateContact(i, 'phone', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-muted uppercase">Email</label>
                      <input className="input h-9 px-2 text-xs" value={c.email} onChange={(e) => updateContact(i, 'email', e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input type="checkbox" checked={c.is_primary} onChange={(e) => updateContact(i, 'is_primary', e.target.checked)} className="accent-[#E05A1E]" />
                    <span className="text-[10px] font-medium text-muted">Primary Contact</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Addresses */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#E05A1E]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <h4 className="text-sm font-bold uppercase tracking-wider">📍 Addresses</h4>
              </div>
              <button type="button" onClick={addAddress} className="text-xs font-bold text-[#E05A1E] hover:underline">+ Add Address</button>
            </div>

            <div className="space-y-3">
              {form.addresses.map((a, i) => (
                <div key={i} className="p-4 bg-[#F8F9FA] rounded-xl border border-[#E0E0E0] relative group">
                   <button type="button" onClick={() => removeAddress(i)} className="absolute top-2 right-2 p-1 text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                   </button>
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-muted uppercase">Type</label>
                        <select className="input h-9 px-2 text-xs" value={a.type} onChange={(e) => updateAddress(i, 'type', e.target.value)}>
                          <option value="Office">Office</option>
                          <option value="Billing">Billing</option>
                          <option value="Site">Site</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-[10px] font-bold text-muted uppercase">Full Address</label>
                        <input className="input h-9 px-2 text-xs" value={a.address} onChange={(e) => updateAddress(i, 'address', e.target.value)} />
                      </div>
                      <div className="grid grid-cols-3 gap-3 md:col-span-4">
                        <div>
                          <label className="text-[10px] font-bold text-muted uppercase">City</label>
                          <input className="input h-9 px-2 text-xs" value={a.city} onChange={(e) => updateAddress(i, 'city', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted uppercase">State</label>
                          <input className="input h-9 px-2 text-xs" value={a.state} onChange={(e) => updateAddress(i, 'state', e.target.value)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-muted uppercase">Pincode</label>
                          <input className="input h-9 px-2 text-xs" value={a.pincode} onChange={(e) => updateAddress(i, 'pincode', e.target.value)} />
                        </div>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Banking */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#E05A1E]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              <h4 className="text-sm font-bold uppercase tracking-wider">💳 Banking Details</h4>
            </div>
            <div className="p-4 bg-[#F8F9FA] rounded-xl border border-[#E0E0E0]">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold text-muted uppercase">Account Name</label>
                    <input className="input h-9 px-2 text-xs" value={form.banking[0]?.account_name} 
                      onChange={(e) => {
                        const next = [...form.banking];
                        next[0] = { ...next[0], account_name: e.target.value };
                        setForm({ ...form, banking: next });
                      }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">Bank Name</label>
                    <input className="input h-9 px-2 text-xs" value={form.banking[0]?.bank_name} 
                      onChange={(e) => {
                        const next = [...form.banking];
                        next[0] = { ...next[0], bank_name: e.target.value };
                        setForm({ ...form, banking: next });
                      }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">Account Number</label>
                    <input className="input h-9 px-2 text-xs" value={form.banking[0]?.account_number} 
                      onChange={(e) => {
                        const next = [...form.banking];
                        next[0] = { ...next[0], account_number: e.target.value };
                        setForm({ ...form, banking: next });
                      }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">IFSC Code</label>
                    <input className="input h-9 px-2 text-xs" value={form.banking[0]?.ifsc} 
                      onChange={(e) => {
                        const next = [...form.banking];
                        next[0] = { ...next[0], ifsc: e.target.value.toUpperCase() };
                        setForm({ ...form, banking: next });
                      }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase">UPI ID</label>
                    <input className="input h-9 px-2 text-xs" value={form.banking[0]?.upi_id} 
                      onChange={(e) => {
                        const next = [...form.banking];
                        next[0] = { ...next[0], upi_id: e.target.value };
                        setForm({ ...form, banking: next });
                      }} />
                  </div>
               </div>
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-[#F0F0F0] bg-[#FAFAFA] rounded-b-2xl sticky bottom-0 z-10 flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex-1 justify-center">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (initialClient ? 'Update Account' : 'Save Client Account')}
          </button>
        </div>
      </div>
    </div>
  );
}
