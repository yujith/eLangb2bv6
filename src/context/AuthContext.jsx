import { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [organization, setOrganization] = useState(null);

    const memoizedOrganization = useMemo(() => organization, [organization]);
    const [loading, setLoading] = useState(true);
    const initCalledRef = useRef(false);

    const fetchProfile = async (userId) => {
        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*, organizations(*)')
                .eq('id', userId)
                .single();

            if (profileError) {
                console.error('Profile fetch error:', profileError);
                // Don't throw error, just return null
                return null;
            }

            setProfile(profileData);
            setOrganization(profileData.organizations || null);
            return profileData;
        } catch (err) {
            console.error('Error fetching profile:', err);
            return null;
        }
    };

    useEffect(() => {
        // Guard against double-init in React StrictMode / HMR
        if (initCalledRef.current) return;
        initCalledRef.current = true;

        // Step 1: Use getSession() for the initial load.
        // setLoading(false) is in finally so it ALWAYS fires.
        let didFinish = false;
        const initAuth = async () => {
            try {
                console.log('[Auth] Starting session check...');
                const result = await supabase.auth.getSession();
                const session = result?.data?.session ?? null;
                const error = result?.error;
                if (error) {
                    console.warn('[Auth] getSession error:', error.message || error);
                }
                console.log('[Auth] Session:', session ? 'found' : 'none');
                setUser(session?.user ?? null);
                if (session?.user) {
                    await fetchProfile(session.user.id);
                }
            } catch (err) {
                console.error('[Auth] Auth init error:', err);
                setUser(null);
                setProfile(null);
                setOrganization(null);
            } finally {
                didFinish = true;
                console.log('[Auth] Init complete, showing app');
                setLoading(false);
            }
        };

        initAuth();

        // Safety timeout: if auth init hangs for >5s, force-show the app
        const safetyTimer = setTimeout(() => {
            if (!didFinish) {
                console.warn('[Auth] Safety timeout reached – forcing loading=false');
                setUser(null);
                setProfile(null);
                setOrganization(null);
                setLoading(false);
            }
        }, 5000);

        // Step 2: Only handle sign-out and token refresh.
        // INITIAL_SESSION is handled by getSession() above.
        // SIGNED_IN is handled explicitly in signIn().
        // Handling SIGNED_IN here causes a re-render cascade → perpetual refresh.
        let subscription = null;
        try {
            const authListener = supabase.auth.onAuthStateChange(
                async (event, session) => {
                    if (event === 'SIGNED_OUT') {
                        setUser(null);
                        setProfile(null);
                        setOrganization(null);
                    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                        setUser(session.user);
                    }
                }
            );
            subscription = authListener?.data?.subscription;
        } catch (err) {
            console.error('[Auth] onAuthStateChange setup error:', err);
        }

        return () => {
            clearTimeout(safetyTimer);
            subscription?.unsubscribe();
        };
    }, []);

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (!error && data?.user) {
            setUser(data.user);
            const profileData = await fetchProfile(data.user.id);
            return { data, error, profile: profileData };
        }
        return { data, error, profile: null };
    };

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('Sign out error:', err);
        } finally {
            setUser(null);
            setProfile(null);
            setOrganization(null);
        }
    };

    const value = {
        user,
        profile,
        organization: memoizedOrganization,
        loading,
        signIn,
        signOut,
        isAuthenticated: !!user,
        role: profile?.role || null,
        isSuperAdmin: profile?.role === 'super_admin',
        isOrgAdmin: profile?.role === 'org_admin',
        isTeacher: profile?.role === 'teacher',
        isStudent: profile?.role === 'student',
        orgType: organization?.org_type || 'educational',
        isPremium: organization?.is_premium === true,
        hasTeachers: (organization?.org_type || 'educational') !== 'corporate',
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
