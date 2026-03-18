-- ================================================================
-- Migration 006: Teacher Review Columns + Organization Type
-- ================================================================

-- ========================
-- 1. WRITING SUBMISSIONS: Add teacher review columns
-- ========================
ALTER TABLE writing_submissions 
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS teacher_band_scores JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ========================
-- 2. SPEAKING SUBMISSIONS: Add teacher review columns + fix status constraint
-- ========================
ALTER TABLE speaking_submissions 
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS teacher_band NUMERIC,
  ADD COLUMN IF NOT EXISTS teacher_band_scores JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Update speaking_submissions status constraint to include 'teacher_reviewed'
ALTER TABLE speaking_submissions DROP CONSTRAINT IF EXISTS speaking_submissions_status_check;
ALTER TABLE speaking_submissions ADD CONSTRAINT speaking_submissions_status_check 
  CHECK (status IN ('submitted', 'reviewed', 'teacher_reviewed'));

-- ========================
-- 3. ORGANIZATIONS: Add org_type column
-- Values: 'educational' (teachers + students), 'corporate' (students only), 'hybrid' (flexible)
-- ========================
ALTER TABLE organizations 
  ADD COLUMN IF NOT EXISTS org_type TEXT DEFAULT 'educational' 
    CHECK (org_type IN ('educational', 'corporate', 'hybrid'));

-- ========================
-- 4. WRITING SUBMISSIONS: Add human_review_requested column (used by student Writing.jsx)
-- ========================
ALTER TABLE writing_submissions 
  ADD COLUMN IF NOT EXISTS human_review_requested BOOLEAN DEFAULT false;
