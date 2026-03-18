-- ================================================================
-- eLanguage Center – Billing Flow Updates
-- Adds: auto-invoice generation, auto-charge opt-in, grace periods
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ========================
-- 1. New columns on org_billing_settings
-- ========================

-- SuperAdmin controls: should invoices be auto-generated for this org?
ALTER TABLE org_billing_settings ADD COLUMN IF NOT EXISTS auto_generate_invoice BOOLEAN NOT NULL DEFAULT false;

-- Org Admin controls: allow auto-charging their saved card?
ALTER TABLE org_billing_settings ADD COLUMN IF NOT EXISTS auto_charge_enabled BOOLEAN NOT NULL DEFAULT false;

-- Grace period after due date before org gets disabled (days)
ALTER TABLE org_billing_settings ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 7;

-- ========================
-- 2. New default on billing_config
-- ========================
ALTER TABLE billing_config ADD COLUMN IF NOT EXISTS default_grace_period_days INTEGER NOT NULL DEFAULT 7;

-- ========================
-- 3. Allow org_admins to UPDATE their own auto_charge_enabled setting
--    (they already have SELECT via existing policy)
-- ========================
CREATE POLICY "org_admin_update_auto_charge" ON org_billing_settings
    FOR UPDATE USING (
        get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
    )
    WITH CHECK (
        get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
    );
