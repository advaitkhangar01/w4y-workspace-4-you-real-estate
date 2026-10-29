-- Migration 024: Builder Module
-- Adds material catalogue, project construction stages, project material requirements,
-- project material movements ledger, site diary, and site issues tracker.

-- 1. Reference Material Catalogue
CREATE TABLE IF NOT EXISTS material_catalogue (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  default_unit VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_cat_category ON material_catalogue(category);
CREATE INDEX IF NOT EXISTS idx_material_cat_active ON material_catalogue(is_active);

-- 2. Project Construction Stages (Project-scoped timeline)
CREATE TABLE IF NOT EXISTS project_construction_stages (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_number INT NOT NULL,
  stage_name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'ready', 'in_progress', 'completed', 'blocked')),
  planned_start DATE,
  planned_finish DATE,
  actual_start TIMESTAMPTZ,
  actual_finish TIMESTAMPTZ,
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  assigned_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  prerequisite_stage_id INT REFERENCES project_construction_stages(id) ON DELETE SET NULL,
  blocker_reason TEXT,
  blocker_reported_by INT REFERENCES users(id) ON DELETE SET NULL,
  blocker_reported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_project_stage_number UNIQUE (project_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_proj_stages_proj_id ON project_construction_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_stages_status ON project_construction_stages(status);

-- 3. Project Material Requirements
CREATE TABLE IF NOT EXISTS project_material_requirements (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id INT NOT NULL REFERENCES material_catalogue(id),
  specification VARCHAR(255),
  quantity_needed NUMERIC(12, 3) NOT NULL CHECK (quantity_needed > 0),
  unit VARCHAR(50) NOT NULL,
  required_by DATE,
  stage_id INT REFERENCES project_construction_stages(id) ON DELETE SET NULL,
  preferred_vendor_id INT REFERENCES vendors(id) ON DELETE SET NULL,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partially_fulfilled', 'fulfilled', 'cancelled')),
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proj_mat_req_proj ON project_material_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_mat_req_mat ON project_material_requirements(material_id);

-- 4. Project Material Movements Ledger (Authoritative single source of truth for stock)
CREATE TABLE IF NOT EXISTS project_material_movements (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id INT NOT NULL REFERENCES material_catalogue(id),
  requirement_id INT REFERENCES project_material_requirements(id) ON DELETE SET NULL,
  movement_type VARCHAR(50) NOT NULL CHECK (movement_type IN ('receipt', 'consumption', 'site_return', 'supplier_return', 'wastage', 'adjustment')),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(50) NOT NULL,
  condition VARCHAR(50) DEFAULT 'good' CHECK (condition IN ('good', 'partially_damaged', 'rejected')),
  accepted_quantity NUMERIC(12, 3) DEFAULT NULL CHECK (accepted_quantity IS NULL OR accepted_quantity >= 0),
  rejected_quantity NUMERIC(12, 3) DEFAULT 0 CHECK (rejected_quantity >= 0),
  challan_invoice_no VARCHAR(100),
  vendor_id INT REFERENCES vendors(id) ON DELETE SET NULL,
  stage_id INT REFERENCES project_construction_stages(id) ON DELETE SET NULL,
  work_area VARCHAR(255),
  reason TEXT,
  notes TEXT,
  photo_url TEXT,
  idempotency_key VARCHAR(128),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversal_of_id INT REFERENCES project_material_movements(id) ON DELETE SET NULL,
  recorded_by INT NOT NULL REFERENCES users(id),
  occurrence_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_movement_idempotency UNIQUE (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_proj_mat_mov_proj ON project_material_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_mat_mov_mat ON project_material_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_proj_mat_mov_type ON project_material_movements(movement_type);

-- 5. Site Diary
CREATE TABLE IF NOT EXISTS project_site_diary (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  work_completed TEXT NOT NULL,
  work_area VARCHAR(255),
  stage_id INT REFERENCES project_construction_stages(id) ON DELETE SET NULL,
  issues_delays TEXT,
  next_day_plan TEXT,
  photo_urls JSONB DEFAULT '[]'::jsonb,
  recorded_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proj_site_diary_proj ON project_site_diary(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_site_diary_date ON project_site_diary(report_date);

-- 6. Site Issues Tracker
CREATE TABLE IF NOT EXISTS project_site_issues (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'other' CHECK (category IN ('shortage', 'delayed_delivery', 'damaged_material', 'site_access', 'rework', 'safety', 'quality', 'other')),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  stage_id INT REFERENCES project_construction_stages(id) ON DELETE SET NULL,
  assigned_to INT REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution_notes TEXT,
  photo_urls JSONB DEFAULT '[]'::jsonb,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proj_site_issues_proj ON project_site_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_proj_site_issues_status ON project_site_issues(status);

-- 7. View for authoritative stock calculation
-- Usable quantity = accepted receipts + usable returns - consumption - supplier returns - wastage
CREATE OR REPLACE VIEW project_material_stock_summary AS
SELECT 
  pmm.project_id,
  pmm.material_id,
  mc.name AS material_name,
  mc.category AS material_category,
  mc.default_unit,
  COALESCE(SUM(CASE WHEN pmm.movement_type = 'receipt' AND NOT pmm.is_reversed THEN COALESCE(pmm.accepted_quantity, pmm.quantity) ELSE 0 END), 0) AS total_received,
  COALESCE(SUM(CASE WHEN pmm.movement_type = 'site_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_returned_usable,
  COALESCE(SUM(CASE WHEN pmm.movement_type = 'consumption' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_consumed,
  COALESCE(SUM(CASE WHEN pmm.movement_type = 'supplier_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_returned_supplier,
  COALESCE(SUM(CASE WHEN pmm.movement_type = 'wastage' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0) AS total_wastage,
  (
    COALESCE(SUM(CASE WHEN pmm.movement_type = 'receipt' AND NOT pmm.is_reversed THEN COALESCE(pmm.accepted_quantity, pmm.quantity) ELSE 0 END), 0)
    + COALESCE(SUM(CASE WHEN pmm.movement_type = 'site_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pmm.movement_type = 'consumption' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pmm.movement_type = 'supplier_return' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN pmm.movement_type = 'wastage' AND NOT pmm.is_reversed THEN pmm.quantity ELSE 0 END), 0)
  ) AS usable_stock
FROM project_material_movements pmm
JOIN material_catalogue mc ON mc.id = pmm.material_id
GROUP BY pmm.project_id, pmm.material_id, mc.name, mc.category, mc.default_unit;

-- 8. Seed Material Catalogue with common Maharashtra / Nagpur materials
INSERT INTO material_catalogue (name, category, aliases, default_unit, description)
VALUES
  -- Cement & Concrete
  ('OPC 53 Grade Cement', 'Cement & Concrete', ARRAY['OPC', '53 Grade', 'UltraTech OPC', 'Ambuja OPC'], 'bags', 'Ordinary Portland Cement 53 Grade for structural RCC works'),
  ('PPC Cement', 'Cement & Concrete', ARRAY['PPC', 'Flyash Cement', 'Portland Pozzolana'], 'bags', 'Portland Pozzolana Cement for masonry, plastering and general works'),
  ('Ready-Mix Concrete (M20/M25)', 'Cement & Concrete', ARRAY['RMC', 'Ready Mix', 'Transit Concrete'], 'cu_m', 'Design mix concrete batch delivered via transit mixer'),
  ('White Cement', 'Cement & Concrete', ARRAY['JK White', 'Birla White'], 'bags', 'White Portland cement for tile joints, architectural finishing and base coats'),

  -- Steel & Reinforcement
  ('TMT Steel Bars (Fe 500D)', 'Steel & Reinforcement', ARRAY['Sariya', 'Steel', 'Rebar', 'TMT Bars', 'TATA Tiscon', 'Jindal Panther'], 'tonnes', 'Thermo-Mechanically Treated high strength reinforcement bars for RCC'),
  ('Binding Wire (18 Gauge)', 'Steel & Reinforcement', ARRAY['Taar', 'Binding Wire', 'GI Wire', 'Reinforcement Wire'], 'kg', 'Annealed binding wire for tying rebar reinforcements'),
  ('Structural Steel (MS Angles / Channels)', 'Steel & Reinforcement', ARRAY['MS Angle', 'ISMC Channel', 'Girder', 'I-Beam'], 'kg', 'Mild steel structural sections for trusses, sheds and frames'),

  -- Sand & Aggregates
  ('River Sand (Washed)', 'Sand & Aggregates', ARRAY['Ret', 'Reti', 'Baloo', 'Natural Sand', 'Kanhan Reti'], 'brass', 'Natural washed river sand for masonry and plastering works'),
  ('Crushed M-Sand (Manufactured Sand)', 'Sand & Aggregates', ARRAY['M-Sand', 'Manufactured Sand', 'Crusher Dust'], 'brass', 'Engineered crushed sand graded for structural concrete'),
  ('10mm Aggregate (Gitti)', 'Sand & Aggregates', ARRAY['10mm Gitti', 'Aggregate 10mm', 'Crushed Stone 10mm'], 'brass', 'Crushed blue metal stone aggregate for RCC mix design'),
  ('20mm Aggregate (Gitti)', 'Sand & Aggregates', ARRAY['20mm Gitti', 'Aggregate 20mm', 'Crushed Stone 20mm'], 'brass', 'Standard coarse aggregate for structural concrete foundations and slabs'),
  ('40mm Aggregate (Gitti)', 'Sand & Aggregates', ARRAY['40mm Gitti', 'Aggregate 40mm', 'Soling Stone'], 'brass', 'Coarse aggregate for PCC base soling and road sub-base'),
  ('Stone Dust', 'Sand & Aggregates', ARRAY['Stone Dust', 'Quarry Dust', 'Fine Dust'], 'brass', 'Fine crushing residue for bedding and paver block laying'),

  -- Earthwork
  ('Murum (Compaction Quality)', 'Earthwork', ARRAY['Murrum', 'Hard Murum', 'Yellow Murum', 'Filling Soil'], 'brass', 'Weathered rock soil mixture for site filling and plinth compaction'),
  ('Black Cotton Backfill Soil', 'Earthwork', ARRAY['Filling Soil', 'Mitti', 'Garden Soil'], 'brass', 'Selected backfill soil for non-structural landscaping and external trenching'),

  -- Masonry & Walling
  ('Red Clay Bricks', 'Masonry', ARRAY['Lal Eent', 'Red Bricks', 'Kiln Bricks', 'Clay Bricks'], 'pieces', 'Standard kiln-burnt clay bricks for loadbearing and partition walls'),
  ('Fly Ash Bricks', 'Masonry', ARRAY['Flyash Bricks', 'Cement Bricks', 'Grey Bricks'], 'pieces', 'Eco-friendly autoclaved fly ash cement bricks (230x110x75 mm)'),
  ('AAC Blocks (600x200x150 mm)', 'Masonry', ARRAY['AAC', 'Siporex', 'Lightweight Blocks', 'Aerated Blocks'], 'pieces', 'Autoclaved aerated concrete blocks for rapid partition walling'),
  ('AAC Block Jointing Mortar', 'Masonry', ARRAY['Block Adhesive', 'Polymer Mortar', 'Thin Bed Mortar'], 'bags', 'Ready-mix polymer modified dry adhesive for AAC block joints'),

  -- Waterproofing
  ('Integral Waterproofing Compound', 'Waterproofing', ARRAY['Dr. Fixit Pidiproof', 'LW+', 'Plastocrete', 'Waterproofer'], 'litres', 'Liquid additive for concrete and plaster waterproofing'),
  ('Elastomeric Waterproofing Coating', 'Waterproofing', ARRAY['Waterproof Membrane', 'Dr. Fixit Raincoat', 'Terrace Shield'], 'litres', 'Brush-applied flexible waterproofing coat for terraces and wet areas'),
  ('Bituminous Primer & SBS Membrane', 'Waterproofing', ARRAY['Tar Felt', 'SBS Membrane', 'Torch-on Felt'], 'sq_m', 'Heavy-duty membrane for basement retaining walls and sunken slabs'),

  -- Plumbing & Sanitary
  ('CPVC Pipes & Fittings (Hot & Cold)', 'Plumbing', ARRAY['CPVC', 'Ashirvad CPVC', 'Astral CPVC'], 'pieces', 'Chlorinated polyvinyl chloride pipes for internal hot/cold water supply'),
  ('PVC Drainage Pipes (SWR 110mm)', 'Plumbing', ARRAY['SWR Pipe', 'PVC Drain Pipe', '110mm Pipe', 'Supreme SWR'], 'pieces', 'Soil, waste and rainwater drainage pipes with rubber ring joints'),
  ('Overhead Water Storage Tank (1000L)', 'Plumbing', ARRAY['Sintex Tank', 'Plasto Tank', '1000L Tank', 'Water Tank'], 'pieces', 'Triple layer UV stabilized food-grade overhead water storage tank'),
  ('Brass Concealed Stop Cocks & Ball Valves', 'Plumbing', ARRAY['Valves', 'Stop Cock', 'Ball Valve', 'Gate Valve'], 'pieces', 'Quarter-turn brass plumbing control valves'),

  -- Electrical
  ('PVC Conduit Pipes (25mm Heavy Duty)', 'Electrical', ARRAY['Conduit', 'Electrical Pipe', 'VIP Conduit'], 'pieces', 'Fire retardant rigid PVC conduits for concealed slab and wall piping'),
  ('FR Copper Wire (1.5 sq mm)', 'Electrical', ARRAY['1.5mm Wire', 'Polycab Wire', 'Finolex Wire', 'Taar'], 'coils', 'Flame retardant multi-strand flexible copper wire for lighting circuits'),
  ('FR Copper Wire (2.5 sq mm)', 'Electrical', ARRAY['2.5mm Wire', 'Power Wire', 'Finolex 2.5'], 'coils', 'Flame retardant flexible copper wire for power plug points and appliances'),
  ('FR Copper Wire (4.0 sq mm)', 'Electrical', ARRAY['4mm Wire', 'AC Wire', 'Heavy Wire'], 'coils', 'High capacity copper wire for air conditioning and power panels'),
  ('Modular Switch Plates & Accessories', 'Electrical', ARRAY['Legrand Switches', 'Roma Switches', 'Modular Switches'], 'pieces', 'Modular polycarbonate switch plates, 6A/16A switches and sockets'),

  -- Flooring & Tiling
  ('Vitrified Floor Tiles (600x1200 mm)', 'Flooring & Tiling', ARRAY['Floor Tiles', 'Vitrified Tiles', 'Kajaria Tiles', 'Somany'], 'sq_m', 'Glazed vitrified tiles with rectified edges for interior living areas'),
  ('Ceramic Anti-Skid Bathroom Tiles', 'Flooring & Tiling', ARRAY['Bathroom Tiles', 'Anti-Skid Tiles', 'Wall Tiles'], 'sq_m', 'Matte finish slip-resistant tiles for bathrooms and balconies'),
  ('Granite Slabs (Jet Black / Telephone Black)', 'Flooring & Tiling', ARRAY['Black Granite', 'Granite Slabs', 'Kitchen Platform Granite'], 'sq_ft', 'Polished natural granite slabs for kitchen counter and stair treads'),
  ('Tile Adhesive (Polymer Based)', 'Flooring & Tiling', ARRAY['Tile Fix', 'Roff', 'Ferrous Adhesive', 'Tile Glue'], 'bags', 'Self-curing dry mortar for fixing vitrified and ceramic tiles'),
  ('Epoxy Tile Grout', 'Flooring & Tiling', ARRAY['Epoxy Grout', 'Tile Joint Grout', 'Waterproof Grout'], 'kg', 'Stain-free chemical resistant grout for wet area tile joints'),

  -- Finishing & Paint
  ('White Cement Wall Putty', 'Finishing & Paint', ARRAY['Birla Wall Care', 'JK Wall Putty', 'Wall Putty'], 'bags', 'Water-resistant white cement based putty for smooth wall leveling'),
  ('Interior Acrylic Emulsion Paint', 'Finishing & Paint', ARRAY['Interior Paint', 'Asian Paints Royale', 'Plastic Paint'], 'litres', 'Smooth luxury interior wall emulsion paint'),
  ('Exterior Weatherproof Acrylic Paint', 'Finishing & Paint', ARRAY['Apex Ultima', 'Exterior Paint', 'Weather Coat'], 'litres', 'High durability anti-algal exterior wall finish'),
  ('Water-Based Interior Wall Primer', 'Finishing & Paint', ARRAY['Wall Primer', 'Decoprime', 'Base Primer'], 'litres', 'Undercoat primer ensuring optimal paint adhesion and uniform sheen'),

  -- Doors & Windows
  ('Flush Door Shutters (30mm Water Resistant)', 'Doors & Windows', ARRAY['Flush Doors', 'Wooden Doors', 'Plywood Doors'], 'pieces', 'Commercial solid core hot pressed flush doors'),
  ('Aluminium Sliding Window Sections (Domai Series)', 'Doors & Windows', ARRAY['Aluminium Windows', 'Sliding Windows', 'Window Frame'], 'sq_ft', 'Powder-coated aluminium 3-track sliding window sections with mesh'),
  ('Toughened Float Glass (5mm/6mm Clear)', 'Doors & Windows', ARRAY['Clear Glass', 'Window Glass', 'Toughened Glass'], 'sq_ft', 'Architectural float glass for window panels and ventilators'),

  -- External Development
  ('Interlocking Concrete Paver Blocks (60mm/80mm)', 'External Development', ARRAY['Paver Blocks', 'Paving Tiles', 'Driveway Pavers'], 'sq_m', 'Precast high-strength hydraulic pressed concrete interlocking pavers'),
  ('RCC Hume Drainage Pipes (300mm NP2)', 'External Development', ARRAY['Hume Pipe', 'Cement Drainage Pipe', 'RCC Pipe'], 'pieces', 'Reinforced spun concrete drainage pipes for stormwater culverts'),

  -- Consumables & Safety
  ('Steel Wire Nails (2 inch to 4 inch)', 'Consumables', ARRAY['Nails', 'Keel', 'Shuttering Nails'], 'kg', 'Cold-forged steel round wire nails for shuttering and carpentry'),
  ('Industrial Safety Helmets & High-Vis Jackets', 'Consumables', ARRAY['Safety Helmets', 'Hard Hats', 'Reflective Vests'], 'pieces', 'ISI certified construction site PPE for engineers and labour')
ON CONFLICT DO NOTHING;
