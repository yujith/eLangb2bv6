import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart3, Building2, Users, GraduationCap, Award, TrendingUp, BookOpen, PenTool, Headphones, Mic } from 'lucide-react';

export default function Analytics() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchAnalytics(); }, []);

    const fetchAnalytics = async () => {
        try {
            const [
                { count: orgCount },
                { count: studentCount },
                { count: teacherCount },
                { data: attempts },
                { data: recentProfiles },
            ] = await Promise.all([
                supabase.from('organizations').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
                supabase.from('attempts').select('module, band, status, completed_at').eq('status', 'completed'),
                supabase.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false }).limit(10),
            ]);

            const completed = attempts || [];
            const avgBand = completed.length > 0
                ? (completed.reduce((s, a) => s + (a.band || 0), 0) / completed.length).toFixed(1) : '—';

            const modules = ['reading', 'writing', 'listening', 'speaking'];
            const moduleBreakdown = modules.map(mod => {
                const modAttempts = completed.filter(a => a.module === mod);
                const avg = modAttempts.length > 0
                    ? (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1) : '—';
                return { mod, count: modAttempts.length, avg };
            });

            // Monthly trend (last 6 months)
            const months = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const label = d.toLocaleDateString('en-US', { month: 'short' });
                const count = completed.filter(a => a.completed_at?.startsWith(key)).length;
                months.push({ label, count });
            }

            setData({
                orgCount: orgCount || 0, studentCount: studentCount || 0, teacherCount: teacherCount || 0,
                totalTests: completed.length, avgBand, moduleBreakdown, months,
                recentUsers: recentProfiles || [],
            });
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const modColors = { reading: 'red', writing: 'blue', listening: 'green', speaking: 'cyan' };

    if (loading) {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Platform Analytics</h1>
            <p className="page-subtitle">Global metrics across all organizations.</p>

            {/* Top Stats */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {[
                    { icon: Building2, label: 'Organizations', value: data.orgCount, color: 'red' },
                    { icon: GraduationCap, label: 'Students', value: data.studentCount, color: 'blue' },
                    { icon: Users, label: 'Teachers', value: data.teacherCount, color: 'green' },
                    { icon: Award, label: 'Avg Band', value: data.avgBand, color: 'cyan' },
                ].map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className={`stat-icon ${stat.color}`}><stat.icon size={22} /></div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
                {/* Module Performance */}
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Module Performance</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {data.moduleBreakdown.map(({ mod, count, avg }) => {
                            const Icon = modIcons[mod];
                            return (
                                <div key={mod} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    <div className="flex items-center gap-3">
                                        <div className={`stat-icon ${modColors[mod]}`} style={{ width: 32, height: 32 }}>
                                            <Icon size={16} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium" style={{ textTransform: 'capitalize' }}>{mod}</span>
                                            <div className="text-xs text-muted">{count} attempts</div>
                                        </div>
                                    </div>
                                    <span className="text-lg font-semibold">Band {avg}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Monthly Activity */}
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Monthly Activity (Tests)</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', height: '160px' }}>
                        {data.months.map((m, i) => {
                            const max = Math.max(...data.months.map(x => x.count), 1);
                            const h = Math.max((m.count / max) * 140, 4);
                            return (
                                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <span className="text-xs font-semibold">{m.count}</span>
                                    <div style={{
                                        width: '100%', height: h, background: 'var(--color-primary, #E30613)',
                                        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', opacity: 0.8,
                                    }} />
                                    <span className="text-xs text-muted">{m.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Recent Users */}
            <div className="card">
                <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Recent Registrations</h4>
                {data.recentUsers.length === 0 ? (
                    <p className="text-sm text-muted">No recent registrations.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {data.recentUsers.map(u => (
                            <div key={u.id} className="flex justify-between items-center" style={{
                                padding: 'var(--space-2) var(--space-3)',
                                background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)',
                            }}>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium">{u.full_name}</span>
                                    <span className="badge badge-neutral">{u.role?.replace('_', ' ')}</span>
                                </div>
                                <span className="text-xs text-muted">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
