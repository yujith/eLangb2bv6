-- ================================================================
-- Migration 007: Add 'teacher_only' organization type
-- ================================================================

-- Drop and recreate the org_type check constraint to include 'teacher_only'
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_org_type_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_org_type_check
  CHECK (org_type IN ('educational', 'corporate', 'hybrid', 'teacher_only'));
