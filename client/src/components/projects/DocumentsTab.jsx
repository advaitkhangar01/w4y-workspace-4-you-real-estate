// client/src/components/projects/DocumentsTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import { timeAgo } from '../../utils/time';
import toast from 'react-hot-toast';

const DOCUMENT_TAGS = [
  "Adhar Card & Pan Card", "Tax Receipt", "K Prata", "Final Proposal For Submission",
  "Sale Deed", "Layout Plan", "DP Plan", "Property Card", "Architectural Projection",
  "Indemnity Bond", "Structural Stability", "Shatipurta Bandh", "Sanction Plan",
  "Center Line", "Foundation And Footing", "Plinth Beam", "Plinth Slab", "Basement",
  "Ground Floor", "First Floor Slab", "Second Floor Slab", "Third Floor Slab",
  "Fourth Floor Slab", "Fifth Floor Slab", "Sixth Floor Slab", "Seventh Floor Slab",
  "Brick Plan", "Electrical", "Plumbing", "Sectional Details", "Elevation", "POP",
  "Grills And Railings", "Day View", "Night View", "Isometric View",
  "3d Floor Plan view", "Walkthrough", "Completion", "Others"
];

const FILE_SIZE_LIMITS = {
  image: 15 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  office: 50 * 1024 * 1024,
  cad: 150 * 1024 * 1024,
  archive: 200 * 1024 * 1024,
  default: 50 * 1024 * 1024
};

const getExtensionCategory = (ext) => {
  ext = ext.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.svg', '.heic'].includes(ext)) return 'image';
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'office';
  if (['.dwg', '.dxf', '.dgn', '.plt', '.rvt', '.ifc', '.skp', '.3ds', '.max', '.step', '.stp', '.iges', '.igs'].includes(ext)) return 'cad';
  if (['.zip', '.rar', '.7z'].includes(ext)) return 'archive';
  return 'default';
};

const getFileIcon = (fileName) => {
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  const category = getExtensionCategory(ext);
  
  const icons = {
    pdf: { color: 'text-red-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
    )},
    office: { color: 'text-blue-600', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
    )},
    cad: { color: 'text-teal-600', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
    )},
    image: { color: 'text-pink-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )},
    default: { color: 'text-slate-400', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    )}
  };
  
  return icons[category] || icons.default;
};

export default function DocumentsTab({ projectId, currentUser }) {
  const [documents, setDocuments] = useState({});
  const [amounts, setAmounts] = useState({});
  const isAdmin = currentUser?.role === 'admin';
  const isAccounts = currentUser?.role === 'back_office' || currentUser?.role === 'accounts' || currentUser?.department?.toLowerCase() === 'accounts';
  const canViewFinancials = isAdmin || isAccounts;
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [remark, setRemark] = useState('');
  const [selectedRows, setSelectedRows] = useState({});
  const fileInputRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents?project_id=${projectId}&category=document&grouped=true`);
      setDocuments(data.documents || {});
      setAmounts(data.amounts || {});
      if (canViewFinancials) {
        const { data: payData } = await api.get(`/documents/payment-stages?project_id=${projectId}`);
        const initiated = (payData.paymentStages || []).reduce((acc, stage) => {
          acc[stage.document_type] = true;
          return acc;
        }, {});
        setSelectedRows(initiated);
      }
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [projectId, canViewFinancials]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleAmountChange = (tag, value) => setAmounts(p => ({ ...p, [tag]: value }));

  const handleAmountBlur = async (tag, value) => {
    try {
      await api.post('/documents/amounts', { project_id: projectId, document_type: tag, amount: value || null });
    } catch (err) { toast.error('Failed to save amount'); }
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files);
    const validFiles = selected.filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      const cat = getExtensionCategory(ext);
      const limit = FILE_SIZE_LIMITS[cat] || FILE_SIZE_LIMITS.default;
      if (f.size > limit) {
        toast.error(`${f.name} exceeds ${limit / (1024 * 1024)}MB limit`);
        return false;
      }
      return true;
    });
    setFiles(validFiles);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (files.length === 0 || !selectedType) {
      toast.error(!selectedType ? 'Select a document type' : 'Select at least one file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('category', 'document');
    formData.append('document_type', selectedType);
    if (remark.trim()) formData.append('remark', remark.trim());
    files.forEach(f => formData.append('files', f));

    try {
      await api.post(`/documents/upload?project_id=${projectId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchDocuments();
      setFiles([]); setRemark(''); setSelectedType('');
      if (fileInputRef.current) fileInputRef.current.value = null;
      toast.success('Documents uploaded successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload');
    } finally { setUploading(false); }
  };

  const handleAction = async (doc, action) => {
    if (action === 'download') {
      try {
        const isPreviewable = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.svg'].some(ext => doc.name.toLowerCase().endsWith(ext));
        if (isPreviewable) {
          window.open(`${api.defaults.baseURL}/documents/${doc.id}/download`, '_blank');
        } else {
          const res = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([res.data]));
          const link = document.createElement('a');
          link.href = url; link.setAttribute('download', doc.name);
          document.body.appendChild(link); link.click();
          link.parentNode.removeChild(link); window.URL.revokeObjectURL(url);
        }
      } catch (err) { toast.error('Failed to download'); }
    } else if (action === 'delete') {
      if (!window.confirm('Delete this document?')) return;
      try {
        await api.delete(`/documents/${doc.id}`);
        await fetchDocuments();
        toast.success('Document deleted');
      } catch (err) { toast.error('Failed to delete'); }
    }
  };

  const formatSize = (b) => {
    if (!b) return '0 B';
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  };

  const toggleRowSelection = async (tag) => {
    const wasInit = !!selectedRows[tag];
    const amount = amounts[tag] || 0;
    setSelectedRows(p => ({ ...p, [tag]: !wasInit }));
    try {
      if (!wasInit) {
        await handleAmountBlur(tag, amount);
        await api.post('/documents/payment-stages', { project_id: parseInt(projectId), document_type: tag, amount: parseFloat(amount) || 0 });
      } else {
        await api.delete('/documents/payment-stages/remove/tag', { data: { project_id: parseInt(projectId), document_type: tag } });
      }
      fetchDocuments();
    } catch (err) {
      setSelectedRows(p => ({ ...p, [tag]: wasInit }));
      toast.error(err.response?.data?.error || 'Failed to update stage');
    }
  };

  const totalAmount = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="card bg-gray-50/50 border-dashed border-2">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Upload Professional Documents
        </h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase">Document Type</label>
              <select className="input w-full text-sm" value={selectedType} onChange={e => setSelectedType(e.target.value)} required>
                <option value="">-- Select Type --</option>
                {DOCUMENT_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase">Files (Multiple)</label>
              <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="input w-full text-sm h-[38px] p-1" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-muted uppercase">Remark</label>
              <input type="text" value={remark} onChange={e => setRemark(e.target.value)} placeholder="Add a remark..." className="input w-full text-sm" />
            </div>
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <span key={i} className="px-2 py-1 bg-white border rounded text-[10px] text-gray-600 flex items-center gap-1">
                  {getFileIcon(f.name).icon} {f.name} ({formatSize(f.size)})
                </span>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={files.length === 0 || !selectedType || uploading} className="btn-primary">
              {uploading ? 'Uploading...' : `Upload ${files.length || ''} Files`}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-0 overflow-hidden border-[#EBEBEB]">
        <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between bg-white">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            Project Documentation Matrix
          </h3>
          <span className="badge badge-in-progress">{Object.values(documents).flat().length} Total Files</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-[#EBEBEB]">
                <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10">#</th>
                <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-1/5">Type</th>
                {canViewFinancials && <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-48">Amount</th>}
                <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-2/5">Documents</th>
                <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-48">Details</th>
                {canViewFinancials && <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10 text-center">✔</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBEBEB]">
              {DOCUMENT_TAGS.map((tag, idx) => {
                const tagFiles = documents[tag] || [];
                return (
                  <tr key={tag} className="hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 px-4 align-top text-[10px] text-muted font-bold">{idx + 1}</td>
                    <td className="py-3 px-4 align-top text-xs font-medium text-slate-800">{tag}</td>
                    {canViewFinancials && (
                      <td className="py-2 px-4 align-top">
                        <input type="number" className="input w-full text-xs h-8" value={amounts[tag] || ''} onChange={e => handleAmountChange(tag, e.target.value)} onBlur={e => handleAmountBlur(tag, e.target.value)} placeholder="₹ 0" />
                      </td>
                    )}
                    <td className="py-3 px-4 align-top">
                      <div className="space-y-2">
                        {tagFiles.length > 0 ? tagFiles.map(doc => {
                          const iconData = getFileIcon(doc.name);
                          return (
                            <div key={doc.id} className="flex flex-col gap-1 group">
                              <div className="flex items-center gap-2">
                                <span className={iconData.color}>{iconData.icon}</span>
                                <span className="text-xs text-slate-700 truncate max-w-[200px]" title={doc.name}>{doc.name}</span>
                                <span className="text-[10px] text-muted">({formatSize(doc.size)})</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleAction(doc, 'download')} className="p-1 hover:text-[#E05A1E]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                                  {isAdmin && <button onClick={() => handleAction(doc, 'delete')} className="p-1 hover:text-red-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted pl-5">
                                <span>{doc.uploaded_by}</span> • <span>{timeAgo(doc.created_at)}</span>
                              </div>
                            </div>
                          );
                        }) : <span className="text-[10px] text-slate-300 italic">No documents</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <div className="space-y-2">
                        {tagFiles.length > 0 ? tagFiles.map(doc => (
                          <div key={doc.id} className="text-[10px] text-slate-500 truncate h-4" title={doc.remark || 'No remark'}>{doc.remark || '-'}</div>
                        )) : '-'}
                      </div>
                    </td>
                    {canViewFinancials && (
                      <td className="py-3 px-4 text-center align-top">
                        <input type="checkbox" checked={!!selectedRows[tag]} onChange={() => toggleRowSelection(tag)} className="w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E] cursor-pointer" />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {canViewFinancials && (
              <tfoot className="bg-gray-50 font-bold border-t-2 border-[#EBEBEB]">
                <tr>
                  <td className="py-3 px-4" colSpan={2}><div className="text-right text-[10px] uppercase text-muted">Total</div></td>
                  <td className="py-3 px-4 text-sm text-[#E05A1E]">₹ {totalAmount.toLocaleString('en-IN')}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
