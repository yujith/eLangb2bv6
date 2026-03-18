import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    BookOpen, PenTool, Headphones, Mic, TrendingUp, Target, Award,
    BarChart3, ArrowRight, Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function StudentDashboard() {
    const { profile } = useAuth();
    const [stats, setStats] = useState({ overall: '—', best: '—', tests: 0, hours: '0' });
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchDashboard(); }, []);

    const fetchDashboard = async () => {
        try {
            const { data } = await supabase
                .from('attempts')
                .select('*')
                .eq('student_id', profile.id)
                .eq('status', 'completed')
                .order('completed_at', { ascending: false });
            const attempts = data || [];
            const bands = attempts.map(a => a.band || 0);
            const totalSec = attempts.reduce((s, a) => s + (a.duration_seconds || 0), 0);
            setStats({
                overall: bands.length > 0 ? (bands.reduce((a, b) => a + b, 0) / bands.length).toFixed(1) : '—',
                best: bands.length > 0 ? Math.max(...bands).toString() : '—',
                tests: attempts.length,
                hours: (totalSec / 3600).toFixed(1),
            });
            setRecent(attempts.slice(0, 5));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const modules = [
        {
            icon: BookOpen, label: 'Reading', to: '/student/reading', color: '#E30613',
            desc: 'Academic & General reading passages',
        },
        {
            icon: PenTool, label: 'Writing', to: '/student/writing', color: '#3B82F6',
            desc: 'Task 1 & Task 2 practice',
        },
        {
            icon: Headphones, label: 'Listening', to: '/student/listening', color: '#10B981',
            desc: 'Audio-based practice tests',
        },
        {
            icon: Mic, label: 'Speaking', to: '/student/speaking', color: '#F59E0B',
            desc: 'Record your responses',
        },
    ];

    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const modColors = { reading: '#E30613', writing: '#3B82F6', listening: '#10B981', speaking: '#F59E0B' };

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: 'var(--space-8)' }}>
                <h1 className="page-title">
                    Welcome back, {profile?.full_name?.split(' ')[0] || 'Student'} 👋
                </h1>
                <p className="page-subtitle">Your IELTS preparation dashboard. Start practicing to improve your band score.</p>
            </div>

            {/* Band Overview */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {[
                    { icon: Award, label: 'Overall Band', value: loading ? '...' : stats.overall, color: 'red' },
                    { icon: Target, label: 'Best Band', value: loading ? '...' : stats.best, color: 'green' },
                    { icon: BarChart3, label: 'Tests Taken', value: loading ? '...' : stats.tests, color: 'blue' },
                    { icon: Clock, label: 'Study Hours', value: loading ? '...' : stats.hours, color: 'cyan' },
                ].map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className={`stat-icon ${stat.color}`}><stat.icon size={22} /></div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* IELTS Modules */}
            <h3 style={{ marginBottom: 'var(--space-4)' }}>Practice Modules</h3>
            <div className="grid grid-2" style={{ marginBottom: 'var(--space-8)' }}>
                {modules.map((mod, i) => (
                    <Link to={mod.to} key={i} className="card" style={{
                        textDecoration: 'none',
                        borderLeft: `4px solid ${mod.color}`,
                    }}>
                        <div className="flex items-center gap-4">
                            <div style={{
                                width: 52, height: 52,
                                borderRadius: 'var(--radius-md)',
                                background: `${mod.color}10`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <mod.icon size={24} style={{ color: mod.color }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div className="font-semibold" style={{ fontSize: 'var(--text-lg)' }}>{mod.label}</div>
                                <div className="text-sm text-muted">{mod.desc}</div>
                            </div>
                            <ArrowRight size={18} style={{ color: 'var(--color-neutral-300)' }} />
                        </div>
                    </Link>
                ))}
            </div>

            {/* Progress Section */}
            <div className="grid grid-2">
                <div className="card">
                    <div className="card-header">
                        <h4 className="card-title">Band Progress</h4>
                        <Link to="/student/analytics" className="btn btn-ghost btn-sm">
                            View All <ArrowRight size={14} />
                        </Link>
                    </div>
                    {recent.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <TrendingUp size={48} />
                            <p className="text-sm text-muted">Take your first test to start tracking progress.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {['reading', 'writing', 'listening', 'speaking'].map(mod => {
                                const modAttempts = recent.filter(a => a.module === mod);
                                const avg = modAttempts.length > 0
                                    ? (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1) : '—';
                                const Icon = modIcons[mod];
                                return (
                                    <div key={mod} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-2) var(--space-3)',
                                        background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <div className="flex items-center gap-2">
                                            <Icon size={14} style={{ color: modColors[mod] }} />
                                            <span className="text-sm" style={{ textTransform: 'capitalize' }}>{mod}</span>
                                        </div>
                                        <span className="text-sm font-semibold">{avg}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="card-header">
                        <h4 className="card-title">Recent Attempts</h4>
                        <Link to="/student/history" className="btn btn-ghost btn-sm">
                            View All <ArrowRight size={14} />
                        </Link>
                    </div>
                    {recent.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <Clock size={48} />
                            <p className="text-sm text-muted">Your test attempts will appear here.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {recent.map(a => {
                                const Icon = modIcons[a.module] || BarChart3;
                                return (
                                    <div key={a.id} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-2) var(--space-3)',
                                        background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <div className="flex items-center gap-2">
                                            <Icon size={14} />
                                            <span className="text-xs" style={{ textTransform: 'capitalize' }}>{a.module}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-semibold">Band {a.band || '—'}</span>
                                            <span className="text-xs text-muted">
                                                {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : ''}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
