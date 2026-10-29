import React, { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import ClientModal from '../../components/clients/ClientModal';
import convertNumberToWords from '../../utils/numberToWords';
import { COMPANY_CONFIG } from '../../config/company';
import { useLocation } from 'react-router-dom';


const INITIAL_FORM = {
  project_id: null,
  payment_stage_id: null,
  invoiceNo: '',
  date: new Date().toISOString().split('T')[0],
  refNo: '', // Reference No. & Date
  otherReferences: '',
  buyerOrderNo: '', // Buyer's Order No.
  termsOfDelivery: '',
  billToName: '',
  billToCompany: '',
  billToAddress: '',
  billToGst: '',
  billToPhone: '',
  billToEmail: '',
  items: [{ id: Date.now(), description: '', hsn: '', quantity: 1, rate: 0, per: '' }],
  cgstPercent: 9,
  sgstPercent: 9,
  igstPercent: 18,
  accountName: COMPANY_CONFIG.name || 'W4Y',
  accountNo: COMPANY_CONFIG.accountNo || '',
  ifsc: COMPANY_CONFIG.ifsc || '',
  bankName: COMPANY_CONFIG.bankName || '',
  branch: '',
  upiId: COMPANY_CONFIG.upiId || '',
  dueDate: '',
  tdsPercent: 10
};

const ITEM_CATALOG = [
  { description: 'Interior Design & Space Planning', rate: 15000, per: 'Flat' },
  { description: '3D Realistic Rendering (Per View)', rate: 5000, per: 'View' },
  { description: 'Full Turnkey Execution (Per Sqft)', rate: 1800, per: 'Sqft' },
  { description: 'Modular Kitchen Fabrication', rate: 120000, per: 'Flat' },
  { description: 'False Ceiling Layout & Work', rate: 35000, per: 'Flat' },
  { description: 'Custom Wardrobes & Woodwork', rate: 65000, per: 'Flat' },
  { description: 'Site Visit Consultation', rate: 3000, per: 'Visit' }
];

export default function InvoicePage() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [clients, setClients] = useState([]);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [isGstEnabled, setIsGstEnabled] = useState(true);
  const [isIgst, setIsIgst] = useState(false);
  const [isTdsEnabled, setIsTdsEnabled] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [usedInvoiceNumbers, setUsedInvoiceNumbers] = useState([]);
  const [sessionInvoiceCount, setSessionInvoiceCount] = useState(1);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectStats, setProjectStats] = useState(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false); // Phase 3.3: inline confirm
  const [savedInvoiceRef, setSavedInvoiceRef] = useState(null); // Phase 1: tracks last saved invoice for mark-paid
  
  const [projectStages, setProjectStages] = useState([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [selectedStageIds, setSelectedStageIds] = useState([]);

  const fetchProjectStages = async (pid, activeIds = []) => {
    if (!pid) { setProjectStages([]); return; }
    setLoadingStages(true);
    try {
      const { data } = await api.get(`/documents/payment-stages?project_id=${pid}`);
      const idsToKeep = [...selectedStageIds, ...activeIds];
      setProjectStages(
        (data.paymentStages || []).filter(s =>
          ['payment initiated', 'bill generated'].includes(s.status?.toLowerCase()) ||
          idsToKeep.includes(s.id)
        )
      );
    } catch (err) {
      console.error('Failed to fetch project stages:', err);
      setProjectStages([]);
    } finally {
      setLoadingStages(false);
    }
  };

  useEffect(() => {
    if (selectedStageIds.length === 0) return;
    // Guard: Prevent wiping prefilled state on mount while project stages are loading
    if (projectStages.length === 0) return;
    
    const selected = projectStages.filter(s => selectedStageIds.includes(s.id));
    setFormData(prev => ({
      ...prev,
      payment_stage_id: selected.length === 1 ? selected[0].id : (selected[0]?.id || null),
      items: selected.map(s => ({
        id: s.id,
        description: `${s.document_type} - ${getProjectName()}`,
        quantity: 1,
        rate: parseFloat(s.amount) || 0,
        hsn: '',
        per: 'Flat'
      }))
    }));
  }, [selectedStageIds, projectStages]);

  useEffect(() => {
    if (formData.project_id && projects.length > 0) {
      const proj = projects.find(p => p.id === formData.project_id);
      if (proj && (!formData.billToName || !formData.billToCompany || !formData.billToAddress)) {
        const client = (clients || []).find(c => c.id === proj.client_id || c.name === proj.client_name);
        setFormData(prev => ({
          ...prev,
          billToName: prev.billToName || proj.client_name || '',
          billToCompany: prev.billToCompany || client?.company_name || proj.client_company || '',
          billToAddress: prev.billToAddress || client?.address || proj.location || '',
          billToGst: prev.billToGst || client?.gst_number || '',
          billToPhone: prev.billToPhone || client?.primary_contact_phone || client?.phone || proj.primary_contact_phone || '',
          billToEmail: prev.billToEmail || client?.primary_contact_email || client?.email || ''
        }));
      }
    }
  }, [formData.project_id, projects, clients]);

  const previewRef = useRef(null);
  const dropdownRef = useRef(null);
  const projectDropdownRef = useRef(null);
  const canvasRef = useRef(null);

  const location = useLocation();

  useEffect(() => {
    fetchClients();
    fetchRecentInvoices();
    fetchProjects();
    fetchBankSettings();
    
    // Check for pre-fill data from ProjectDetail page
    if (location.state?.preFill) {
      const { preFill } = location.state;
      setFormData(prev => ({
        ...prev,
        ...preFill,
        // Guard: preFill.items can be null/undefined if navigating from InvoiceHistoryTab "Generate New"
        items: Array.isArray(preFill.items) && preFill.items.length > 0
          ? preFill.items.map(item => ({ ...item, id: item.id || Date.now() }))
          : INITIAL_FORM.items
      }));
      
      if (preFill.project_id) {
        if (preFill.payment_stage_id) {
          setSelectedStageIds([preFill.payment_stage_id]);
          fetchProjectStages(preFill.project_id, [preFill.payment_stage_id]);
        } else {
          fetchProjectStages(preFill.project_id);
        }
      }
      
      // If invoice number is missing, fetch next one
      if (!preFill.invoiceNo) {
        fetchNextInvoiceNumber();
      }
      
      // Clear state to prevent re-filling on refresh
      window.history.replaceState({}, document.title);
    } else {
      const saved = localStorage.getItem('w4y_invoice_draft');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Valid draft: must have items array and use camelCase form fields (not raw DB snake_case)
          const isValidDraft = parsed
            && Array.isArray(parsed.items)
            && parsed.items.length > 0
            && !parsed.invoice_no  // reject drafts contaminated with DB snake_case fields
            && !parsed.signature_data; // reject drafts with large Base64 blobs
          if (isValidDraft) {
            setFormData(parsed);
            setIsGstEnabled(parsed.cgstPercent > 0 || parsed.igstPercent > 0);
            setIsIgst(parsed.igstPercent > 0 && parsed.cgstPercent === 0);
            setIsTdsEnabled(parsed.tax_details?.isTdsEnabled ?? parsed.isTdsEnabled ?? false);
          } else {
            localStorage.removeItem('w4y_invoice_draft');
            fetchNextInvoiceNumber();
          }
        } catch (e) {
          localStorage.removeItem('w4y_invoice_draft');
          fetchNextInvoiceNumber();
        }
      } else {
        fetchNextInvoiceNumber();
      }
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsClientDropdownOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Wrap in try/catch — localStorage.setItem throws QuotaExceededError if storage is full
    const timer = setTimeout(() => {
      try {
        // Exclude signature_data from draft — it's persisted in the DB, not localStorage
        const { signature_data, ...draftSafe } = formData;
        // Avoid saving blank templates over loaded drafts
        if (draftSafe.billToName || draftSafe.items?.length > 1 || draftSafe.items?.[0]?.description) {
          localStorage.setItem('w4y_invoice_draft', JSON.stringify(draftSafe));
        }
      } catch (e) {
        console.warn('localStorage draft save failed:', e);
      }
    }, 800); // 800ms debounce
    return () => clearTimeout(timer);
  }, [formData]);

  useEffect(() => {
    if (formData.project_id) {
      fetchProjectStats(formData.project_id);
    } else {
      setProjectStats(null);
    }
  }, [formData.project_id]);

  // Deep-link: detect ?invoice_id=XYZ in URL and auto-load that invoice
  // We depend on [clients, projects] so that dropdowns are ready before we auto-populate
  useEffect(() => {
    if (!clients.length && !projects.length) return; // wait for data to load
    const searchParams = new URLSearchParams(window.location.search);
    const invoiceId = searchParams.get('invoice_id');
    if (invoiceId) {
      loadInvoiceById(invoiceId);
      // Clean URL without reloading — prevents re-loading on future renders
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, projects]);

  const loadInvoiceById = async (id) => {
    try {
      const { data } = await api.get(`/invoices/${id}`);
      const inv = data.invoice;
      if (!inv) {
        toast.error('Invoice not found');
        return;
      }
      setFormData({
        ...INITIAL_FORM,
        project_id: inv.project_id || null,
        payment_stage_id: inv.payment_stage_id || null,
        invoiceNo: inv.invoice_no || '',
        date: inv.date ? String(inv.date).split('T')[0] : INITIAL_FORM.date,
        dueDate: inv.due_date ? String(inv.due_date).split('T')[0] : '',
        refNo: inv.ref_no || inv.tax_details?.referenceNoAndDate || '',
        otherReferences: inv.tax_details?.otherReferences || '',
        buyerOrderNo: inv.buyer_order_no || inv.tax_details?.buyerOrderNo || '',
        termsOfDelivery: inv.tax_details?.termsOfDelivery || '',
        billToName: inv.client_name || '',
        billToCompany: inv.client_company || inv.client_company_full || '',
        billToAddress: inv.bill_to_address || '',
        billToGst: inv.bill_to_gst || '',
        billToPhone: inv.bill_to_phone || '',
        billToEmail: inv.bill_to_email || '',
        accountNo: inv.account_no || '',
        ifsc: inv.ifsc || '',
        bankName: inv.bank_name || '',
        items: Array.isArray(inv.items) && inv.items.length > 0
          ? inv.items.map(item => ({ ...item, id: item.id || Date.now(), hsn: item.hsn || '', per: item.per || '' }))
          : INITIAL_FORM.items,
        cgstPercent: inv.tax_details?.cgstPercent ?? 9,
        sgstPercent: inv.tax_details?.sgstPercent ?? 9,
        igstPercent: inv.tax_details?.igstPercent ?? 18,
      });

      if (inv.project_id) {
        if (inv.payment_stage_id) {
          setSelectedStageIds([inv.payment_stage_id]);
          fetchProjectStages(inv.project_id, [inv.payment_stage_id]);
        } else {
          fetchProjectStages(inv.project_id);
        }
      }

      setIsGstEnabled(inv.tax_details?.isGstEnabled ?? true);
      setIsIgst(inv.tax_details?.isIgst ?? false);
      setIsTdsEnabled(inv.tax_details?.isTdsEnabled ?? false);
      // Restore the archived signature onto the canvas
      if (inv.signature_data) {
        setTimeout(() => restoreSignatureToCanvas(inv.signature_data), 100);
      } else {
        const canvas = canvasRef.current;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        setSignatureData(null);
      }
      // Track this as the active saved invoice ref (enables Mark Paid button)
      setSavedInvoiceRef(inv);
      toast.success(`Loaded invoice ${inv.invoice_no}`);
    } catch (err) {
      console.error('Failed to load deep-linked invoice', err);
      toast.error('Failed to load requested invoice');
    }
  };

  const fetchProjectStats = async (pid) => {
    try {
      const { data } = await api.get(`/projects/${pid}/financial-summary`);
      setProjectStats(data);
    } catch (err) {
      console.error('Failed to fetch project stats', err);
    }
  };

  const fetchBankSettings = async () => {
    try {
      const { data } = await api.get('/settings/app');
      setFormData(prev => ({
        ...prev,
        accountNo: prev.accountNo || data.company_bank_account_no || '',
        ifsc: prev.ifsc || data.company_bank_ifsc || '',
        bankName: prev.bankName || data.company_bank_name_branch || '',
        upiId: prev.upiId || data.company_bank_upi_id || ''
      }));
    } catch (err) {
      console.error('Failed to fetch bank settings', err);
    }
  };

  const fetchNextInvoiceNumber = async () => {
    try {
      const { data } = await api.get('/invoices/latest/number');
      if (data.nextNo) {
        setFormData(prev => ({ ...prev, invoiceNo: prev.invoiceNo || data.nextNo }));
      } else {
        generateInvoiceNumber(1);
      }
    } catch (err) {
      console.error('Failed to fetch next invoice number', err);
      generateInvoiceNumber(1);
    }
  };

  const generateInvoiceNumber = (count) => {
    const today = new Date();
    const year = today.getFullYear();
    const paddedCount = String(count).padStart(3, '0');
    const autoNo = `W4Y-${year}-${paddedCount}`;
    setFormData(prev => ({ ...prev, invoiceNo: autoNo }));
  };

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  const fetchClients = async () => {
    try {
      const { data } = await api.get('/clients');
      // API returns { clients: [], page, limit } — extract the array
      setClients(Array.isArray(data) ? data : (data.clients || []));
    } catch (err) {
      toast.error('Failed to load clients');
    }
  };

  const fetchRecentInvoices = async () => {
    try {
      const { data } = await api.get('/invoices');
      if (data && Array.isArray(data.invoices)) {
        setRecentInvoices(data.invoices.slice(0, 10)); // Top 10
      }
    } catch (err) {
      console.error('Failed to load recent invoices', err);
    }
  };

  const handleSaveInvoice = async (status = 'generated') => {
    if (!formData.billToName.trim()) {
      toast.error('Client Name is required');
      return null;
    }
    if (!formData.invoiceNo.trim()) {
      toast.error('Invoice Number is required');
      return null;
    }
    
    try {
      const payload = {
        invoice_no: formData.invoiceNo,
        project_id: formData.project_id,
        payment_stage_id: formData.payment_stage_id,
        payment_stage_ids: selectedStageIds,
        client_id: clients.find(c => c.name === formData.billToName)?.id,
        client_name: formData.billToName,
        client_company: formData.billToCompany,
        amount: grandTotal,
        date: formData.date,
        items: formData.items,
        tax_details: {
          cgstPercent: formData.cgstPercent,
          sgstPercent: formData.sgstPercent,
          igstPercent: formData.igstPercent,
          isGstEnabled,
          isIgst,
          isTdsEnabled,
          tdsPercent: formData.tdsPercent,
          tdsAmount: calculateTotals().tdsAmount,
          referenceNoAndDate: formData.refNo,
          otherReferences: formData.otherReferences,
          buyerOrderNo: formData.buyerOrderNo,
          termsOfDelivery: formData.termsOfDelivery
        },
        status,
        due_date: formData.dueDate,
        signature_data: signatureData || null
      };

      const { data } = await api.post('/invoices', payload);
      fetchRecentInvoices();
      return data.invoice;
    } catch (err) {
      // Handle duplicate invoice number — give the admin a clear, actionable error
      if (err.response?.status === 409) {
        toast.error(
          `Invoice #${formData.invoiceNo} already exists. Change the invoice number and try again.`,
          { duration: 6000 }
        );
        return null;
      }
      toast.error('Failed to save invoice to history');
      return null;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleItemChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: '', quantity: 1, rate: 0 }]
    }));
  };

  const selectFromCatalog = (catalogItem) => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: catalogItem.description, quantity: 1, rate: catalogItem.rate }]
    }));
    toast.success('Catalog item added');
    setShowCatalog(false);
  };

  const removeItem = (id) => {
    if (formData.items.length === 1) {
      toast.error('At least 1 item is required');
      return;
    }
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const calculateTotals = () => {
    // Phase 3.2: Guard against malformed items from corrupted localStorage
    if (!formData || !Array.isArray(formData.items) || formData.items.length === 0) {
      return { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0, tdsAmount: 0, netReceivable: 0 };
    }
    const subtotal = formData.items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      return acc + (qty * rate);
    }, 0);
    let cgst = 0, sgst = 0, igst = 0;
    if (isGstEnabled) {
      if (isIgst) igst = subtotal * ((Number(formData.igstPercent) || 0) / 100);
      else {
        cgst = subtotal * ((Number(formData.cgstPercent) || 0) / 100);
        sgst = subtotal * ((Number(formData.sgstPercent) || 0) / 100);
      }
    }
    const grandTotal = Math.round(subtotal + cgst + sgst + igst);
    const tdsAmount = isTdsEnabled ? Math.round(subtotal * ((Number(formData.tdsPercent) || 0) / 100)) : 0;
    const netReceivable = grandTotal - tdsAmount;
    return { subtotal, cgst, sgst, igst, grandTotal, tdsAmount, netReceivable };
  };

  const { subtotal, cgst, sgst, igst, grandTotal, tdsAmount, netReceivable } = calculateTotals();

  const getProjectName = () => {
    if (formData.project_id) {
      const p = projects.find(proj => proj.id === formData.project_id);
      if (p) return p.name;
    }
    if (savedInvoiceRef?.project_name) return savedInvoiceRef.project_name;
    return '';
  };

  const handleGeneratePDF = async () => {
    if (!formData.billToName.trim()) {
      toast.error('Client Name is required');
      return;
    }
    if (!formData.invoiceNo.trim()) {
      toast.error('Invoice Number is required');
      return;
    }
    setIsGenerating(true);
    try {
      let saved = savedInvoiceRef;
      // If there is no saved invoice reference, or the invoice number has been changed, save it as a new invoice.
      // Otherwise, if the invoice number matches the already-saved invoice, bypass the POST insert request!
      if (!saved || formData.invoiceNo !== saved.invoice_no) {
        saved = await handleSaveInvoice();
        if (!saved) {
          setIsGenerating(false);
          return;
        }
        setSavedInvoiceRef(saved);
      }

      // Trigger browser native vector print dialog
      window.print();
      toast.success('Invoice print dialogue loaded');
    } catch (error) {
      console.error(error);
      toast.error('Failed to open print layout');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordIncome = async (savedInvoice) => {
    if (!formData.project_id) {
      toast.error('No project linked to this invoice');
      return;
    }
    if (!grandTotal || grandTotal <= 0) {
      toast.error('Invoice amount must be greater than 0');
      return;
    }
    if (!savedInvoice?.id) {
      toast.error('Save the invoice before marking as paid');
      return;
    }

    try {
      // Single atomic call: records finance entry + marks invoice paid in one DB transaction
      await api.post(`/invoices/${savedInvoice.id}/mark-paid`);
      toast.success('Invoice marked as paid and income recorded');
      fetchRecentInvoices();
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to record payment';
      toast.error(message);
    }
  };

  const shareWhatsApp = () => {
    const msg = `Hi ${formData.billToName}, Invoice ${formData.invoiceNo} from ${COMPANY_CONFIG.brand} is generated for ₹${grandTotal.toLocaleString('en-IN')}.`;
    window.open(`https://wa.me/${formData.billToPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const shareEmail = () => {
    window.open(`mailto:${formData.billToEmail}?subject=Invoice ${formData.invoiceNo}&body=Please find attached your invoice.`, '_blank');
  };

  const handleReset = () => {
    // Phase 3.3: inline confirm — avoid browser-blocked window.confirm
    setShowConfirmClear(true);
  };

  const confirmReset = () => {
    localStorage.removeItem('w4y_invoice_draft');
    setFormData(INITIAL_FORM);
    setSignatureData(null);
    setSavedInvoiceRef(null);
    setShowConfirmClear(false);
    generateInvoiceNumber(1);
  };

  const getCoordinates = (e, rect) => {
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const coords = getCoordinates(e, rect);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0D0D0D';
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    canvas.isDrawing = true;
  };

  const draw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.isDrawing) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const coords = getCoordinates(e, rect);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    const canvas = canvasRef.current;
    if (canvas && canvas.isDrawing) {
      canvas.isDrawing = false;
      setSignatureData(canvas.toDataURL());
    }
  };

  // Phase 2: Restore a saved Base64 signature onto the canvas
  const restoreSignatureToCanvas = (base64) => {
    if (!base64 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = base64;
    setSignatureData(base64);
  };

  const filteredClients = (Array.isArray(clients) ? clients : []).filter(c => (c.name || '').toLowerCase().includes((formData.billToName || '').toLowerCase()));

  const handleProjectSelect = (p) => {
    const client = (Array.isArray(clients) ? clients : []).find(c => c.id === p.client_id || c.name === p.client_name);
    setFormData(prev => ({
      ...prev,
      project_id: p.id,
      billToName: p.client_name || '',
      billToCompany: client?.company_name || p.client_company || '',
      billToAddress: client?.address || p.location || '',
      billToGst: client?.gst_number || '',
      billToPhone: client?.primary_contact_phone || client?.phone || p.primary_contact_phone || '',
      billToEmail: client?.primary_contact_email || client?.email || ''
    }));
    setSelectedStageIds([]);
    fetchProjectStages(p.id);
    setProjectSearch('');
    setIsProjectDropdownOpen(false);
  };


  const filteredProjects = (projects || []).filter(p => 
    (p.name || '').toLowerCase().includes((projectSearch || '').toLowerCase()) ||
    (p.client_name || '').toLowerCase().includes((projectSearch || '').toLowerCase())
  );

  return (
    <AppLayout>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-invoice-area, #printable-invoice-area * {
            visibility: visible !important;
          }
          #printable-invoice-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          @page {
            size: A4;
            margin: 10mm 15mm 10mm 15mm;
          }
        }
      `}} />
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-3rem)] bg-[#F0F2F5] overflow-hidden -m-4 lg:-m-6" style={{ fontFamily: '"Inter", sans-serif' }}>
        
        {/* Left: Interactive Input Form (Redesigned) */}
        <div className={`w-full lg:w-[450px] flex flex-col h-full bg-white border-r border-gray-200 shadow-xl z-10 transition-all duration-300 ${showHistory ? 'translate-x-64' : ''}`}>
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Bill Generator</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-0.5">Corporate Standard</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowHistory(!showHistory)} className="p-2 rounded-lg hover:bg-white transition-all text-gray-600 border border-transparent hover:border-gray-200 shadow-sm bg-white/50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
              <button onClick={handleReset} className="p-2 rounded-lg hover:bg-white transition-all text-red-500 border border-transparent hover:border-red-100 shadow-sm bg-white/50" title="Reset Form">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 6L6 19M6 6l13 13"/></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 hide-scrollbar">
            
            {/* 1. Project & Client */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Project & Client</h3>
              </div>

              <div className="space-y-3">
                <div className="relative" ref={projectDropdownRef}>
                  <label className="label">Link Project</label>
                  <input 
                    type="text" 
                    value={projectSearch}
                    onChange={(e) => { setProjectSearch(e.target.value); setIsProjectDropdownOpen(true); }}
                    onFocus={() => setIsProjectDropdownOpen(true)}
                    className="input"
                    placeholder={formData.project_id ? "Project Linked" : "Search projects..."}
                  />
                  {isProjectDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto p-1">
                      {filteredProjects.length === 0 ? (
                        <div className="p-4 text-xs text-gray-400 italic text-center">No projects found</div>
                      ) : (
                        filteredProjects.map(p => (
                          <div 
                            key={p.id} 
                            onClick={() => handleProjectSelect(p)}
                            className="p-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-all"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-800">{p.name}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">{p.client_name}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Link Milestone(s) */}
                {projectStages.length > 0 && (
                  <div className="bg-orange-50/40 border border-orange-100 rounded-xl p-3.5 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <label className="label text-[#E05A1E] font-bold">Link Milestone(s)</label>
                      {loadingStages && <span className="loading loading-spinner loading-xs text-[#E05A1E]"></span>}
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {projectStages.map(s => (
                        <label key={s.id} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white border border-transparent hover:border-orange-100 transition-all rounded-lg">
                          <input
                            type="checkbox"
                            checked={selectedStageIds.includes(s.id)}
                            onChange={(e) => {
                              setSelectedStageIds(prev =>
                                e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                              );
                            }}
                            className="w-4 h-4 rounded text-[#E05A1E] border-gray-300 focus:ring-[#E05A1E] accent-[#E05A1E] cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">{s.document_type}</p>
                            <p className="text-[9px] text-gray-400 font-medium">Status: {s.status}</p>
                          </div>
                          <span className="font-mono text-xs font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                            ₹{Number(s.amount).toLocaleString('en-IN')}
                          </span>
                        </label>
                      ))}
                    </div>
                    {selectedStageIds.length > 0 && (
                      <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {selectedStageIds.length} milestone(s) will be consolidated
                      </p>
                    )}
                  </div>
                )}

                <div className="relative" ref={dropdownRef}>
                  <div className="flex justify-between items-end mb-1">
                    <label className="label">Client Details *</label>
                    <button onClick={() => setShowClientModal(true)} className="text-[10px] text-[#E05A1E] font-bold hover:underline">NEW CLIENT</button>
                  </div>
                  <input 
                    type="text" 
                    value={formData.billToName}
                    onChange={(e) => { 
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, billToName: val }));
                      setIsClientDropdownOpen(true); 
                    }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    className="input"
                    placeholder="Search or type client name..."
                  />
                  {isClientDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto p-1">
                      {filteredClients.map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => {
                            setFormData(prev => ({ 
                              ...prev, 
                              billToName: c.name, 
                              billToCompany: c.company_name || '',
                              billToAddress: c.address || '',
                              billToGst: c.gst_number || '',
                              billToPhone: c.primary_contact_phone || c.phone || '', 
                              billToEmail: c.primary_contact_email || c.email || '' 
                            }));
                            setIsClientDropdownOpen(false);
                          }}
                          className="p-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-all text-sm font-medium text-gray-800"
                        >
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <input 
                  type="text" 
                  name="billToCompany" 
                  value={formData.billToCompany} 
                  onChange={handleChange} 
                  className="input text-xs" 
                  placeholder="Client Company Name (Optional)" 
                />

                <textarea 
                  name="billToAddress" 
                  value={formData.billToAddress} 
                  onChange={handleChange} 
                  className="input min-h-[80px] py-3 text-xs" 
                  placeholder="Client Address"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input type="text" name="billToGst" value={formData.billToGst} onChange={handleChange} className="input text-xs" placeholder="Client GSTIN" />
                  <input type="text" name="billToPhone" value={formData.billToPhone} onChange={handleChange} className="input text-xs" placeholder="Client Phone" />
                </div>
              </div>
            </section>

            {/* 2. Invoice Details */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Invoice Details</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Invoice No *</label>
                  <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} className="input font-mono font-bold text-blue-600" />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Reference No & Date</label>
                  <input type="text" name="refNo" value={formData.refNo} onChange={handleChange} className="input" placeholder="e.g. Ref-01" />
                </div>
                <div>
                  <label className="label">Other References</label>
                  <input type="text" name="otherReferences" value={formData.otherReferences || ''} onChange={handleChange} className="input" placeholder="e.g. Email discussion" />
                </div>
                <div>
                  <label className="label">Buyer's Order No.</label>
                  <input type="text" name="buyerOrderNo" value={formData.buyerOrderNo} onChange={handleChange} className="input" placeholder="e.g. PO-9922" />
                </div>
                <div className="col-span-2">
                  <label className="label">Terms of Delivery</label>
                  <textarea name="termsOfDelivery" value={formData.termsOfDelivery || ''} onChange={handleChange} className="input min-h-[45px] py-2 text-xs" placeholder="e.g. Delivery within 15 days of drawings approval" />
                </div>
              </div>
            </section>

            {/* 3. Line Items */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Line Items</h3>
                </div>
                <button onClick={() => setShowCatalog(!showCatalog)} className="text-[10px] text-blue-600 font-bold hover:underline">BROWSE CATALOG</button>
              </div>

              {showCatalog && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg grid grid-cols-1 gap-2 animate-in fade-in duration-200">
                  {ITEM_CATALOG.map((item, idx) => (
                    <button 
                      key={idx}
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          items: [...prev.items, { id: Date.now(), description: item.description, hsn: '', quantity: 1, rate: item.rate, per: item.per || '' }]
                        }));
                        setShowCatalog(false);
                      }}
                      className="flex justify-between items-center p-2 hover:bg-white rounded border border-transparent hover:border-blue-200 transition-all text-left group"
                    >
                      <span className="text-[11px] font-medium text-blue-800 line-clamp-1">{item.description}</span>
                      <span className="text-[10px] font-bold text-blue-600">₹{item.rate.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {(formData.items || []).map((item, index) => (
                  <div key={item.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl relative group">
                    <button 
                      onClick={() => removeItem(item.id)} 
                      className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    >
                      &times;
                    </button>
                    <div className="space-y-3">
                      <textarea 
                        value={item.description} 
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="input min-h-[60px] text-xs bg-white" 
                        placeholder="Service description..."
                      />
                      <div className="grid grid-cols-4 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">HSN/SAC</label>
                          <input type="text" value={item.hsn} onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)} className="input text-xs h-8 px-2" placeholder="9983" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Qty</label>
                          <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} className="input text-xs h-8 px-2 text-center" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Rate (₹)</label>
                          <input type="number" value={item.rate} onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)} className="input text-xs h-8 px-2 text-right" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Per</label>
                          <input type="text" value={item.per || ''} onChange={(e) => handleItemChange(item.id, 'per', e.target.value)} className="input text-xs h-8 px-2" placeholder="e.g. Sqft" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addItem} className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#E05A1E] hover:bg-orange-50 text-gray-400 hover:text-[#E05A1E] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  ADD LINE ITEM
                </button>
              </div>
            </section>

            {/* 4. Financials */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Taxes & Banking</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">GST</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isGstEnabled} onChange={() => setIsGstEnabled(!isGstEnabled)} className="sr-only peer" />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#E05A1E]"></div>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">TDS</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isTdsEnabled} onChange={() => setIsTdsEnabled(!isTdsEnabled)} className="sr-only peer" />
                      <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#E05A1E]"></div>
                    </label>
                  </div>
                </div>
              </div>

              {isTdsEnabled && (
                <div className="flex gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl justify-between items-center">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">TDS Rate (%)</label>
                  <select 
                    name="tdsPercent" 
                    value={formData.tdsPercent} 
                    onChange={handleChange} 
                    className="text-xs bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#E05A1E]"
                  >
                    <option value="1">1% (Contractors)</option>
                    <option value="2">2% (Services)</option>
                    <option value="10">10% (Technical/Professional)</option>
                  </select>
                </div>
              )}

              {isGstEnabled && (
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button onClick={() => setIsIgst(false)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${!isIgst ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-gray-500'}`}>CGST + SGST</button>
                  <button onClick={() => setIsIgst(true)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${isIgst ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-gray-500'}`}>IGST ONLY</button>
                </div>
              )}

              <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Bank Details</label>
                  <button onClick={() => setShowBankDetails(!showBankDetails)} className="text-[10px] text-blue-600 font-bold hover:underline">
                    {showBankDetails ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {showBankDetails && (
                  <div className="space-y-2">
                    <input type="text" name="accountNo" value={formData.accountNo} onChange={handleChange} className="input h-9 text-xs" placeholder="Account Number" />
                    <input type="text" name="ifsc" value={formData.ifsc} onChange={handleChange} className="input h-9 text-xs" placeholder="IFSC Code" />
                    <input type="text" name="bankName" value={formData.bankName} onChange={handleChange} className="input h-9 text-xs" placeholder="Bank Name & Branch" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="border-b border-gray-100 pb-1">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Authorized Signature</h3>
                </div>
                <div className="flex flex-col items-center bg-white p-2 border border-gray-100 rounded-xl">
                  <canvas 
                    ref={canvasRef}
                    width={300} height={100}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={(e) => { e.preventDefault(); startDrawing(e); }}
                    onTouchMove={(e) => { e.preventDefault(); draw(e); }}
                    onTouchEnd={stopDrawing}
                    className="cursor-crosshair w-full h-24 touch-none"
                  />
                  <button onClick={() => {
                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    setSignatureData(null);
                  }} className="text-[9px] text-gray-400 hover:text-red-500 mt-2 font-bold uppercase tracking-tighter">Clear Signature</button>
                </div>
              </div>
            </section>
          </div>

          <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-3">
            {/* Phase 3.3: Inline confirm clear instead of window.confirm */}
            {showConfirmClear ? (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl items-center">
                <p className="text-[10px] text-red-700 font-bold flex-1">Clear all form data?</p>
                <button onClick={confirmReset} className="text-[10px] font-black text-white bg-red-500 px-3 py-1.5 rounded-lg hover:bg-red-600 transition-all">Yes, Clear</button>
                <button onClick={() => setShowConfirmClear(false)} className="text-[10px] font-black text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all">Cancel</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleGeneratePDF} 
                  disabled={isGenerating}
                  className="btn-primary w-full justify-center shadow-lg shadow-orange-100"
                >
                  {isGenerating ? (savedInvoiceRef && formData.invoiceNo === savedInvoiceRef.invoice_no ? 'Opening...' : 'Saving...') : 'Export PDF'}
                </button>
                {formData.project_id && (
                  <button 
                    onClick={() => handleRecordIncome(savedInvoiceRef)}
                    className="btn-success w-full justify-center"
                    title={!savedInvoiceRef ? 'Export PDF first to save the invoice' : ''}
                  >
                    Record Paid
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Corporate Invoice Preview (A4) */}
        <div className="flex-1 h-full bg-[#525659] overflow-y-auto p-12 flex justify-center custom-scrollbar">
          <div 
            ref={previewRef}
            id="printable-invoice-area"
            className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative text-[#1A1A1A] p-[15mm]"
            style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}
          >
            {/* Centered Top Invoice Banner */}
            <div className="w-full text-center bg-gray-500 text-white py-1 text-xs font-black uppercase tracking-widest border border-black border-b-0">
              PRO FORMA INVOICE
            </div>

            {/* Corporate Grid Table Header */}
            <table className="w-full table-fixed border border-black text-[10px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  {/* Left Column: Logo & Address */}
                  <td className="w-[45%] border-r border-black p-3 align-top" rowSpan={3}>
                    <div className="flex gap-3 items-start mb-3">
                      <img src={COMPANY_CONFIG.logoUrl} alt={COMPANY_CONFIG.brand} className="h-10 w-auto max-w-[160px] object-contain" />
                      <div>
                        <div className="font-extrabold text-sm uppercase tracking-tight text-gray-900">{COMPANY_CONFIG.brand}</div>
                      </div>
                    </div>
                    <div className="space-y-0.5 leading-normal text-gray-800 font-bold">
                      <p>{COMPANY_CONFIG.address}</p>
                      {COMPANY_CONFIG.email && <p>E-Mail: {COMPANY_CONFIG.email}</p>}
                      {COMPANY_CONFIG.phone && <p>Phone: {COMPANY_CONFIG.phone}</p>}
                      {COMPANY_CONFIG.gst && <p className="font-black text-black mt-2">GSTIN: {COMPANY_CONFIG.gst}</p>}
                    </div>
                  </td>
                  {/* Top-Right sub-grids */}
                  <td className="w-[27.5%] border-r border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Document Type</div>
                    <div className="font-mono font-black text-xs text-[#E05A1E]">PRO FORMA INVOICE</div>
                  </td>
                  <td className="w-[27.5%] border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">DATE</div>
                    <div className="font-black text-xs">{formData.date ? new Date(formData.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</div>
                  </td>
                </tr>
                <tr>
                  <td className="border-r border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Reference No. & Date</div>
                    <div className="font-black text-[9px]">{formData.refNo || '-'}</div>
                  </td>
                  <td className="border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Other References</div>
                    <div className="font-black text-[9px]">{formData.otherReferences || '-'}</div>
                  </td>
                </tr>
                <tr>
                  <td className="border-r border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Buyer's Order No.</div>
                    <div className="font-black text-[9px]">{formData.buyerOrderNo || '-'}</div>
                  </td>
                  <td className="border-b border-black p-2 align-top">
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Dated</div>
                    <div className="font-black text-[9px]">{formData.date ? new Date(formData.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</div>
                  </td>
                </tr>
                <tr>
                  <td className="p-2 align-top" colSpan={3}>
                    <div className="text-gray-400 font-bold uppercase text-[7px] tracking-wider mb-0.5">Terms of Delivery</div>
                    <div className="font-bold text-gray-700 italic">{formData.termsOfDelivery || 'N/A'}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Buyer (Bill to) Header & Box */}
            <div className="w-full bg-gray-100 text-black px-3 py-1 text-[8px] font-black uppercase tracking-wider border border-black border-t-0">
              Buyer (Bill to) - {formData.billToCompany && formData.billToName ? `${formData.billToName} (${formData.billToCompany})` : (formData.billToName || formData.billToCompany || 'CLIENT NAME')}
            </div>
            <div className="w-full border border-black border-t-0 p-3 text-[10px] space-y-1.5 leading-normal font-bold">
              {formData.billToCompany ? (
                <>
                  <div className="text-base font-black text-black leading-none mb-1">{formData.billToName || 'CLIENT NAME'}</div>
                  <div className="text-xs text-gray-800 font-bold mb-1">Company: {formData.billToCompany}</div>
                </>
              ) : (
                <div className="text-base font-black text-black leading-none mb-1">{formData.billToName || 'CLIENT NAME'}</div>
              )}
              <div className="text-black font-medium whitespace-pre-wrap">{formData.billToAddress || 'Client Address Not Provided'}</div>
              <div className="grid grid-cols-2 gap-4 pt-1 text-[8px] text-black">
                {formData.billToGst && <p><span className="font-black text-gray-900">GSTIN:</span> {formData.billToGst}</p>}
                {formData.billToPhone && <p><span className="font-black text-gray-900">Phone:</span> {formData.billToPhone}</p>}
              </div>
            </div>

            {/* Main Service Ledger Grid */}
            <table className="w-full border border-black border-t-0 text-[10px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-gray-100 border-b border-black text-[8px] font-black uppercase tracking-wider text-center">
                  <th className="py-2 border-r border-black w-10">Sr. NO</th>
                  <th className="py-2 border-r border-black text-left px-3">DESCRIPTION OF SERVICE</th>
                  <th className="py-2 border-r border-black w-16">Quantity</th>
                  <th className="py-2 border-r border-black w-24">Rate</th>
                  <th className="py-2 border-r border-black w-14">per</th>
                  <th className="py-2 w-28 text-right px-3">Amount</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {(formData.items || INITIAL_FORM.items).map((item, idx) => (
                  <tr key={item.id} className="border-b border-gray-100 align-top">
                    <td className="py-3 text-center border-r border-black text-gray-400 font-normal">{idx + 1}</td>
                    <td className="py-3 px-3 border-r border-black text-gray-900 whitespace-pre-wrap leading-relaxed">{item.description || 'Professional Design Services'}</td>
                    <td className="py-3 text-center border-r border-black text-gray-700">{item.quantity}</td>
                    <td className="py-3 text-center border-r border-black text-gray-700">₹{parseFloat(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 text-center border-r border-black text-gray-600 font-medium italic">{item.per || '-'}</td>
                    <td className="py-3 px-3 text-right text-gray-900 font-mono">₹{(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
                
                {/* Total Computations */}
                <tr className="border-t border-black bg-gray-50/50">
                  <td className="py-2 border-r border-black" colSpan={4}></td>
                  <td className="py-2 border-r border-black text-center font-black uppercase text-[7px]">SUB TOTAL</td>
                  <td className="py-2 px-3 text-right font-black font-mono">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                {isGstEnabled && !isIgst && (
                  <>
                    <tr className="border-b border-gray-100">
                      <td className="py-1.5 border-r border-black" colSpan={4}></td>
                      <td className="py-1.5 border-r border-black text-center font-black uppercase text-[7px]">CGST @ {formData.cgstPercent}%</td>
                      <td className="py-1.5 px-3 text-right font-black font-mono">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr className="border-b border-black">
                      <td className="py-1.5 border-r border-black" colSpan={4}></td>
                      <td className="py-1.5 border-r border-black text-center font-black uppercase text-[7px]">SGST @ {formData.sgstPercent}%</td>
                      <td className="py-1.5 px-3 text-right font-black font-mono">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </>
                )}
                {isGstEnabled && isIgst && (
                  <tr className="border-b border-black">
                    <td className="py-1.5 border-r border-black" colSpan={4}></td>
                    <td className="py-1.5 border-r border-black text-center font-black uppercase text-[7px]">IGST @ {formData.igstPercent}%</td>
                    <td className="py-1.5 px-3 text-right font-black font-mono">₹{igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                )}
                <tr className="bg-gray-100 font-black border-b border-black">
                  <td className="py-2 px-3 uppercase text-[8px] tracking-wider" colSpan={4}>TOTAL</td>
                  <td className="py-2 border-r border-black text-center text-[8px]">Rupees</td>
                  <td className="py-2 px-3 text-right text-[#E05A1E] font-black text-sm font-mono">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>

              </tbody>
            </table>

            {/* Bottom GST Audit Breakdown Table */}
            <div className="w-full text-center bg-gray-50 text-gray-800 py-0.5 text-[8px] font-bold uppercase tracking-wider border border-black border-t-0">
              GST Tax Breakdown Grid
            </div>
            <table className="w-full table-fixed border border-black border-t-0 text-[9px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr className="bg-gray-50 border-b border-black text-[8px] font-black uppercase text-center">
                  <th className="py-1 border-r border-black w-24">GSTIN</th>
                  <th className="py-1 border-r border-black">Taxable Value</th>
                  <th className="py-1 border-r border-black" colSpan={2}>CGST</th>
                  <th className="py-1 border-r border-black" colSpan={2}>SGST</th>
                  <th className="py-1 font-black">Total Tax Amount</th>
                </tr>
                <tr className="bg-gray-50 border-b border-black text-[7px] font-black uppercase text-center">
                  <th className="py-0.5 border-r border-black"></th>
                  <th className="py-0.5 border-r border-black"></th>
                  <th className="py-0.5 border-r border-black w-10">Rate</th>
                  <th className="py-0.5 border-r border-black">Amount</th>
                  <th className="py-0.5 border-r border-black w-10">Rate</th>
                  <th className="py-0.5 border-r border-black">Amount</th>
                  <th className="py-0.5"></th>
                </tr>
              </thead>
              <tbody className="font-bold text-center">
                <tr className="align-middle">
                  <td className="py-1.5 border-r border-black text-[8px]">{COMPANY_CONFIG.gst || '-'}</td>
                  <td className="py-1.5 border-r border-black font-mono">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 border-r border-black">{isGstEnabled && !isIgst ? `${formData.cgstPercent}%` : '0%'}</td>
                  <td className="py-1.5 border-r border-black font-mono">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 border-r border-black">{isGstEnabled && !isIgst ? `${formData.sgstPercent}%` : '0%'}</td>
                  <td className="py-1.5 border-r border-black font-mono">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 font-mono">₹{(cgst + sgst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr className="bg-gray-50 border-t border-black font-black uppercase text-[8px]">
                  <td className="py-1.5 border-r border-black text-left px-2">TOTAL</td>
                  <td className="py-1.5 border-r border-black font-mono">₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 border-r border-black"></td>
                  <td className="py-1.5 border-r border-black font-mono">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 border-r border-black"></td>
                  <td className="py-1.5 border-r border-black font-mono">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 font-mono">₹{(cgst + sgst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>

            {/* Total Amount in Words Banner */}
            <div className="w-full bg-gray-500 text-white px-3 py-1 text-[8px] font-black uppercase tracking-wider border border-black border-t-0 flex items-center justify-between">
              <span>Total Amount (in words):</span>
              <span className="font-extrabold">{convertNumberToWords(grandTotal).toUpperCase()} ONLY</span>
            </div>

            {/* Accounts Details & Legal Declaration */}
            <table className="w-full table-fixed border border-black border-t-0 text-[9px] min-h-[110px]" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td className="w-1/2 border-r border-black p-3 align-top leading-normal font-bold">
                    <div className="text-[9px] font-black uppercase tracking-wider mb-2 border-b pb-0.5 text-gray-900">ACCOUNT DETAILS</div>
                    <p className="flex justify-between"><span className="text-gray-400 font-black">a. Company Name:</span> <span>{formData.accountName || COMPANY_CONFIG.name}</span></p>
                    {formData.accountNo ? <p className="flex justify-between"><span className="text-gray-400 font-black">b. Account Number:</span> <span className="font-mono">{formData.accountNo}</span></p> : null}
                    {formData.ifsc ? <p className="flex justify-between"><span className="text-gray-400 font-black">c. IFSC Code:</span> <span className="font-mono">{formData.ifsc}</span></p> : null}
                    {formData.bankName ? <p className="flex justify-between"><span className="text-gray-400 font-black">d. Branch:</span> <span>{formData.bankName}</span></p> : null}
                    {COMPANY_CONFIG.gst ? <p className="flex justify-between"><span className="text-gray-400 font-black">e. GSTIN:</span> <span className="font-mono">{COMPANY_CONFIG.gst}</span></p> : null}
                  </td>
                  <td className="w-1/2 p-3 align-top leading-relaxed font-bold flex flex-col justify-between h-full">
                    <div>
                      {COMPANY_CONFIG.pan ? (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-gray-400 uppercase font-black text-[8px]">PAN:</span>
                          <span className="font-mono text-xs tracking-wide bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{COMPANY_CONFIG.pan}</span>
                        </div>
                      ) : null}
                      <p className="text-[7.5px] text-gray-500 leading-normal italic font-medium">
                        This is a Pro Forma Invoice issued for quotation / milestone estimation purposes only and is not a Tax Invoice.
                      </p>
                      {isTdsEnabled && (
                        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-[7.5px] text-amber-800 leading-normal font-bold">
                          * Note: Subject to TDS deduction of {formData.tdsPercent}% (₹{tdsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) on the subtotal. Net receivable amount is ₹{netReceivable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Authorized Signatory Block */}
            <div className="w-full border border-black border-t-0 p-4 flex justify-between items-center text-[10px]">
              <div className="text-left font-bold space-y-1">
                <p className="text-gray-400 font-black uppercase tracking-wider text-[7px]">Authorized Signatory</p>
                <p className="font-black text-xs uppercase text-gray-900">{COMPANY_CONFIG.brand}</p>
                <p className="font-black text-gray-700 pt-7 border-t border-dashed border-gray-300 w-44 mt-6">Authorized Signatory</p>
              </div>
              <div className="flex flex-col items-center justify-center">
                {signatureData ? (
                  <img src={signatureData} alt="Signature" className="h-12 object-contain mix-blend-multiply" />
                ) : (
                  <div className="h-12 w-44 border-b border-dashed border-gray-200" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* History Drawer Overlay */}
        {showHistory && (
          <div className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-0">
             <div className="absolute inset-0 bg-black/50 lg:hidden" onClick={() => setShowHistory(false)} />
             <div className="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 z-30 shadow-2xl flex flex-col transition-all duration-300">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gray-800">
                  <h3 className="text-[10px] font-black tracking-widest text-white uppercase">Invoice History</h3>
                  <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {(recentInvoices || []).map(inv => (
                    <div 
                      key={inv.id}
                      onClick={() => {
                        setFormData({
                          ...INITIAL_FORM,
                          project_id: inv.project_id || null,
                          payment_stage_id: inv.payment_stage_id || null,
                          invoiceNo: inv.invoice_no || '',
                          date: inv.date ? inv.date.split('T')[0] : INITIAL_FORM.date,
                          dueDate: inv.due_date ? inv.due_date.split('T')[0] : '',
                          refNo: inv.ref_no || inv.tax_details?.referenceNoAndDate || '',
                          otherReferences: inv.tax_details?.otherReferences || '',
                          buyerOrderNo: inv.buyer_order_no || inv.tax_details?.buyerOrderNo || '',
                          termsOfDelivery: inv.tax_details?.termsOfDelivery || '',
                          billToName: inv.client_name || '',
                          billToCompany: inv.client_company || inv.client_company_full || '',
                          billToAddress: inv.bill_to_address || '',
                          billToGst: inv.bill_to_gst || '',
                          billToPhone: inv.bill_to_phone || '',
                          billToEmail: inv.bill_to_email || '',
                          accountNo: inv.account_no || '',
                          ifsc: inv.ifsc || '',
                          bankName: inv.bank_name || '',
                          items: Array.isArray(inv.items)
                            ? inv.items.map(item => ({ ...item, id: item.id || Date.now(), hsn: item.hsn || '', per: item.per || '' }))
                            : INITIAL_FORM.items,
                          cgstPercent: inv.tax_details?.cgstPercent ?? 9,
                          sgstPercent: inv.tax_details?.sgstPercent ?? 9,
                          igstPercent: inv.tax_details?.igstPercent ?? 18,
                          tdsPercent: inv.tax_details?.tdsPercent ?? 10,
                        });
                        setIsGstEnabled(inv.tax_details?.isGstEnabled ?? true);
                        setIsIgst(inv.tax_details?.isIgst ?? false);
                        setIsTdsEnabled(inv.tax_details?.isTdsEnabled ?? false);
                        // Phase 2: Restore archived signature to canvas
                        if (inv.signature_data) {
                          setTimeout(() => restoreSignatureToCanvas(inv.signature_data), 50);
                        } else {
                          // Clear canvas if no saved signature
                          const canvas = canvasRef.current;
                          if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                          setSignatureData(null);
                        }
                        
                        // Sync project stages
                        if (inv.project_id) {
                          if (inv.payment_stage_id) {
                            setSelectedStageIds([inv.payment_stage_id]);
                            fetchProjectStages(inv.project_id, [inv.payment_stage_id]);
                          } else {
                            setSelectedStageIds([]);
                            fetchProjectStages(inv.project_id);
                          }
                        } else {
                          setSelectedStageIds([]);
                          setProjectStages([]);
                        }

                        // Phase 1: Track the invoice so mark-paid can use its DB id
                        setSavedInvoiceRef(inv);
                        setShowHistory(false);
                      }}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-all"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black text-[#E05A1E]">{inv.invoice_no}</span>
                        <span className="text-[8px] text-white/40 uppercase font-black">{new Date(inv.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[11px] text-white/80 font-bold truncate">{inv.client_name}</p>
                      <p className="text-[10px] text-white/60 font-black mt-2">₹{parseFloat(inv.amount).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}
      </div>

      {showClientModal && (
        <ClientModal client={null} onClose={() => setShowClientModal(false)} onSave={() => { fetchClients(); setShowClientModal(false); }} />
      )}
    </AppLayout>
  );
}
