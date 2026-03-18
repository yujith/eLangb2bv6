import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { signIn } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error: signInError, profile } = await signIn(email, password);

            if (signInError) {
                setError(signInError.message);
                setLoading(false);
                return;
            }

            if (!profile) {
                setError('Account not found. Please contact your administrator.');
                setLoading(false);
                return;
            }

            if (profile.status === 'inactive') {
                setError('Your account has been deactivated. Please contact your administrator.');
                setLoading(false);
                return;
            }

            // Check license for students
            if (profile.role === 'student' && !profile.license_active) {
                setError('No active license found. Please contact your organization administrator.');
                setLoading(false);
                return;
            }

            // Navigate based on role
            const dashboardPaths = {
                super_admin: '/super-admin',
                org_admin: '/org-admin',
                teacher: '/teacher',
                student: '/student',
            };

            navigate(dashboardPaths[profile.role] || '/');
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-hero">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', position: 'relative', zIndex: 1 }}>
                    <img 
                        src="/Logo-02.svg" 
                        alt="eLanguage Center Logo" 
                        style={{
                            width: 500,
                            height: 500,
                            objectFit: 'contain'
                        }}
                    />
                </div>
                <p>All accessed IELTS platform for institutions worldwide</p>

                <div style={{
                    marginTop: '64px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '32px',
                    position: 'relative',
                    zIndex: 1,
                    textAlign: 'center'
                }}>
                    {[
                        { value: '4', label: 'IELTS Modules' },
                        { value: 'AI', label: 'Powered Grading' },
                        { value: '∞', label: 'Practice Tests' },
                    ].map((stat, i) => (
                        <div key={i}>
                            <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--color-primary)' }}>
                                {stat.value}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="login-form-section">
                <div className="login-form-wrapper animate-slide-up">
                    <div style={{ marginBottom: '32px' }}>
                        <h2>Welcome back</h2>
                        <p className="subtitle">Sign in to your account to continue</p>
                    </div>

                    {error && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 16px',
                            background: 'var(--color-error-light)',
                            color: 'var(--color-error)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-sm)',
                            marginBottom: '24px',
                        }}>
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    <form className="login-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Email address</label>
                            <input
                                type="email"
                                className="form-input"
                                placeholder="you@organization.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="form-input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    style={{ paddingRight: '44px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--color-neutral-400)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            disabled={loading}
                            style={{ width: '100%', marginTop: '8px' }}
                        >
                            {loading ? (
                                <>
                                    <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }}></div>
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <div style={{
                        marginTop: '32px',
                        paddingTop: '24px',
                        borderTop: '1px solid var(--color-neutral-200)',
                        textAlign: 'center'
                    }}>
                        <p style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--color-neutral-500)',
                            marginBottom: '16px'
                        }}>
                            Don't have an account? Contact your organization admin.
                        </p>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            gap: '24px',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-neutral-400)'
                        }}>
                            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a>
                            <span>•</span>
                            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Terms of Service</a>
                            <span>•</span>
                            <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Support</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
