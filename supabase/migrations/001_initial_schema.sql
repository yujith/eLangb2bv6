-- ================================================================
-- eLanguage Center – Full Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

-- ========================
-- 1. ORGANIZATIONS
-- ========================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#E30613',
  secondary_color TEXT DEFAULT '#00BCD4',
  content_source_mode TEXT DEFAULT 'hybrid' CHECK (content_source_mode IN ('global_only', 'org_only', 'hybrid')),
  license_quota INTEGER DEFAULT 50,
  active_licenses INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 2. USER PROFILES
-- ========================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'org_admin', 'teacher', 'student')),
  full_name TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  license_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 3. LICENSES
-- ========================
CREATE TABLE IF NOT EXISTS licenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked'))
);

-- ========================
-- 4. GLOBAL CONTENT LIBRARY
-- ========================
CREATE TABLE IF NOT EXISTS global_content_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN (
    'reading_passage', 'listening_script', 'writing_prompt',
    'speaking_question_set', 'model_answer'
  )),
  module TEXT NOT NULL CHECK (module IN ('reading', 'listening', 'writing', 'speaking')),
  ielts_type TEXT DEFAULT 'both' CHECK (ielts_type IN ('academic', 'general', 'both')),
  difficulty TEXT DEFAULT 'band_6_7' CHECK (difficulty IN ('band_4_5', 'band_6_7', 'band_8_9')),
  title TEXT,
  body TEXT NOT NULL,
  topic_tags TEXT[] DEFAULT '{}',
  question_types TEXT[] DEFAULT '{}',
  created_by TEXT DEFAULT 'ai' CHECK (created_by IN ('ai', 'super_admin', 'curated')),
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  quality_score INTEGER,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  content_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast content matching
CREATE INDEX IF NOT EXISTS idx_content_match ON global_content_items(module, ielts_type, difficulty, status);
CREATE INDEX IF NOT EXISTS idx_content_hash ON global_content_items(content_hash);

-- ========================
-- 5. GLOBAL QUESTION SETS
-- ========================
CREATE TABLE IF NOT EXISTS global_question_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_item_id UUID REFERENCES global_content_items(id) ON DELETE CASCADE,
  questions JSONB NOT NULL DEFAULT '[]',
  answer_key JSONB NOT NULL DEFAULT '[]',
  explanations JSONB DEFAULT '[]',
  question_format TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 6. GLOBAL LISTENING AUDIO
-- ========================
CREATE TABLE IF NOT EXISTS global_listening_audio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_item_id UUID REFERENCES global_content_items(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  voice_id TEXT,
  speed NUMERIC DEFAULT 1.0,
  settings JSONB DEFAULT '{}',
  audio_hash TEXT UNIQUE NOT NULL,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_hash ON global_listening_audio(audio_hash);

-- ========================
-- 7. CONTENT USAGE LOG
-- ========================
CREATE TABLE IF NOT EXISTS content_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_item_id UUID REFERENCES global_content_items(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 8. ATTEMPTS
-- ========================
CREATE TABLE IF NOT EXISTS attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content_item_id UUID REFERENCES global_content_items(id) ON DELETE SET NULL,
  question_set_id UUID REFERENCES global_question_sets(id) ON DELETE SET NULL,
  module TEXT NOT NULL CHECK (module IN ('reading', 'listening', 'writing', 'speaking')),
  ielts_type TEXT DEFAULT 'academic',
  score NUMERIC,
  band NUMERIC,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id, module);

-- ========================
-- 9. ATTEMPT ANSWERS
-- ========================
CREATE TABLE IF NOT EXISTS attempt_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  question_index INTEGER,
  student_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 10. WRITING SUBMISSIONS
-- ========================
CREATE TABLE IF NOT EXISTS writing_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  prompt_content_id UUID REFERENCES global_content_items(id) ON DELETE SET NULL,
  essay_text TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  ai_feedback JSONB,
  ai_band_scores JSONB,
  teacher_override_band NUMERIC,
  teacher_comments TEXT,
  model_answer_shown BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'ai_graded', 'teacher_reviewed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 11. SPEAKING SUBMISSIONS
-- ========================
CREATE TABLE IF NOT EXISTS speaking_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  question_set_id UUID REFERENCES global_content_items(id) ON DELETE SET NULL,
  audio_url TEXT,
  duration_seconds INTEGER,
  teacher_bands JSONB,
  teacher_comments TEXT,
  overall_band NUMERIC,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 12. AI USAGE LOG (Cost Tracking)
-- ========================
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  module TEXT,
  action TEXT CHECK (action IN ('content_generation', 'writing_eval', 'tts_generation')),
  tokens_used INTEGER DEFAULT 0,
  cost_estimate NUMERIC DEFAULT 0,
  was_cache_hit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================
-- 13. ROW LEVEL SECURITY
-- ========================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_listening_audio ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaking_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to get current user's org
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- === ORGANIZATIONS ===
-- Super admin: full access
CREATE POLICY "super_admin_all_orgs" ON organizations
  FOR ALL USING (get_user_role() = 'super_admin');

-- Org admin: read own org
CREATE POLICY "org_admin_read_own_org" ON organizations
  FOR SELECT USING (id = get_user_org_id());

-- Org admin: update own org
CREATE POLICY "org_admin_update_own_org" ON organizations
  FOR UPDATE USING (id = get_user_org_id());

-- Others: read own org
CREATE POLICY "users_read_own_org" ON organizations
  FOR SELECT USING (id = get_user_org_id());

-- === PROFILES ===
-- Super admin: full access
CREATE POLICY "super_admin_all_profiles" ON profiles
  FOR ALL USING (get_user_role() = 'super_admin');

-- Users read own profile
CREATE POLICY "users_read_own_profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Org admin: manage own org users
CREATE POLICY "org_admin_manage_users" ON profiles
  FOR ALL USING (
    get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
  );

-- Teachers: read org students
CREATE POLICY "teachers_read_org_students" ON profiles
  FOR SELECT USING (
    get_user_role() = 'teacher' AND organization_id = get_user_org_id()
  );

-- === GLOBAL CONTENT ===
-- Anyone authenticated can read active content
CREATE POLICY "read_active_content" ON global_content_items
  FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'active');

-- Super admin: full access
CREATE POLICY "super_admin_all_content" ON global_content_items
  FOR ALL USING (get_user_role() = 'super_admin');

-- Service role can insert (for AI generation)
CREATE POLICY "insert_content" ON global_content_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Question sets - same as content items
CREATE POLICY "read_question_sets" ON global_question_sets
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_all_question_sets" ON global_question_sets
  FOR ALL USING (get_user_role() = 'super_admin');

CREATE POLICY "insert_question_sets" ON global_question_sets
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Audio - same as content items
CREATE POLICY "read_audio" ON global_listening_audio
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_all_audio" ON global_listening_audio
  FOR ALL USING (get_user_role() = 'super_admin');

CREATE POLICY "insert_audio" ON global_listening_audio
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- === ATTEMPTS (Student-private) ===
-- Students: own attempts
CREATE POLICY "students_own_attempts" ON attempts
  FOR ALL USING (student_id = auth.uid());

-- Teachers: read org students' attempts
CREATE POLICY "teachers_read_org_attempts" ON attempts
  FOR SELECT USING (
    get_user_role() IN ('teacher', 'org_admin') AND
    student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
  );

-- Super admin
CREATE POLICY "super_admin_all_attempts" ON attempts
  FOR ALL USING (get_user_role() = 'super_admin');

-- === ATTEMPT ANSWERS ===
CREATE POLICY "students_own_answers" ON attempt_answers
  FOR ALL USING (
    attempt_id IN (SELECT id FROM attempts WHERE student_id = auth.uid())
  );

CREATE POLICY "super_admin_all_answers" ON attempt_answers
  FOR ALL USING (get_user_role() = 'super_admin');

-- === WRITING SUBMISSIONS ===
CREATE POLICY "students_own_writing" ON writing_submissions
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "teachers_read_org_writing" ON writing_submissions
  FOR SELECT USING (
    get_user_role() IN ('teacher', 'org_admin') AND
    student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
  );

CREATE POLICY "teachers_update_writing" ON writing_submissions
  FOR UPDATE USING (
    get_user_role() = 'teacher' AND
    student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
  );

CREATE POLICY "super_admin_all_writing" ON writing_submissions
  FOR ALL USING (get_user_role() = 'super_admin');

-- === SPEAKING SUBMISSIONS ===
CREATE POLICY "students_own_speaking" ON speaking_submissions
  FOR ALL USING (student_id = auth.uid());

CREATE POLICY "teachers_read_org_speaking" ON speaking_submissions
  FOR SELECT USING (
    get_user_role() IN ('teacher', 'org_admin') AND
    student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
  );

CREATE POLICY "teachers_update_speaking" ON speaking_submissions
  FOR UPDATE USING (
    get_user_role() = 'teacher' AND
    student_id IN (SELECT id FROM profiles WHERE organization_id = get_user_org_id())
  );

CREATE POLICY "super_admin_all_speaking" ON speaking_submissions
  FOR ALL USING (get_user_role() = 'super_admin');

-- === LICENSES ===
CREATE POLICY "org_admin_manage_licenses" ON licenses
  FOR ALL USING (
    get_user_role() IN ('org_admin', 'super_admin') AND
    organization_id = get_user_org_id()
  );

CREATE POLICY "super_admin_all_licenses" ON licenses
  FOR ALL USING (get_user_role() = 'super_admin');

-- === CONTENT USAGE LOG ===
CREATE POLICY "insert_usage_log" ON content_usage_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_read_usage" ON content_usage_log
  FOR SELECT USING (get_user_role() = 'super_admin');

CREATE POLICY "org_admin_read_org_usage" ON content_usage_log
  FOR SELECT USING (
    get_user_role() = 'org_admin' AND organization_id = get_user_org_id()
  );

-- === AI USAGE LOG ===
CREATE POLICY "insert_ai_usage" ON ai_usage_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "super_admin_read_ai_usage" ON ai_usage_log
  FOR SELECT USING (get_user_role() = 'super_admin');

-- ========================
-- 14. TRIGGER: Auto-create profile on signup
-- ========================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _org_id UUID := NULL;
  _role TEXT := 'student';
  _full_name TEXT := '';
BEGIN
  BEGIN
    -- Only read metadata if it exists and is not empty
    IF NEW.raw_user_meta_data IS NOT NULL AND NEW.raw_user_meta_data::TEXT != '{}' THEN
      _role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
      _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
      
      IF NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'organization_id', '')), '') IS NOT NULL THEN
        _org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
      END IF;
    END IF;

    INSERT INTO profiles (id, full_name, email, role, organization_id, status, license_active)
    VALUES (
      NEW.id,
      _full_name,
      NEW.email,
      _role,
      _org_id,
      'active',
      CASE WHEN _role = 'student' THEN false ELSE true END
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Profile auto-creation skipped: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ========================
-- 15. STORAGE BUCKETS (run these separately if needed)
-- ========================
-- Create storage buckets for audio and branding
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio', 'audio', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false) ON CONFLICT DO NOTHING;

-- Storage policies
CREATE POLICY "public_branding_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

CREATE POLICY "org_admin_branding_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

CREATE POLICY "org_admin_branding_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

CREATE POLICY "auth_audio_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio' AND auth.uid() IS NOT NULL);

CREATE POLICY "auth_audio_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'audio' AND auth.uid() IS NOT NULL);

CREATE POLICY "student_recordings_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'recordings' AND auth.uid() IS NOT NULL);

CREATE POLICY "student_recordings_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'recordings' AND auth.uid() IS NOT NULL);
