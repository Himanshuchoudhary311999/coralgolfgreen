CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Development reset. Remove this DROP block and use migrations before production deployment.
DROP TABLE IF EXISTS audit_logs, adjustments, expenses, payment_allocations, payments, maintenance_dues,
  billing_periods, maintenance_plans, flat_owners, owners, admin_users, flats, buildings,
  communities CASCADE;

CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  name VARCHAR(80) NOT NULL,
  code VARCHAR(20) NOT NULL,
  floors SMALLINT NOT NULL CHECK (floors > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, code)
);

CREATE TABLE flats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  building_id UUID REFERENCES buildings(id),
  flat_no VARCHAR(20) NOT NULL,
  floor_no SMALLINT CHECK (floor_no IS NULL OR floor_no >= 0),
  flat_type VARCHAR(40),
  area_sqft NUMERIC(10,2) CHECK (area_sqft IS NULL OR area_sqft > 0),
  resident_pin VARCHAR(4) CHECK (resident_pin IS NULL OR resident_pin ~ '^[0-9]{4}$'),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'vacant', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, flat_no)
);

CREATE TABLE owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(160) NOT NULL,
  phone VARCHAR(30),
  email VARCHAR(254),
  address TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flat_owners (
  flat_id UUID NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id),
  ownership_type VARCHAR(20) NOT NULL DEFAULT 'owner' CHECK (ownership_type IN ('owner', 'tenant', 'occupant')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE CHECK (valid_to IS NULL OR valid_to >= valid_from),
  PRIMARY KEY (flat_id, owner_id, valid_from)
);
CREATE UNIQUE INDEX one_primary_flat_owner ON flat_owners(flat_id) WHERE is_primary AND valid_to IS NULL;

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(60) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'collector' CHECK (role IN ('super_admin', 'admin', 'collector', 'viewer')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  name VARCHAR(120) NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL CHECK (monthly_amount >= 0),
  late_fee_per_day NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_fee_per_day >= 0),
  late_fee_start_day SMALLINT NOT NULL DEFAULT 11 CHECK (late_fee_start_day BETWEEN 1 AND 31),
  effective_from DATE NOT NULL,
  effective_to DATE CHECK (effective_to IS NULL OR effective_to >= effective_from),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE billing_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES maintenance_plans(id),
  period_month DATE NOT NULL CHECK (EXTRACT(DAY FROM period_month) = 1),
  due_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, period_month)
);

CREATE TABLE maintenance_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flat_id UUID NOT NULL REFERENCES flats(id),
  billing_period_id UUID NOT NULL REFERENCES billing_periods(id),
  due_month DATE NOT NULL CHECK (EXTRACT(DAY FROM due_month) = 1),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'advanced_paid', 'waived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flat_id, due_month)
);

CREATE TABLE community_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  name VARCHAR(160) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, name)
);

CREATE TABLE collection_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES community_collections(id) ON DELETE CASCADE,
  flat_id UUID NOT NULL REFERENCES flats(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'waived')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, flat_id)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  flat_id UUID NOT NULL REFERENCES flats(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode VARCHAR(20) NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'bank', 'card', 'cheque')),
  reference_no VARCHAR(120),
  collected_by UUID REFERENCES admin_users(id),
  collected_by_name VARCHAR(120),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (payment_mode <> 'cash' OR NULLIF(TRIM(collected_by_name), '') IS NOT NULL)
);

CREATE TABLE payment_allocations (
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  due_id UUID NOT NULL REFERENCES maintenance_dues(id),
  maintenance_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (maintenance_amount >= 0),
  late_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (late_fee_amount >= 0),
  PRIMARY KEY (payment_id, due_id),
  CHECK (maintenance_amount + late_fee_amount > 0)
);

CREATE TABLE collection_payment_allocations (
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  collection_due_id UUID NOT NULL REFERENCES collection_dues(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payment_id, collection_due_id)
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  category VARCHAR(120) NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'maintenance' CHECK (source_type IN ('maintenance', 'collection')),
  collection_id UUID REFERENCES community_collections(id),
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'bank')),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE expenses
  ADD CONSTRAINT expenses_collection_source_check
  CHECK ((source_type = 'maintenance' AND collection_id IS NULL) OR (source_type = 'collection' AND collection_id IS NOT NULL));

CREATE TABLE adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  due_id UUID NOT NULL REFERENCES maintenance_dues(id),
  amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('discount', 'waiver', 'penalty', 'correction')),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id),
  name VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, name)
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES admin_users(id),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flats_community_status ON flats(community_id, status, flat_no);
CREATE INDEX idx_flat_owners_owner ON flat_owners(owner_id);
CREATE INDEX idx_dues_flat_status_month ON maintenance_dues(flat_id, status, due_month);
CREATE INDEX idx_collection_dues_flat_status ON collection_dues(flat_id, status);
CREATE INDEX idx_payments_flat_paid_at ON payments(flat_id, paid_at DESC);
CREATE INDEX idx_expenses_community_date ON expenses(community_id, expense_date DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flats_updated_at BEFORE UPDATE ON flats FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER owners_updated_at BEFORE UPDATE ON owners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER communities_updated_at BEFORE UPDATE ON communities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER dues_updated_at BEFORE UPDATE ON maintenance_dues FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
