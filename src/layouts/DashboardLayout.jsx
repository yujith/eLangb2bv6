import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hexToRgb, darkenColor } from '../lib/colorUtils';
import {
    LayoutDashboard, Building2, Users, BookOpen, FileText, Headphones,
    Mic, PenTool, BarChart3, CreditCard, Settings, LogOut, ChevronLeft,
    Menu, Shield, Library, Activity, GraduationCap, ClipboardList, UserCheck,
    DollarSign, TrendingUp
} from 'lucide-react';

const navConfig = {
    super_admin: {
        label: 'Super Admin',
        sections: [
            {
                label: 'Overview',
                items: [
                    { to: '/super-admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
                    { to: '/super-admin/organizations', icon: Building2, label: 'Organizations' },
                ],
            },
            {
                label: 'Content',
                items: [
                    { to: '/super-admin/content-library', icon: Library, label: 'Content Library' },
                ],
            },
            {
                label: 'Platform',
                items: [
                    { to: '/super-admin/cost-monitor', icon: DollarSign, label: 'Cost Monitor' },
                    { to: '/super-admin/analytics', icon: BarChart3, label: 'Analytics' },
                    { to: '/super-admin/billing', icon: CreditCard, label: 'Billing' },
                ],
            },
        ],
    },
    org_admin: {
        label: 'Admin',
        sections: [
            {
                label: 'Overview',
                items: [
                    { to: '/org-admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
                    { to: '/org-admin/users', icon: Users, label: 'Users' },
                ],
            },
            {
                label: 'Management',
                items: [
                    { to: '/org-admin/students', icon: GraduationCap, label: 'Students' },
                    { to: '/org-admin/teachers', icon: UserCheck, label: 'Teachers', teacherOnly: true },
                    { to: '/org-admin/reports', icon: BarChart3, label: 'Reports' },
                ],
            },
            {
                label: 'Finance',
                items: [
                    { to: '/org-admin/billing', icon: CreditCard, label: 'Billing & Payments' },
                ],
            },
            {
                label: 'Settings',
                items: [
                    { to: '/org-admin/branding', icon: Settings, label: 'Branding' },
                    { to: '/org-admin/listening-settings', icon: Headphones, label: 'Listening Realism' },
                ],
            },
        ],
    },
    teacher: {
        label: 'Teacher',
        sections: [
            {
                label: 'Overview',
                items: [
                    { to: '/teacher', icon: LayoutDashboard, label: 'Dashboard', end: true },
                ],
            },
            {
                label: 'Grading',
                items: [
                    { to: '/teacher/writing-review', icon: PenTool, label: 'Writing Review' },
                    { to: '/teacher/speaking-review', icon: Mic, label: 'Speaking Review' },
                    { to: '/teacher/listening-review', icon: Headphones, label: 'Listening Review' },
                ],
            },
            {
                label: 'Tracking',
                items: [
                    { to: '/teacher/students', icon: GraduationCap, label: 'Student Progress' },
                ],
            },
        ],
    },
    student: {
        label: 'Student',
        sections: [
            {
                label: 'Overview',
                items: [
                    { to: '/student', icon: LayoutDashboard, label: 'Dashboard', end: true },
                ],
            },
            {
                label: 'Practice',
                items: [
                    { to: '/student/reading', icon: BookOpen, label: 'Reading' },
                    { to: '/student/writing', icon: PenTool, label: 'Writing' },
                    { to: '/student/listening', icon: Headphones, label: 'Listening' },
                    { to: '/student/speaking', icon: Mic, label: 'Speaking' },
                    { to: '/student/speaking-test', icon: Mic, label: 'Speaking Test', premium: true },
                    { to: '/student/speaking-test-beta', icon: Mic, label: 'Speaking Test (Beta)', premium: true },
                ],
            },
            {
                label: 'Progress',
                items: [
                    { to: '/student/history', icon: ClipboardList, label: 'Attempt History' },
                    { to: '/student/analytics', icon: TrendingUp, label: 'My Progress' },
                ],
            },
        ],
    },
};

export default function DashboardLayout() {
    const { profile, organization, signOut, role, hasTeachers, isPremium } = useAuth();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const navigate = useNavigate();

    const rawNav = navConfig[role] || navConfig.student;

    // Filter out teacher-related items for orgs without teacher functionality
    // Filter out premium items for non-premium orgs
    const nav = {
        ...rawNav,
        sections: rawNav.sections.map(section => ({
            ...section,
            items: section.items.filter(item => {
                if (!hasTeachers && item.teacherOnly) return false;
                if (!isPremium && item.premium) return false;
                return true;
            }),
        })).filter(section => section.items.length > 0),
    };

    // Apply organization branding on load
    useEffect(() => {
        // Reset to defaults first
        document.documentElement.style.setProperty('--org-primary', '#E30613');
        document.documentElement.style.setProperty('--org-primary-hover', '#C00510');
        document.documentElement.style.setProperty('--org-primary-light', 'rgba(227, 6, 19, 0.08)');
        document.documentElement.style.setProperty('--org-primary-glow', 'rgba(227, 6, 19, 0.25)');
        document.documentElement.style.setProperty('--org-secondary', '#00BCD4');
        document.documentElement.style.setProperty('--org-secondary-light', 'rgba(0, 188, 212, 0.1)');

        // Then apply org-specific branding
        if (organization?.primary_color) {
            document.documentElement.style.setProperty('--org-primary', organization.primary_color);
            const rgb = hexToRgb(organization.primary_color);
            if (rgb) {
                document.documentElement.style.setProperty('--org-primary-hover', darkenColor(organization.primary_color, 0.1));
                document.documentElement.style.setProperty('--org-primary-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
                document.documentElement.style.setProperty('--org-primary-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
            }
        }
        if (organization?.secondary_color) {
            document.documentElement.style.setProperty('--org-secondary', organization.secondary_color);
            const rgbSecondary = hexToRgb(organization.secondary_color);
            if (rgbSecondary) {
                document.documentElement.style.setProperty('--org-secondary-light', `rgba(${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}, 0.1)`);
            }
        }
    }, [organization]);

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (err) {
            console.error('Sign out error:', err);
        }
        navigate('/login');
    };

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    // Dynamic branding from organization
    const sidebarLogoBg = organization?.sidebar_bg_color || '#1E293B';

    return (
        <div className="app-layout">
            {/* Mobile overlay */}
            {mobileSidebarOpen && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        zIndex: 99,
                    }}
                    className="mobile-overlay"
                    onClick={() => setMobileSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}
                style={{
                    width: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
                }}
            >
                <div className="sidebar-logo" style={{ background: sidebarLogoBg }}>
                    <div style={{
                        width: 34, height: 34,
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}>
                        {organization?.logo_url || role === 'super_admin' ? (
                            <img src={organization?.logo_url || '/Logo-02.png'} alt="Logo" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                            <BookOpen size={18} color="white" />
                        )}
                    </div>
                    {!sidebarCollapsed && (
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                            {organization?.name || 'eLanguage Center'}
                        </span>
                    )}
                </div>

                <nav className="sidebar-nav">
                    {nav.sections.map((section, si) => (
                        <div key={si}>
                            {!sidebarCollapsed && (
                                <div className="sidebar-section-label">{section.label}</div>
                            )}
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                                    onClick={() => setMobileSidebarOpen(false)}
                                >
                                    <item.icon size={20} />
                                    {!sidebarCollapsed && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {item.label}
                                            {item.premium && (
                                                <span style={{
                                                    fontSize: '9px', fontWeight: 700, padding: '1px 4px',
                                                    borderRadius: 3, background: '#F59E0B', color: '#fff',
                                                    lineHeight: 1.2,
                                                }}>PRO</span>
                                            )}
                                        </span>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button
                        className="sidebar-link"
                        onClick={handleSignOut}
                        style={{ width: '100%' }}
                    >
                        <LogOut size={20} />
                        {!sidebarCollapsed && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div
                className="main-content"
                style={{
                    marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
                }}
            >
                <header className="top-header">
                    <div className="flex items-center gap-4">
                        <button
                            className="btn btn-icon btn-ghost btn-sm"
                            onClick={() => {
                                if (window.innerWidth < 768) {
                                    setMobileSidebarOpen(!mobileSidebarOpen);
                                } else {
                                    setSidebarCollapsed(!sidebarCollapsed);
                                }
                            }}
                        >
                            {sidebarCollapsed ? <Menu size={20} /> : <ChevronLeft size={20} />}
                        </button>
                        <div>
                            <span className="text-sm font-medium" style={{ color: 'var(--color-neutral-500)' }}>
                                {nav.label} Portal
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {role === 'super_admin' && (
                            <span className="badge badge-primary">
                                <Shield size={12} />
                                Super Admin
                            </span>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="avatar">
                                {getInitials(profile?.full_name)}
                            </div>
                            {profile && (
                                <div style={{ lineHeight: 1.3 }}>
                                    <div className="text-sm font-medium">{profile.full_name}</div>
                                    <div className="text-xs text-muted">{profile.email}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="page-content animate-fade-in">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
