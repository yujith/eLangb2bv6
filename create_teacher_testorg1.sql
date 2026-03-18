-- ================================================================
-- Create Teacher for TestOrg1
-- Email: yujithteacher@gmail.com
-- Password: yujith@123
-- ================================================================

-- First, let's find TestOrg1's ID
-- You can run this query separately to see the org ID:
SELECT id, name FROM organizations WHERE name = 'TestOrg1' OR slug = 'testorg1';

-- Then create the teacher with the correct organization ID
-- Replace 'YOUR_ORG_UUID_HERE' with the actual UUID from the query above

-- Step 1: Create the user in Supabase Auth first
-- Go to Authentication → Users → Add User in Supabase Dashboard:
-- Email: yujithteacher@gmail.com
-- Password: yujith@123

-- Step 2: After creating the auth user, get their UUID and run this:
-- Replace 'YOUR_USER_UUID_HERE' with the actual user UUID from Auth

-- Step 3: Create the teacher profile
INSERT INTO profiles (
    id, 
    full_name, 
    email, 
    role, 
    organization_id, 
    status, 
    license_active,
    created_at,
    updated_at
) VALUES (
    'YOUR_USER_UUID_HERE',  -- Replace with actual user UUID from auth.users
    'Yujith Teacher',
    'yujithteacher@gmail.com',
    'teacher',
    (SELECT id FROM organizations WHERE name = 'TestOrg1' OR slug = 'testorg1' LIMIT 1),
    'active',
    true,
    NOW(),
    NOW()
) ON CONFLICT (id) DO UPDATE SET 
    role = 'teacher',
    organization_id = (SELECT id FROM organizations WHERE name = 'TestOrg1' OR slug = 'testorg1' LIMIT 1),
    status = 'active',
    license_active = true,
    updated_at = NOW();

-- Verification query to check the teacher was created
SELECT p.id, p.full_name, p.email, p.role, o.name as organization 
FROM profiles p 
JOIN organizations o ON p.organization_id = o.id 
WHERE p.email = 'yujithteacher@gmail.com';
