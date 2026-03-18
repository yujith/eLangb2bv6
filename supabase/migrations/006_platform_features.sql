-- ================================================================
-- eLanguage Center – Platform Features Migration
-- Adds: sidebar branding, billing start date, API rate limits,
--        premium org flag, teacher listening review, human writing
--        review requests, and speaking simulator sessions.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ========================
-- 1. ORGANIZATIONS – new columns
-- ========================

-- Customizable sidebar/logo area background color
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sidebar_bg_color TEXT DEFAULT '#1E293B';

-- API rate limiting per org
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS daily_api_limit_per_user INTEGER DEFAULT 50;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS daily_api_limit_org INTEGER DEFAULT 500;

-- Premium organization flag
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;

-- ========================
-- 2. ORG BILLING SETTINGS – billing start date
-- ========================

ALTER TABLE org_billing_settings ADD COLUMN IF NOT EXISTS billing_start_date DATE;

-- ========================
-- 3. ATTEMPTS – teacher review columns for listening
-- ========================

ALTER TABLE attempts ADD COLUMN IF NOT EXISTS teacher_override_score NUMERIC;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- ========================
-- 4. WRITING SUBMISSIONS – human review request flag
-- ========================

ALTER TABLE writing_submissions ADD COLUMN IF NOT EXISTS human_review_requested BOOLEAN DEFAULT false;

-- ========================
-- 5. SPEAKING SESSIONS – realtime simulator data
-- ========================

CREATE TABLE IF NOT EXISTS speaking_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed', 'scoring')),
    current_stage TEXT DEFAULT 'part1',

    -- Audio
    audio_urls JSONB DEFAULT '{}',

    -- Transcript
    transcript JSONB DEFAULT '[]',
    examiner_prompts JSONB DEFAULT '[]',

    -- Scoring
    score_report JSONB,
    overall_band NUMERIC,
    sub_scores JSONB,

    -- Fluency metrics
    fluency_metrics JSONB,

    -- Metadata
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_speaking_sessions_student ON speaking_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_speaking_sessions_org ON speaking_sessions(organization_id);

-- ========================
-- 6. ROW LEVEL SECURITY for speaking_sessions
-- ========================

ALTER TABLE speaking_sessions ENABLE ROW LEVEL SECURITY;

-- Students: own sessions
CREATE POLICY "students_own_speaking_sessions" ON speaking_sessions
    FOR ALL USING (student_id = auth.uid());

-- Teachers: read org students' sessions
CREATE POLICY "teachers_read_org_speaking_sessions" ON speaking_sessions
    FOR SELECT USING (
        get_user_role() IN ('teacher', 'org_admin') AND
        student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
    );

-- Super admin: full access
CREATE POLICY "super_admin_all_speaking_sessions" ON speaking_sessions
    FOR ALL USING (get_user_role() = 'super_admin');

-- ========================
-- 7. RLS: allow teachers to UPDATE attempts (for listening review)
-- ========================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'attempts' AND policyname = 'teachers_update_attempts'
    ) THEN
        CREATE POLICY "teachers_update_attempts" ON attempts
            FOR UPDATE USING (
                get_user_role() = 'teacher' AND
                student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
            );
    END IF;
END $$;
