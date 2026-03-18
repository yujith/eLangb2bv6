-- ================================================================
-- eLanguage Center – Seed Super Admin User
-- Run this AFTER the migration AND after creating the user in Supabase Auth
-- ================================================================
-- 
-- INSTRUCTIONS:
-- 1. First, run 001_initial_schema.sql in the Supabase SQL Editor
-- 2. Go to Authentication → Users → Add User
--    Email: yujith@gmail.com
--    Password: yujith@123
-- 3. Copy the user's UUID from the Auth dashboard
-- 4. Replace 'YOUR_USER_UUID_HERE' below with the actual UUID
-- 5. Run this SQL in the SQL Editor
-- ================================================================

-- Update the profile to super_admin
-- (The trigger should have auto-created it, but we need to set the role)
UPDATE profiles 
SET role = 'super_admin', 
    full_name = 'Yujith Perera',
    status = 'active',
    license_active = true
WHERE email = 'yujith@gmail.com';

-- If the profile doesn't exist yet (fallback)
-- INSERT INTO profiles (id, full_name, email, role, status, license_active)
-- VALUES ('YOUR_USER_UUID_HERE', 'Yujith Perera', 'yujith@gmail.com', 'super_admin', 'active', true)
-- ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
