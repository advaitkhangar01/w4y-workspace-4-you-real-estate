/**
 * Backend constants for status and types
 */

const ATTENDANCE_STATUS = {
  WORKING: 'working',
  COMPLETED: 'completed',
  ABSENT: 'absent',
  HALF_DAY: 'half_day',
  LEAVE: 'leave'
};

const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const LEAVE_TYPE = {
  CASUAL: 'casual',
  SICK: 'sick',
  EMERGENCY: 'emergency',
  UNPAID: 'unpaid'
};

const USER_ROLES = {
  ADMIN: 'admin',
  DESIGN_HEAD: 'design_head',
  DESIGN: 'design',
  LIASONING: 'liasoning',
  CIVIL_ENGINEER: 'civil_engineer',
  EMPLOYEE: 'employee',
  BACK_OFFICE: 'back_office',
  PROJECT_HEAD: 'project_head'
};

const DOCUMENT_TAGS = [
  "Adhar Card & Pan Card",
  "Tax Receipt",
  "K Prata",
  "Final Proposal For Submission",
  "Sale Deed",
  "Layout Plan",
  "DP Plan",
  "Property Card",
  "Architectural Projection",
  "Indemnity Bond",
  "Structural Stability",
  "Shatipurta Bandh",
  "Sanction Plan",
  "Center Line",
  "Foundation And Footing",
  "Plinth Beam",
  "Plinth Slab",
  "Basement",
  "Ground Floor",
  "First Floor Slab",
  "Second Floor Slab",
  "Third Floor Slab",
  "Fourth Floor Slab",
  "Fifth Floor Slab",
  "Sixth Floor Slab",
  "Seventh Floor Slab",
  "Brick Plan",
  "Electrical",
  "Plumbing",
  "Sectional Details",
  "Elevation",
  "POP",
  "Grills And Railings",
  "Day View",
  "Night View",
  "Isometric View",
  "3d Floor Plan view",
  "Walkthrough",
  "Completion",
  "Others"
];

// ---------------------------------------------------------------------------
// FILE UPLOAD CONSTANTS
// ---------------------------------------------------------------------------

/**
 * Allowed file extensions grouped by category.
 * Used for both whitelist validation and per-category size limit resolution.
 */
const ALLOWED_FILE_EXTENSIONS = {
  image:   ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.svg', '.heic'],
  pdf:     ['.pdf'],
  office:  ['.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.rtf'],
  cad:     ['.dwg', '.dxf', '.dgn', '.plt', '.rvt', '.ifc', '.skp', '.3ds', '.max',
             '.step', '.stp', '.iges', '.igs'],
  archive: ['.zip', '.rar', '.7z'],
  future:  ['.psd', '.ai', '.cdr', '.blend', '.obj', '.fbx'],
};

/** Flat whitelist for O(1) lookup */
const ALLOWED_EXTENSIONS_FLAT = Object.values(ALLOWED_FILE_EXTENSIONS).flat();

/**
 * Always-blocked extensions — rejected regardless of MIME type.
 * Prevents executable / script uploads reaching the server filesystem.
 */
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.sh', '.cmd', '.php', '.js', '.py', '.rb', '.pl',
  '.ps1', '.vbs', '.jar', '.msi', '.dll', '.com', '.scr', '.pif',
  '.application', '.gadget', '.hta', '.cpl', '.msc', '.inf',
];

/**
 * Per-category file size limits (bytes).
 * Multer enforces the global MAX_FILE_SIZE cap; the route handler
 * enforces the finer per-category limits after the file lands on disk.
 */
const FILE_SIZE_LIMITS = {
  image:   15  * 1024 * 1024,   // 15 MB
  pdf:     50  * 1024 * 1024,   // 50 MB
  office:  50  * 1024 * 1024,   // 50 MB
  cad:     150 * 1024 * 1024,   // 150 MB
  archive: 200 * 1024 * 1024,   // 200 MB
  future:  100 * 1024 * 1024,   // 100 MB
  default: 50  * 1024 * 1024,   // 50 MB fallback
};

/** Hard global maximum — enforced at multer level before anything else */
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

/**
 * Allowed MIME types.
 * CAD tools (AutoCAD, Revit, etc.) frequently emit application/octet-stream.
 * This is permitted only when the file extension is in the cad/archive category.
 */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/bmp',
  'image/tiff', 'image/svg+xml', 'image/heic', 'image/heif',
  // PDF
  'application/pdf', 'application/x-pdf', 'application/acrobat', 'applications/vnd.pdf', 'text/pdf',
  // Office — Word
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  // Office — Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  // Office — PowerPoint
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.openxmlformats-officedocument.presentationml.template',
  // Text / CSV / RTF
  'text/plain', 'text/csv', 'application/rtf', 'text/rtf', 'text/comma-separated-values',
  // Archives
  'application/zip', 'application/x-zip-compressed', 'application/x-zip',
  'application/x-rar-compressed', 'application/vnd.rar', 'application/x-rar',
  'application/x-7z-compressed',
  // CAD — some tools emit specific MIME types, most emit octet-stream
  'application/acad', 'application/x-acad',
  'image/vnd.dwg', 'image/x-dwg',
  'application/vnd.ms-pki.stl',
  // Generic binary — allowed ONLY when extension is in cad/archive (see fileFilter)
  'application/octet-stream',
  'application/binary',
]);

/**
 * MIME types that are "generic" and require an extension double-check.
 * If a file arrives with one of these MIMEs its extension must be in
 * the cad or archive category (not just any whitelisted type).
 */
const GENERIC_MIME_TYPES = new Set([
  'application/octet-stream',
  'application/binary',
]);

/**
 * Stable mapping of DOCUMENT_TAGS UI labels → filesystem-safe slug.
 * Slugs use only lowercase ASCII letters, digits, and hyphens.
 * Special characters and Unicode are transliterated or removed.
 * This map is explicit (not auto-generated) so that changing a UI label
 * does NOT silently change the folder structure on disk.
 */
const DOCUMENT_TYPE_SLUG_MAP = {
  "Adhar Card & Pan Card":         "adhar-card-and-pan-card",
  "Tax Receipt":                   "tax-receipt",
  "K Prata":                       "k-prata",
  "Final Proposal For Submission": "final-proposal-for-submission",
  "Sale Deed":                     "sale-deed",
  "Layout Plan":                   "layout-plan",
  "DP Plan":                       "dp-plan",
  "Property Card":                 "property-card",
  "Architectural Projection":      "architectural-projection",
  "Indemnity Bond":                "indemnity-bond",
  "Structural Stability":          "structural-stability",
  "Shatipurta Bandh":              "shatipurta-bandh",
  "Sanction Plan":                 "sanction-plan",
  "Center Line":                   "center-line",
  "Foundation And Footing":        "foundation-and-footing",
  "Plinth Beam":                   "plinth-beam",
  "Plinth Slab":                   "plinth-slab",
  "Basement":                      "basement",
  "Ground Floor":                  "ground-floor",
  "First Floor Slab":              "first-floor-slab",
  "Second Floor Slab":             "second-floor-slab",
  "Third Floor Slab":              "third-floor-slab",
  "Fourth Floor Slab":             "fourth-floor-slab",
  "Fifth Floor Slab":              "fifth-floor-slab",
  "Sixth Floor Slab":              "sixth-floor-slab",
  "Seventh Floor Slab":            "seventh-floor-slab",
  "Brick Plan":                    "brick-plan",
  "Electrical":                    "electrical",
  "Plumbing":                      "plumbing",
  "Sectional Details":             "sectional-details",
  "Elevation":                     "elevation",
  "POP":                           "pop",
  "Grills And Railings":           "grills-and-railings",
  "Day View":                      "day-view",
  "Night View":                    "night-view",
  "Isometric View":                "isometric-view",
  "3d Floor Plan view":            "3d-floor-plan-view",
  "Walkthrough":                   "walkthrough",
  "Completion":                    "completion",
  "Others":                        "others",
};

/**
 * Returns the category string for a given file extension.
 * Falls back to 'default' for unknown extensions.
 * @param {string} ext — lowercase extension including dot, e.g. '.dwg'
 * @returns {'image'|'pdf'|'office'|'cad'|'archive'|'future'|'default'}
 */
function getExtensionCategory(ext) {
  const lower = ext.toLowerCase();
  for (const [category, exts] of Object.entries(ALLOWED_FILE_EXTENSIONS)) {
    if (exts.includes(lower)) return category;
  }
  return 'default';
}

/**
 * Returns a filesystem-safe folder slug for a document type label.
 * Falls back to a simple kebab-case conversion if not in the map.
 * @param {string} documentType — DOCUMENT_TAGS label
 * @returns {string}
 */
function getDocumentTypeSlug(documentType) {
  if (!documentType) return 'others';
  if (DOCUMENT_TYPE_SLUG_MAP[documentType]) return DOCUMENT_TYPE_SLUG_MAP[documentType];
  // Fallback: remove non-ASCII, lowercase, replace spaces/underscores with hyphens
  return documentType
    .toLowerCase()
    .replace(/[^\x00-\x7F]/g, '') // strip non-ASCII
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    || 'others';
}

module.exports = {
  ATTENDANCE_STATUS,
  LEAVE_STATUS,
  LEAVE_TYPE,
  USER_ROLES,
  DOCUMENT_TAGS,
  // File upload
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_EXTENSIONS_FLAT,
  BLOCKED_EXTENSIONS,
  FILE_SIZE_LIMITS,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  GENERIC_MIME_TYPES,
  DOCUMENT_TYPE_SLUG_MAP,
  // Helpers
  getExtensionCategory,
  getDocumentTypeSlug,
};
