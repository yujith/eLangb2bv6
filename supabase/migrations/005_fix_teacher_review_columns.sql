-- ================================================================
-- eLanguage Center – Fix Teacher Review Columns
-- Adds missing columns to writing_submissions & speaking_submissions
-- that the Teacher review pages expect.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ========================
-- 1. WRITING SUBMISSIONS – add missing columns
-- ========================

ALTER TABLE writing_submissions
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS teacher_band_scores JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ========================
-- 2. SPEAKING SUBMISSIONS – add missing columns
-- ========================

ALTER TABLE speaking_submissions
  ADD COLUMN IF NOT EXISTS teacher_feedback TEXT,
  ADD COLUMN IF NOT EXISTS teacher_band NUMERIC,
  ADD COLUMN IF NOT EXISTS teacher_band_scores JSONB,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ========================
-- 3. SPEAKING SUBMISSIONS – fix status constraint
--    Code uses 'teacher_reviewed' but schema only allows ('submitted','reviewed')
-- ========================

ALTER TABLE speaking_submissions DROP CONSTRAINT IF EXISTS speaking_submissions_status_check;
ALTER TABLE speaking_submissions ADD CONSTRAINT speaking_submissions_status_check
  CHECK (status IN ('submitted', 'reviewed', 'teacher_reviewed'));

-- ========================
-- 4. RLS: let teachers UPDATE speaking_submissions
--    (writing already has this, speaking was missing)
-- ========================

-- Teachers need UPDATE access to mark speaking as 'teacher_reviewed'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'speaking_submissions' AND policyname = 'teachers_update_speaking'
  ) THEN
    CREATE POLICY "teachers_update_speaking" ON speaking_submissions
      FOR UPDATE USING (
        get_user_role() = 'teacher' AND
        student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
      );
  END IF;
END $$;
