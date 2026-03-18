/**
 * Admin User Management Helpers
 * Handles creating users without logging out the current admin.
 */

import { supabase } from './supabase';

/**
 * Create a new user account and profile without disrupting the current session.
 * 
 * Strategy: We use a second Supabase client instance to perform the signUp,
 * so the main client's session remains untouched.
 */
export async function createUserAccount({ email, password, fullName, role, organizationId }) {
    const { createClient } = await import('@supabase/supabase-js');

    // Create a separate client instance for user creation
    const adminClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
        }
    );

    // Sign up the new user with the isolated client
    const { data, error: signUpError } = await adminClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                role: role,
                organization_id: organizationId,
            },
        },
    });

    if (signUpError) throw signUpError;

    if (!data.user) throw new Error('User creation failed — no user returned.');

    // The trigger should create the profile automatically,
    // but let's upsert to be safe (handles edge cases like trigger failures)
    const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        email: email,
        role: role,
        organization_id: organizationId,
        status: 'active',
        license_active: role !== 'student', // Students need license assignment
    });

    if (profileError) {
        console.warn('Profile upsert (may already exist via trigger):', profileError.message);
    }

    return { user: data.user };
}
