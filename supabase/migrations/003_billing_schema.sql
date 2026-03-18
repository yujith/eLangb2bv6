-- ================================================================
-- eLanguage Center – Billing Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ========================
-- 1. Add billing columns to organizations
-- ========================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active' CHECK (billing_status IN ('active', 'on_hold', 'suspended'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ;

-- ========================
-- 2. Global Billing Configuration (singleton)
-- ========================
CREATE TABLE IF NOT EXISTS billing_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    default_license_cost DECIMAL(10,2) NOT NULL DEFAULT 15.00,
    currency TEXT NOT NULL DEFAULT 'USD',
    default_billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (default_billing_frequency IN ('monthly', 'quarterly', 'yearly')),
    default_credit_period_days INTEGER NOT NULL DEFAULT 30,
    auto_disable_enabled BOOLEAN NOT NULL DEFAULT true,
    invoice_prefix TEXT NOT NULL DEFAULT 'INV',
    invoice_next_number INTEGER NOT NULL DEFAULT 1001,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    company_name TEXT DEFAULT 'eLanguage Center',
    company_email TEXT DEFAULT '',
    company_address TEXT DEFAULT '',
    stripe_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config
INSERT INTO billing_config (default_license_cost, currency)
SELECT 15.00, 'USD'
WHERE NOT EXISTS (SELECT 1 FROM billing_config);

-- ========================
-- 3. Per-Org Billing Settings
-- ========================
CREATE TABLE IF NOT EXISTS org_billing_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    custom_license_cost DECIMAL(10,2),  -- NULL = use default
    billing_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_frequency IN ('monthly', 'quarterly', 'yearly')),
    credit_period_days INTEGER NOT NULL DEFAULT 30,
    next_billing_date DATE,
    billing_contact_email TEXT,
    stripe_customer_id TEXT,
    auto_disable_enabled BOOLEAN DEFAULT true,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- 4. Invoices
-- ========================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    license_count INTEGER NOT NULL,
    license_unit_cost DECIMAL(10,2) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'void')),
    billing_frequency TEXT,
    stripe_invoice_id TEXT,
    stripe_invoice_url TEXT,
    paid_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- 5. Payments
-- ========================
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'manual' CHECK (payment_method IN ('manual', 'stripe', 'bank_transfer', 'other')),
    stripe_payment_id TEXT,
    reference_number TEXT,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    recorded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- 6. Row Level Security
-- ========================
ALTER TABLE billing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Super admin: full access on all billing tables
CREATE POLICY "super_admin_billing_config" ON billing_config
    FOR ALL USING (get_user_role() = 'super_admin');

CREATE POLICY "super_admin_org_billing" ON org_billing_settings
    FOR ALL USING (get_user_role() = 'super_admin');

CREATE POLICY "super_admin_invoices" ON invoices
    FOR ALL USING (get_user_role() = 'super_admin');

CREATE POLICY "super_admin_payments" ON payments
    FOR ALL USING (get_user_role() = 'super_admin');

-- Org admins: view their own invoices and payments
CREATE POLICY "org_admin_view_invoices" ON invoices
    FOR SELECT USING (
        get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
    );

CREATE POLICY "org_admin_view_payments" ON payments
    FOR SELECT USING (
        get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
    );

CREATE POLICY "org_admin_view_billing_settings" ON org_billing_settings
    FOR SELECT USING (
        get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
    );

-- ========================
-- 7. Indexes
-- ========================
CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_billing_org_id ON org_billing_settings(organization_id);

-- ========================
-- 8. Helper: increment_usage_count (if not exists)
-- ========================
CREATE OR REPLACE FUNCTION increment_usage_count(item_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE global_content_items
    SET usage_count = usage_count + 1, last_used_at = NOW()
    WHERE id = item_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
