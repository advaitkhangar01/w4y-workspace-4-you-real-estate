// client/src/components/builder/ProjectMaterialsTab.jsx
// W4Y Builder Module - Strictly Project-Scoped Material Inventory & Movement Ledger

import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST } from '../../utils/time';

const STOCK_STATUS_BADGES = {
  'In Stock': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Low Stock': 'bg-amber-50 text-amber-700 border-amber-200',
  'Pending Delivery': 'bg-blue-50 text-blue-700 border-blue-200',
  'Out of Stock': 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function ProjectMaterialsTab({ projectId, stages = [] }) {
  const [materials, setMaterials] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals state
  const [showAddNeededModal, setShowAddNeededModal] = useState(false);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState(null);

  // Detail Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerData, setDrawerData] = useState(null);

  // Fetch materials for current project
  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/builder/projects/${projectId}/materials`);
      setMaterials(res.data.materials || []);
    } catch (err) {
      console.error('Failed to load project materials:', err);
      toast.error('Failed to load materials for this site');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch reference catalogue and vendors for forms
  useEffect(() => {
    fetchMaterials();

    api.get('/builder/materials/catalogue')
      .then(res => setCatalogue(res.data.catalogue || []))
      .catch(() => {});

    api.get(`/projects/${projectId}/vendors`)
      .then(res => setVendors(res.data.vendors || []))
      .catch(() => {
        // Fallback to global vendors if project-specific route differs
        api.get('/vendors').then(r => setVendors(r.data.vendors || [])).catch(() => {});
      });
  }, [fetchMaterials, projectId]);

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (statusFilter !== 'All' && m.stock_status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = (m.material_name || '').toLowerCase().includes(q);
        const matchCat = (m.category || '').toLowerCase().includes(q);
        const matchSpec = (m.specification || '').toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchSpec) return false;
      }
      return true;
    });
  }, [materials, statusFilter, search]);

  // Open Material Detail Drawer
  const openDrawer = async (mat) => {
    setActiveMaterial(mat);
    setDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const res = await api.get(`/builder/projects/${projectId}/materials/${mat.material_id}/movements`);
      setDrawerData(res.data);
    } catch (err) {
      console.error('Failed to load material movements:', err);
      toast.error('Failed to load transaction history');
    } finally {
      setDrawerLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        <div>
          <h3 className="text-xl font-bold text-[#1A1A1A] font-heading">Materials</h3>
          <p className="text-xs text-muted mt-0.5">Track what is needed, what has arrived and what remains at this site.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddNeededModal(true)}
            className="btn-secondary text-xs px-3.5 py-2 font-semibold flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Material Needed
          </button>

          <button
            onClick={() => { setActiveMaterial(null); setShowArrivalModal(true); }}
            className="btn-primary text-xs px-3.5 py-2 font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            Record Arrival
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search material, brand, or grade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 pr-4 py-2 w-full text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {['All', 'Low Stock', 'Pending Delivery', 'Out of Stock'].map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === tab
                  ? 'bg-[#1A1A1A] text-white shadow-sm'
                  : 'bg-[#F5F5F5] text-muted hover:text-[#1A1A1A] hover:bg-[#EBEBEB]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Materials Table / List */}
      <div className="card overflow-hidden p-0 border border-[#EBEBEB]">
        {loading ? (
          <div className="py-16 text-center text-muted text-xs space-y-2">
            <div className="w-6 h-6 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading site inventory ledger...</div>
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="py-16 text-center text-muted px-4 space-y-2">
            <p className="font-semibold text-sm text-slate-700">No materials recorded at this site yet</p>
            <p className="text-xs text-muted max-w-md mx-auto">
              Click &quot;Add Material Needed&quot; to specify upcoming requirements, or &quot;Record Arrival&quot; when items physically land at the site.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Material & Specification</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Usable Stock</th>
                  <th className="py-3 px-4 text-right">Required</th>
                  <th className="py-3 px-4 text-right">Pending Arrival</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMaterials.map((mat) => {
                  const badgeCls = STOCK_STATUS_BADGES[mat.stock_status] || 'bg-slate-100 text-slate-700';

                  return (
                    <tr key={mat.material_id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => openDrawer(mat)}
                          className="font-bold text-slate-900 hover:text-[#E05A1E] transition-colors text-left"
                        >
                          {mat.material_name}
                        </button>
                        {mat.specification && (
                          <div className="text-[11px] text-muted truncate max-w-xs">{mat.specification}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {mat.category}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-sm">
                        <span className={mat.usable_stock <= 0 ? 'text-rose-600' : 'text-slate-900'}>
                          {mat.usable_stock} {mat.unit}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {mat.total_needed > 0 ? `${mat.total_needed} ${mat.unit}` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">
                        {mat.pending_quantity > 0 ? (
                          <span className="font-semibold text-blue-600">{mat.pending_quantity} {mat.unit}</span>
                        ) : '0'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}>
                          {mat.stock_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => { setActiveMaterial(mat); setShowUsageModal(true); }}
                            disabled={mat.usable_stock <= 0}
                            title="Record material consumed"
                            className="btn-secondary text-[11px] px-2.5 py-1 disabled:opacity-40"
                          >
                            Use
                          </button>
                          <button
                            onClick={() => { setActiveMaterial(mat); setShowArrivalModal(true); }}
                            title="Record arrival delivery"
                            className="btn-secondary text-[11px] px-2.5 py-1 text-blue-700 bg-blue-50/50 hover:bg-blue-100/50"
                          >
                            Receive
                          </button>
                          <button
                            onClick={() => { setActiveMaterial(mat); setShowReturnModal(true); }}
                            title="Return material"
                            className="btn-secondary text-[11px] px-2.5 py-1"
                          >
                            Return
                          </button>
                          <button
                            onClick={() => { setActiveMaterial(mat); setShowDamageModal(true); }}
                            title="Report damage or wastage"
                            className="text-rose-600 hover:text-rose-800 p-1 rounded"
                          >
                            Damage
                          </button>
                          <button
                            onClick={() => openDrawer(mat)}
                            title="View history"
                            className="text-muted hover:text-slate-800 p-1 rounded font-bold"
                          >
                            •••
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. Modal: Add Material Needed */}
      {showAddNeededModal && (
        <AddMaterialNeededModal
          projectId={projectId}
          catalogue={catalogue}
          stages={stages}
          vendors={vendors}
          onClose={() => setShowAddNeededModal(false)}
          onSuccess={() => { setShowAddNeededModal(false); fetchMaterials(); }}
        />
      )}

      {/* 2. Modal: Record Arrival */}
      {showArrivalModal && (
        <RecordArrivalModal
          projectId={projectId}
          material={activeMaterial}
          catalogue={catalogue}
          vendors={vendors}
          onClose={() => setShowArrivalModal(false)}
          onSuccess={() => { setShowArrivalModal(false); fetchMaterials(); }}
        />
      )}

      {/* 3. Modal: Record Used */}
      {showUsageModal && activeMaterial && (
        <RecordUsageModal
          projectId={projectId}
          material={activeMaterial}
          stages={stages}
          onClose={() => setShowUsageModal(false)}
          onSuccess={() => { setShowUsageModal(false); fetchMaterials(); }}
        />
      )}

      {/* 4. Modal: Return Material */}
      {showReturnModal && activeMaterial && (
        <ReturnMaterialModal
          projectId={projectId}
          material={activeMaterial}
          vendors={vendors}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => { setShowReturnModal(false); fetchMaterials(); }}
        />
      )}

      {/* 5. Modal: Report Damage */}
      {showDamageModal && activeMaterial && (
        <ReportDamageModal
          projectId={projectId}
          material={activeMaterial}
          stages={stages}
          onClose={() => setShowDamageModal(false)}
          onSuccess={() => { setShowDamageModal(false); fetchMaterials(); }}
        />
      )}

      {/* Detail Drawer: Material History & Totals */}
      {drawerOpen && activeMaterial && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted tracking-wider">{activeMaterial.category}</span>
                <h4 className="text-xl font-bold text-slate-900">{activeMaterial.material_name}</h4>
                {activeMaterial.specification && (
                  <p className="text-xs text-muted mt-0.5">{activeMaterial.specification}</p>
                )}
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-muted hover:text-slate-800 p-1.5 rounded-lg text-lg"
              >
                ✕
              </button>
            </div>

            {/* Authoritative Balances Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-muted block">Usable Stock</span>
                <span className="text-lg font-bold text-emerald-600">
                  {drawerData?.summary?.usable_stock ?? activeMaterial.usable_stock} {activeMaterial.unit}
                </span>
              </div>
              <div>
                <span className="text-muted block">Total Received</span>
                <span className="text-base font-bold text-slate-800">
                  {drawerData?.summary?.total_received ?? activeMaterial.total_received} {activeMaterial.unit}
                </span>
              </div>
              <div>
                <span className="text-muted block">Total Consumed</span>
                <span className="text-base font-bold text-slate-800">
                  {drawerData?.summary?.total_consumed ?? activeMaterial.total_consumed} {activeMaterial.unit}
                </span>
              </div>
              <div>
                <span className="text-muted block">Usable Returns</span>
                <span className="font-semibold text-slate-700">
                  +{drawerData?.summary?.total_returned_usable ?? 0} {activeMaterial.unit}
                </span>
              </div>
              <div>
                <span className="text-muted block">Supplier Returns</span>
                <span className="font-semibold text-slate-700">
                  -{drawerData?.summary?.total_returned_supplier ?? 0} {activeMaterial.unit}
                </span>
              </div>
              <div>
                <span className="text-muted block">Damage / Wastage</span>
                <span className="font-semibold text-rose-600">
                  -{drawerData?.summary?.total_wastage ?? 0} {activeMaterial.unit}
                </span>
              </div>
            </div>

            {/* Movement History */}
            <div className="space-y-3">
              <h5 className="font-bold text-sm text-slate-900">Authoritative Movement Ledger</h5>
              {drawerLoading ? (
                <div className="py-8 text-center text-xs text-muted">Loading movements...</div>
              ) : drawerData?.movements?.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted bg-slate-50 rounded-xl">
                  No stock transactions recorded yet for this material.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {drawerData?.movements?.map((m) => {
                    const isPositive = m.movement_type === 'receipt' || m.movement_type === 'site_return';
                    return (
                      <div key={m.id} className="p-3 text-xs space-y-1 hover:bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 capitalize">
                            {m.movement_type.replace('_', ' ')}
                            {m.is_reversed && <span className="ml-2 text-[10px] text-rose-600 font-bold">(REVERSED)</span>}
                          </span>
                          <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {isPositive ? '+' : '-'}{m.movement_type === 'receipt' ? (m.accepted_quantity ?? m.quantity) : m.quantity} {m.unit}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted flex items-center justify-between">
                          <span>{formatDateIST(m.occurrence_date)} • By {m.recorded_by_name || 'Staff'}</span>
                          {m.challan_invoice_no && <span>Challan: {m.challan_invoice_no}</span>}
                        </div>
                        {m.work_area && <div className="text-[11px] text-slate-600">Area: {m.work_area}</div>}
                        {m.stage_name && <div className="text-[11px] text-slate-600">Stage: {m.stage_name}</div>}
                        {m.reason && <div className="text-[11px] text-slate-500 italic">Reason: {m.reason}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SUB-MODALS FOR INVENTORY TRANSACTIONS
// ---------------------------------------------------------------------------

function AddMaterialNeededModal({ projectId, catalogue, stages, vendors, onClose, onSuccess }) {
  const [materialId, setMaterialId] = useState('');
  const [specification, setSpecification] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('bags');
  const [requiredBy, setRequiredBy] = useState('');
  const [stageId, setStageId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedMat = catalogue.find(c => String(c.id) === String(materialId));

  useEffect(() => {
    if (selectedMat && selectedMat.default_unit) {
      setUnit(selectedMat.default_unit);
    }
  }, [selectedMat]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!materialId) return toast.error('Please select a material');
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a quantity greater than zero');
    if (!unit.trim()) return toast.error('Unit is required');

    setSubmitting(true);
    try {
      await api.post(`/builder/projects/${projectId}/materials/requirements`, {
        material_id: parseInt(materialId),
        specification: specification.trim() || null,
        quantity_needed: qty,
        unit: unit.trim(),
        required_by: requiredBy || null,
        stage_id: stageId ? parseInt(stageId) : null,
        preferred_vendor_id: vendorId ? parseInt(vendorId) : null,
        notes: notes.trim() || null,
      });
      toast.success('Material requirement saved');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save requirement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">Add Material Needed</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Material *</label>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              required
              className="input w-full"
            >
              <option value="">Select material from catalogue...</option>
              {catalogue.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Specification / Grade / Brand</label>
            <input
              type="text"
              placeholder="e.g. UltraTech 53 Grade / Fe 500D 12mm"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Quantity Needed *</label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 50"
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Unit *</label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="bags, tonnes, brass..."
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Required By</label>
              <input
                type="date"
                value={requiredBy}
                onChange={(e) => setRequiredBy(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Related Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="input w-full"
              >
                <option value="">None / General</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.stage_number}. {s.stage_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Preferred Supplier</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="input w-full"
            >
              <option value="">Select vendor...</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.category || 'Vendor'})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Notes</label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery schedule, truck delivery instructions..."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Saving...' : 'Save Requirement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordArrivalModal({ projectId, material, catalogue, vendors, onClose, onSuccess }) {
  const [materialId, setMaterialId] = useState(material?.material_id || '');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(material?.unit || 'bags');
  const [vendorId, setVendorId] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [challanNo, setChallanNo] = useState('');
  const [condition, setCondition] = useState('good');
  const [acceptedQty, setAcceptedQty] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedMat = catalogue.find(c => String(c.id) === String(materialId)) || material;

  useEffect(() => {
    if (selectedMat && selectedMat.default_unit && !unit) {
      setUnit(selectedMat.default_unit);
    }
  }, [selectedMat, unit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!materialId) return toast.error('Material is required');
    if (isNaN(qty) || qty <= 0) return toast.error('Quantity must be greater than zero');

    let accQty = qty;
    let rejQty = 0;
    if (condition === 'rejected') {
      accQty = 0;
      rejQty = qty;
    } else if (condition === 'partially_damaged') {
      accQty = parseFloat(acceptedQty);
      if (isNaN(accQty) || accQty < 0 || accQty > qty) {
        return toast.error('Accepted quantity must be between 0 and total received');
      }
      rejQty = qty - accQty;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/builder/projects/${projectId}/materials/movements`, {
        movement_type: 'receipt',
        material_id: parseInt(materialId),
        quantity: qty,
        unit: unit.trim(),
        condition,
        accepted_quantity: accQty,
        rejected_quantity: rejQty,
        challan_invoice_no: challanNo.trim() || null,
        vendor_id: vendorId ? parseInt(vendorId) : null,
        occurrence_date: receiptDate,
        notes: notes.trim() || null,
        idempotency_key: `receipt_${projectId}_${materialId}_${Date.now()}`
      });

      toast.success(res.data.message || 'Arrival recorded successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record arrival');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">Record Material Arrival</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Material *</label>
            {material ? (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-bold text-slate-800">
                {material.material_name}
              </div>
            ) : (
              <select
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                required
                className="input w-full"
              >
                <option value="">Select delivered material...</option>
                {catalogue.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Delivered Qty *</label>
              <input
                type="number"
                step="any"
                min="0.001"
                required
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (condition === 'partially_damaged' && !acceptedQty) setAcceptedQty(e.target.value);
                }}
                placeholder="e.g. 100"
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Unit *</label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Delivery Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="input w-full font-medium"
              >
                <option value="good">Good / Accepted</option>
                <option value="partially_damaged">Partially Damaged</option>
                <option value="rejected">Rejected (0 usable)</option>
              </select>
            </div>
            {condition === 'partially_damaged' && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Accepted Qty *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={acceptedQty}
                  onChange={(e) => setAcceptedQty(e.target.value)}
                  placeholder="Usable portion"
                  className="input w-full"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Challan / Invoice No</label>
              <input
                type="text"
                placeholder="DC-9481 / INV-202"
                value={challanNo}
                onChange={(e) => setChallanNo(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Receipt Date</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Supplier / Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="input w-full"
            >
              <option value="">Select supplier...</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name} ({v.category || 'Vendor'})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Notes</label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Unloading remarks, truck number..."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Confirming...' : 'Confirm Arrival'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RecordUsageModal({ projectId, material, stages, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState('');
  const [stageId, setStageId] = useState('');
  const [workArea, setWorkArea] = useState('');
  const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a quantity greater than zero');
    if (qty > material.usable_stock) {
      return toast.error(`Insufficient stock! Only ${material.usable_stock} ${material.unit} available.`);
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/builder/projects/${projectId}/materials/movements`, {
        movement_type: 'consumption',
        material_id: material.material_id,
        quantity: qty,
        unit: material.unit,
        stage_id: stageId ? parseInt(stageId) : null,
        work_area: workArea.trim() || null,
        occurrence_date: usageDate,
        notes: notes.trim() || null,
        idempotency_key: `use_${projectId}_${material.material_id}_${Date.now()}`
      });

      toast.success(res.data.message || 'Material usage recorded');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record usage');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">Record Material Used</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
            <div>
              <div className="font-bold text-slate-900">{material.material_name}</div>
              <div className="text-[11px] text-muted">{material.category}</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-muted block uppercase">Available Stock</span>
              <span className="font-bold text-emerald-600 text-sm">{material.usable_stock} {material.unit}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Quantity Used *</label>
              <input
                type="number"
                step="any"
                min="0.001"
                max={material.usable_stock}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={`Max ${material.usable_stock}`}
                className="input w-full"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Date</label>
              <input
                type="date"
                value={usageDate}
                onChange={(e) => setUsageDate(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Construction Stage</label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="input w-full"
              >
                <option value="">General site work</option>
                {stages.map(s => (
                  <option key={s.id} value={s.id}>{s.stage_number}. {s.stage_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Work Area</label>
              <input
                type="text"
                placeholder="e.g. 1st Floor Slab / Column C4"
                value={workArea}
                onChange={(e) => setWorkArea(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Notes</label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mix ratio or execution notes..."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Confirming...' : 'Confirm Usage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReturnMaterialModal({ projectId, material, vendors, onClose, onSuccess }) {
  const [returnType, setReturnType] = useState('site_stock'); // 'site_stock' | 'supplier'
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a quantity greater than zero');
    if (returnType === 'supplier' && qty > material.usable_stock) {
      return toast.error(`Cannot return more than available site stock (${material.usable_stock} ${material.unit})`);
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/builder/projects/${projectId}/materials/movements`, {
        movement_type: returnType === 'site_stock' ? 'site_return' : 'supplier_return',
        material_id: material.material_id,
        quantity: qty,
        unit: material.unit,
        vendor_id: vendorId ? parseInt(vendorId) : null,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
        idempotency_key: `return_${projectId}_${material.material_id}_${Date.now()}`
      });

      toast.success(res.data.message || 'Return recorded successfully');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-slate-900 text-base">Return Material</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
            <span className="font-bold text-slate-900">{material.material_name}</span>
            <span className="font-bold text-slate-700">{material.usable_stock} {material.unit} at site</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Return Destination *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setReturnType('site_stock')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  returnType === 'site_stock' ? 'border-[#E05A1E] bg-orange-50/50 text-[#E05A1E] font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                <div>Return to site stock</div>
                <div className="text-[10px] text-muted font-normal mt-0.5">+ Increases usable site stock</div>
              </button>
              <button
                type="button"
                onClick={() => setReturnType('supplier')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  returnType === 'supplier' ? 'border-[#E05A1E] bg-orange-50/50 text-[#E05A1E] font-bold' : 'border-slate-200 text-slate-600'
                }`}
              >
                <div>Return to supplier</div>
                <div className="text-[10px] text-muted font-normal mt-0.5">- Deducts from site stock</div>
              </button>
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Quantity Returned *</label>
            <input
              type="number"
              step="any"
              min="0.001"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`Quantity in ${material.unit}`}
              className="input w-full"
            />
          </div>

          {returnType === 'supplier' && (
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Supplier</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="input w-full"
              >
                <option value="">Select supplier vendor...</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Reason for Return</label>
            <input
              type="text"
              placeholder="e.g. Unused left-over from casting / Defective grade sent by vendor"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Notes</label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dispatch challan or condition..."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5">
              {submitting ? 'Confirming...' : 'Confirm Return'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReportDamageModal({ projectId, material, stages, onClose, onSuccess }) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [stageId, setStageId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return toast.error('Enter a quantity greater than zero');
    if (qty > material.usable_stock) {
      return toast.error(`Cannot report damage exceeding current usable stock (${material.usable_stock} ${material.unit})`);
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/builder/projects/${projectId}/materials/movements`, {
        movement_type: 'wastage',
        material_id: material.material_id,
        quantity: qty,
        unit: material.unit,
        stage_id: stageId ? parseInt(stageId) : null,
        reason: reason.trim() || 'Site damage / wastage',
        notes: notes.trim() || null,
        idempotency_key: `damage_${projectId}_${material.material_id}_${Date.now()}`
      });

      toast.success(res.data.message || 'Damage report saved');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to report damage');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h4 className="font-bold text-rose-700 text-base">Report Damaged Material / Wastage</h4>
          <button onClick={onClose} className="text-muted hover:text-slate-800 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200 flex justify-between items-center">
            <span className="font-bold text-slate-900">{material.material_name}</span>
            <span className="font-bold text-slate-700">Usable: {material.usable_stock} {material.unit}</span>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Quantity Affected (Unusable) *</label>
            <input
              type="number"
              step="any"
              min="0.001"
              max={material.usable_stock}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`Max ${material.usable_stock}`}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Reason for Damage / Wastage *</label>
            <input
              type="text"
              required
              placeholder="e.g. Cement bags hardened due to unseasonal rain / Tiles broken during unloading"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Related Construction Stage</label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="input w-full"
            >
              <option value="">General site storage</option>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.stage_number}. {s.stage_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-700 block mb-1">Notes / Evidence</label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Damage assessment details..."
              className="input w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary px-3.5 py-1.5">Cancel</button>
            <button type="submit" disabled={submitting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg px-4 py-1.5">
              {submitting ? 'Reporting...' : 'Deduct as Wastage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
