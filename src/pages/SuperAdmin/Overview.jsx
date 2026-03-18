import { useState, useEffect } from 'react';
import {
    Building2, Users, GraduationCap, BarChart3, DollarSign, Activity,
    TrendingUp, TrendingDown, Library, Zap, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export default function SuperAdminOverview() {
    const [stats, setStats] = useState({
        orgs: 0, students: 0, teachers: 0, content: 0,
        aiCalls: 0, reuseRate: 0, costSaved: 0, ttsCount: 0,
    });
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const [
                { count: orgCount },
                { count: studentCount },
                { count: teacherCount },
                { count: contentCount },
                { data: aiLogs },
            ] = await Promise.all([
                supabase.from('organizations').select('*', { count: 'exact', head: true }),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active'),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher').eq('status', 'active'),
                supabase.from('global_content_items').select('*', { count: 'exact', head: true }).eq('status', 'active'),
                supabase.from('ai_usage_log').select('tokens_used, cost_estimate, was_cache_hit, action'),
            ]);

            const totalCalls = aiLogs?.length || 0;
            const cacheHits = aiLogs?.filter(l => l.was_cache_hit).length || 0;
            const reuseRate = totalCalls > 0 ? Math.round((cacheHits / totalCalls) * 100) : 0;
            const totalCost = aiLogs?.reduce((sum, l) => sum + (l.cost_estimate || 0), 0) || 0;
            const ttsCount = aiLogs?.filter(l => l.action === 'tts_generation' && !l.was_cache_hit).length || 0;

            setStats({
                orgs: orgCount || 0,
                students: studentCount || 0,
                teachers: teacherCount || 0,
                content: contentCount || 0,
                aiCalls: totalCalls,
                reuseRate,
                costSaved: totalCost,
                ttsCount,
            });
        } catch (err) {
            console.error('Error fetching stats:', err);
        } finally {
            setLoadingStats(false);
        }
    };

    const statCards = [
        { icon: Building2, label: 'Organizations', value: stats.orgs, color: 'red' },
        { icon: GraduationCap, label: 'Active Students', value: stats.students, color: 'blue' },
        { icon: Users, label: 'Active Teachers', value: stats.teachers, color: 'cyan' },
        { icon: Library, label: 'Content Items', value: stats.content, color: 'green' },
    ];

    const costCards = [
        { icon: Zap, label: 'AI Calls', value: stats.aiCalls.toString(), color: 'yellow' },
        { icon: Activity, label: 'Reuse Hit Rate', value: `${stats.reuseRate}%`, color: 'green' },
        { icon: DollarSign, label: 'Est. Total Cost', value: `$${stats.costSaved.toFixed(2)}`, color: 'cyan' },
        { icon: BarChart3, label: 'TTS Generations', value: stats.ttsCount.toString(), color: 'red' },
    ];

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Platform Overview</h1>
            <p className="page-subtitle">Monitor your entire IELTS platform from here.</p>

            {/* Platform Stats */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {statCards.map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className={`stat-icon ${stat.color}`}>
                            <stat.icon size={22} />
                        </div>
                        <div className="stat-value">{loadingStats ? '...' : stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* AI Cost Optimization */}
            <div className="card" style={{ marginBottom: 'var(--space-8)' }}>
                <div className="card-header">
                    <h3 className="card-title">AI Cost Optimization</h3>
                    <Link to="/super-admin/cost-monitor" className="btn btn-ghost btn-sm">
                        View Details <ArrowRight size={14} />
                    </Link>
                </div>
                <div className="grid grid-4">
                    {costCards.map((stat, i) => (
                        <div key={i} style={{
                            padding: 'var(--space-4)',
                            background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)',
                        }}>
                            <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                                <div className={`stat-icon ${stat.color}`} style={{ width: 32, height: 32 }}>
                                    <stat.icon size={16} />
                                </div>
                                <span className="text-sm text-muted">{stat.label}</span>
                            </div>
                            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{stat.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-3">
                <Link to="/super-admin/organizations" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon red"><Building2 size={20} /></div>
                        <div>
                            <div className="font-semibold">Manage Organizations</div>
                            <div className="text-sm text-muted">Add, edit, or remove organizations</div>
                        </div>
                    </div>
                </Link>

                <Link to="/super-admin/content-library" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon green"><Library size={20} /></div>
                        <div>
                            <div className="font-semibold">Content Library</div>
                            <div className="text-sm text-muted">View and manage global content</div>
                        </div>
                    </div>
                </Link>

                <Link to="/super-admin/billing" className="card" style={{ textDecoration: 'none' }}>
                    <div className="flex items-center gap-3">
                        <div className="stat-icon blue"><DollarSign size={20} /></div>
                        <div>
                            <div className="font-semibold">Billing & Revenue</div>
                            <div className="text-sm text-muted">Pricing, licenses, and revenue</div>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    );
}
