-- ================================================================
-- Create Teacher for TestOrg1 - Simplified Approach
-- Email: yujithteacher@gmail.com
-- Password: yujith@123
-- ================================================================

-- Step 1: First, let's check if TestOrg1 exists and get its ID
SELECT '=== TestOrg1 Information ===' as info;
SELECT id, name, slug FROM organizations WHERE name = 'TestOrg1' OR slug = 'testorg1';

-- Step 2: Check if the user exists in auth.users
SELECT '=== Auth User Check ===' as info;
SELECT id, email, created_at FROM auth.users WHERE email = 'yujithteacher@gmail.com';

-- Step 3: If no user exists, you need to create it first:
-- Go to Authentication → Users → Add User in Supabase Dashboard
-- Email: yujithteacher@gmail.com
-- Password: yujith@123

-- Step 4: After creating the user, get the UUID and run this:
-- Replace 'ACTUAL_USER_UUID_HERE' with the real UUID from Step 2

-- Create the teacher profile (only run after user exists in auth.users)
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
) 
SELECT 
    u.id,  -- Use the actual UUID from auth.users
    'Yujith Teacher',
    u.email,
    'teacher',
    o.id,
    'active',
    true,
    NOW(),
    NOW()
FROM auth.users u, organizations o 
WHERE u.email = 'yujithteacher@gmail.com' 
AND (o.name = 'TestOrg1' OR o.slug = 'testorg1')
LIMIT 1

ON CONFLICT (id) DO UPDATE SET 
    role = 'teacher',
    organization_id = (SELECT id FROM organizations WHERE name = 'TestOrg1' OR slug = 'testorg1' LIMIT 1),
    status = 'active',
    license_active = true,
    updated_at = NOW();

-- Step 5: Verify the teacher was created
SELECT '=== Verification ===' as info;
SELECT p.id, p.full_name, p.email, p.role, p.status, p.license_active, o.name as organization 
FROM profiles p 
JOIN organizations o ON p.organization_id = o.id 
WHERE p.email = 'yujithteacher@gmail.com';
