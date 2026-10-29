// client/src/components/projects/SitePhotographsTab.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import { timeAgo, formatIST } from '../../utils/time';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// PhotoViewModal — defined OUTSIDE the parent so React does NOT recreate the
// component type on every render, which was preventing the modal from showing.
// ---------------------------------------------------------------------------
function PhotoViewModal({ photo, onClose, getMediaUrl }) {
  if (!photo) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-[101]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <div
        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center justify-center animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={getMediaUrl(photo.file_path)}
          alt={photo.file_name}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
        />
        <div className="mt-4 text-center bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10 w-full max-w-2xl">
          <h4 className="text-white font-semibold">{photo.file_name}</h4>
          <p className="text-white/60 text-xs mt-1">Uploaded by {photo.uploaded_by_name} • {timeAgo(photo.created_at)}</p>
          {photo.remark && (
            <p className="text-white/80 text-sm mt-3 italic border-t border-white/10 pt-3">
              "{photo.remark}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SitePhotographsTab({ projectId, currentUser }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [remark, setRemark] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const fileInputRef = useRef(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const { data } = await api.get(`/documents?project_id=${projectId}&category=photo`);
      setPhotos(data.documents || []);
    } catch (err) {
      toast.error('Failed to load site photographs');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      if (!selected.type.startsWith('image/')) {
        toast.error('Please select an image file');
        e.target.value = null;
        setFile(null);
        setPreview(null);
        return;
      }
      if (selected.size > 10 * 1024 * 1024) {
        toast.error('Image exceeds 10MB limit');
        e.target.value = null;
        setFile(null);
        setPreview(null);
        return;
      }
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('category', 'photo');
    if (remark.trim()) {
      formData.append('remark', remark.trim());
    }
    formData.append('files', file);

    try {
      const { data } = await api.post(`/documents/upload?project_id=${projectId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const newPhoto = {
        ...(data.documents?.[0] || {}),
        uploaded_by_name: currentUser.name
      };
      setPhotos(prev => [newPhoto, ...prev]);
      
      // Reset form
      setFile(null);
      setPreview(null);
      setRemark('');
      if (fileInputRef.current) fileInputRef.current.value = null;
      
      toast.success('Photograph uploaded successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload photograph');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (photo) => {
    try {
      const response = await api.get(`/documents/${photo.id}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', photo.file_name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Failed to download photograph');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this photograph?')) return;
    try {
      await api.delete(`/documents/${id}`);
      setPhotos(prev => prev.filter(p => p.id !== id));
      toast.success('Photograph deleted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const getMediaUrl = (path) => {
    if (!path) return '';
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const cleanBase = baseUrl.replace(/\/api$/, '');
    const cleanPath = path.replace(/^\//, '');
    return cleanBase ? `${cleanBase}/${cleanPath}` : `/${cleanPath}`;
  };


  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Upload Section */}
      <div className="card bg-orange-50/30 border-dashed border-2 border-orange-200">
        <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E05A1E" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          Upload Site Photograph
        </h3>
        
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <div className="relative group">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                  id="photo-upload"
                />
                <label 
                  htmlFor="photo-upload"
                  className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-[#E0E0E0] rounded-xl hover:border-[#E05A1E] hover:bg-white transition-all cursor-pointer group-hover:shadow-md overflow-hidden relative"
                >
                  {preview ? (
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center p-6">
                      <div className="w-12 h-12 bg-orange-50 text-[#E05A1E] rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>
                          <line x1="16" y1="5" x2="22" y2="5"/>
                          <line x1="19" y1="2" x2="19" y2="8"/>
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-[#1A1A1A]">Click to select / Drag & drop</p>
                      <p className="text-xs text-muted mt-1">PNG, JPG or GIF up to 10MB</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <label className="label">Remarks</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="e.g. Foundation work progress as of today..."
                  className="input w-full min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted mt-2 ml-1">Added as a comment in the Remarks tab.</p>
              </div>
              
              <div className="flex justify-end pt-4">
                <button 
                  type="submit" 
                  disabled={!file || uploading} 
                  className="btn-primary w-full sm:w-auto"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : 'Upload Photo'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Photo Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Gallery
          </h3>
          <span className="badge badge-in-progress">{photos.length} Photographs</span>
        </div>
        
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton aspect-square rounded-xl" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="card py-12 text-center border-dashed">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <p className="text-gray-500 font-medium">No site photographs yet</p>
            <p className="text-sm text-gray-400 mt-1">Upload your first progress photo above</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
            {photos.map(photo => (
              <div key={photo.id} className="group relative bg-white border border-[#E0E0E0] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                <div className="aspect-video relative overflow-hidden">
                  <img 
                    src={getMediaUrl(photo.file_path)} 
                    alt={photo.file_name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(photo); }}
                      className="p-2 bg-white rounded-full text-[#1A1A1A] hover:bg-emerald-500 hover:text-white transition-colors shadow-lg"
                      title="Download"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(photo.id); }}
                      className="p-2 bg-white rounded-full text-[#1A1A1A] hover:bg-red-500 hover:text-white transition-colors shadow-lg"
                      title="Delete"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="p-4" onClick={() => setSelectedPhoto(photo)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1A1A1A] truncate" title={photo.file_name}>
                        {photo.file_name}
                      </p>
                      <p className="text-[10px] text-muted mt-0.5">
                        {formatIST(photo.created_at)} • {photo.uploaded_by_name}
                      </p>
                    </div>
                  </div>
                  {photo.remark && (
                    <p className="text-xs text-[#6B6B6B] line-clamp-2 italic bg-gray-50 rounded p-2 mt-2">
                      "{photo.remark}"
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo Modal */}
      <PhotoViewModal
        photo={selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        getMediaUrl={getMediaUrl}
      />
    </div>
  );
}
