import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';

export default function ProjectStakeholderModal({ projectId, stakeholder, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    role: 'POC',
    phone: '',
    email: '',
    is_primary: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    if (!stakeholder) {
      api.get('/clients').then(res => setClients(res.data.clients || [])).catch(console.error);
    }
  }, [stakeholder]);

  const handleClientSelect = (e) => {
    const clientId = e.target.value;
    if (!clientId) return;
    const client = clients.find(c => c.id === parseInt(clientId));
    if (client) {
      setFormData(prev => ({
        ...prev,
        name: client.name || prev.name,
        role: 'Client',
        phone: client.primary_contact_phone || prev.phone,
        email: client.primary_contact_email || prev.email,
      }));
    }
  };

  useEffect(() => {
    if (stakeholder) {
      setFormData({
        name: stakeholder.name || '',
        role: stakeholder.role || 'POC',
        phone: stakeholder.phone || '',
        email: stakeholder.email || '',
        is_primary: stakeholder.is_primary || false,
      });
    }
  }, [stakeholder]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return toast.error('Name is required');
    if (!formData.phone.trim() && !formData.email.trim()) return toast.error('Phone or email is required');

    setSubmitting(true);
    try {
      if (stakeholder) {
        await api.patch(`/projects/${projectId}/stakeholders/${stakeholder.id}`, formData);
        toast.success('Stakeholder updated');
      } else {
        await api.post(`/projects/${projectId}/stakeholders`, formData);
        toast.success('Stakeholder added');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save stakeholder');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {stakeholder ? 'Edit Stakeholder' : 'Add New Stakeholder'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!stakeholder && clients.length > 0 && (
            <div className="space-y-1 mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <label className="text-xs font-bold text-blue-800 uppercase flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Auto-fill from existing client (Optional)
              </label>
              <select onChange={handleClientSelect} defaultValue="" className="input w-full bg-white border-blue-200">
                <option value="" disabled>-- Select a Client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600 uppercase">Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input w-full"
              placeholder="e.g. John Doe"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600 uppercase">Role</label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="input w-full"
            >
              <option value="Manager">Manager</option>
              <option value="Architect">Architect</option>
              <option value="Contractor">Contractor</option>
              <option value="POC">Point of Contact (POC)</option>
              <option value="Client">Client</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g. 9876543210"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="input w-full"
                placeholder="e.g. john@example.com"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-orange-50 hover:border-orange-200 transition-colors">
            <input
              type="checkbox"
              name="is_primary"
              checked={formData.is_primary}
              onChange={handleChange}
              className="w-5 h-5 text-[#E05A1E] rounded border-gray-300 focus:ring-[#E05A1E]"
            />
            <div className="flex flex-col">
              <span className="text-sm font-bold text-gray-900">Mark as Primary</span>
              <span className="text-[10px] text-gray-500">This contact will be highlighted as the main POC.</span>
            </div>
          </label>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary px-6">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary px-6">
              {submitting ? 'Saving...' : 'Save Stakeholder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
