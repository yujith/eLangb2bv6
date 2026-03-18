import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    GraduationCap, Users, BarChart3, TrendingUp, BookOpen, PenTool,
    Headphones, Mic, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function OrgAdminDashboard() {
    const { organization } = useAuth();
    const [stats, setStats] = useState({ students: 0, teachers: 0, avgBand: '—', testsTaken: 0 });
    const [moduleStats, setModuleStats] = useState([
        { icon: BookOpen, label: 'Reading', avg: '—', attempts: 0, color: 'red' },
        { icon: PenTool, label: 'Writing', avg: '—', attempts: 0, color: 'blue' },
        { icon: Headphones, label: 'Listening', avg: '—', attempts: 0, color: 'green' },
        { icon: Mic, label: 'Speaking', avg: '—', attempts: 0, color: 'cyan' },
    ]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchDashboardData(); }, []);

    const fetchDashboardData = async () => {
        try {
            const [
                { count: studentCount },
                { count: teacherCount },
                { data: attempts },
            ] = await Promise.all([
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active'),
                supabase.from('attempts').select('module, band, status').eq('status', 'completed'),
            ]);

            const completed = attempts || [];
            const totalBand = completed.reduce((s, a) => s + (a.band || 0), 0);
            const avgBand = completed.length > 0 ? (totalBand / completed.length).toFixed(1) : '—';

            setStats({
                students: studentCount || 0,
                teachers: teacherCount || 0,
                avgBand,
                testsTaken: completed.length,
            });

            // Per-module breakdown
            const modules = ['reading', 'writing', 'listening', 'speaking'];
            const icons = [BookOpen, PenTool, Headphones, Mic];
            const colors = ['red', 'blue', 'green', 'cyan'];

            setModuleStats(modules.map((mod, i) => {
                const modAttempts = completed.filter(a => a.module === mod);
                const modBand = modAttempts.length > 0
                    ? (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1)
                    : '—';
                return {
                    icon: icons[i], label: mod.charAt(0).toUpperCase() + mod.slice(1),
                    avg: modBand, attempts: modAttempts.length, color: colors[i],
                };
            }));
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">
                {organization?.name || 'Organization'} Dashboard
            </h1>
            <p className="page-subtitle">Overview of your organization's IELTS performance.</p>

            {/* Stats */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {[
                    { icon: GraduationCap, label: 'Students', value: loading ? '...' : stats.students, color: 'red' },
                    { icon: Users, label: 'Teachers', value: loading ? '...' : stats.teachers, color: 'blue' },
                    { icon: BarChart3, label: 'Avg Band', value: loading ? '...' : stats.avgBand, color: 'green' },
                    { icon: TrendingUp, label: 'Tests Taken', value: loading ? '...' : stats.testsTaken, color: 'cyan' },
                ].map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className={`stat-icon ${stat.color}`}><stat.icon size={22} /></div>
                        <div className="stat-value">{stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Module Breakdown */}
            <div className="card" style={{ marginBottom: 'var(--space-8)' }}>
                <div className="card-header">
                    <h3 className="card-title">Module Performance</h3>
                    <Link to="/org-admin/reports" className="btn btn-ghost btn-sm">
                        Full Report <ArrowRight size={14} />
                    </Link>
                </div>
                <div className="grid grid-4">
                    {moduleStats.map((mod, i) => (
                        <div key={i} style={{
                            padding: 'var(--space-4)',
                            background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)',
                            textAlign: 'center',
                        }}>
                            <div className={`stat-icon ${mod.color}`} style={{ margin: '0 auto var(--space-3)' }}>
                                <mod.icon size={20} />
                            </div>
                            <div className="font-semibold">{mod.label}</div>
                            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 'var(--space-2) 0' }}>
                                {mod.avg}
                            </div>
                            <div className="text-xs text-muted">{mod.attempts} attempts</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-3">
                <Link to="/org-admin/users" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon blue"><Users size={20} /></div>
                        <div>
                            <div className="font-semibold">Manage Users</div>
                            <div className="text-sm text-muted">Add teachers and students</div>
                        </div>
                    </div>
                </Link>
                <Link to="/org-admin/reports" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon green"><BarChart3 size={20} /></div>
                        <div>
                            <div className="font-semibold">View Reports</div>
                            <div className="text-sm text-muted">Student performance data</div>
                        </div>
                    </div>
                </Link>
                <Link to="/org-admin/branding" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon red"><BookOpen size={20} /></div>
                        <div>
                            <div className="font-semibold">Branding</div>
                            <div className="text-sm text-muted">Customize your portal look</div>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
