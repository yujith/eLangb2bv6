import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { TrendingUp, Award, BarChart3, Target, BookOpen, PenTool, Headphones, Mic, Clock } from 'lucide-react';

export default function StudentAnalytics() {
    const { profile } = useAuth();
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchAttempts(); }, []);

    const fetchAttempts = async () => {
        try {
            const { data, error } = await supabase
                .from('attempts')
                .select('*')
                .eq('student_id', profile.id)
                .eq('status', 'completed')
                .order('completed_at', { ascending: true });
            if (error) throw error;
            setAttempts(data || []);
        } catch (err) {
            console.error('Error fetching analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
            </div>
        );
    }

    if (attempts.length === 0) {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">My Progress</h1>
                <p className="page-subtitle">Track your band score improvement and identify areas for growth.</p>
                <div className="empty-state">
                    <TrendingUp size={64} />
                    <h3>No data yet</h3>
                    <p>Complete tests to see your progress charts and weakness analysis.</p>
                </div>
            </div>
        );
    }

    const overallAvg = (attempts.reduce((s, a) => s + (a.band || 0), 0) / attempts.length).toFixed(1);
    const bestBand = Math.max(...attempts.map(a => a.band || 0));
    const totalTime = attempts.reduce((s, a) => s + (a.duration_seconds || 0), 0);
    const studyHours = (totalTime / 3600).toFixed(1);

    const modules = ['reading', 'writing', 'listening', 'speaking'];
    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const modColors = { reading: 'red', writing: 'blue', listening: 'green', speaking: 'cyan' };

    const moduleData = modules.map(mod => {
        const modAttempts = attempts.filter(a => a.module === mod);
        const avg = modAttempts.length > 0
            ? (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1) : '—';
        const best = modAttempts.length > 0 ? Math.max(...modAttempts.map(a => a.band || 0)) : 0;
        return { mod, count: modAttempts.length, avg, best };
    });

    // Find weakest module
    const scoredModules = moduleData.filter(m => m.count > 0);
    const weakest = scoredModules.length > 0
        ? scoredModules.reduce((w, m) => (parseFloat(m.avg) < parseFloat(w.avg) ? m : w))
        : null;
    const strongest = scoredModules.length > 0
        ? scoredModules.reduce((s, m) => (parseFloat(m.avg) > parseFloat(s.avg) ? m : s))
        : null;

    // Recent trend (last 5 vs previous 5)
    const recent5 = attempts.slice(-5);
    const prev5 = attempts.slice(-10, -5);
    const recentAvg = recent5.length > 0 ? recent5.reduce((s, a) => s + (a.band || 0), 0) / recent5.length : 0;
    const prevAvg = prev5.length > 0 ? prev5.reduce((s, a) => s + (a.band || 0), 0) / prev5.length : 0;
    const trend = prev5.length > 0 ? (recentAvg - prevAvg).toFixed(1) : null;

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">My Progress</h1>
            <p className="page-subtitle">Track your band score improvement and identify areas for growth.</p>

            {/* Overall Stats */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                <div className="stat-card">
                    <div className="stat-icon red"><Award size={22} /></div>
                    <div className="stat-value">{overallAvg}</div>
                    <div className="stat-label">Overall Band</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><Target size={22} /></div>
                    <div className="stat-value">{bestBand}</div>
                    <div className="stat-label">Best Band</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue"><BarChart3 size={22} /></div>
                    <div className="stat-value">{attempts.length}</div>
                    <div className="stat-label">Tests Taken</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan"><Clock size={22} /></div>
                    <div className="stat-value">{studyHours}h</div>
                    <div className="stat-label">Study Time</div>
                </div>
            </div>

            {/* Module Breakdown */}
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Module Breakdown</h3>
                <div className="grid grid-4">
                    {moduleData.map(({ mod, count, avg, best }) => {
                        const Icon = modIcons[mod];
                        return (
                            <div key={mod} style={{
                                padding: 'var(--space-4)', background: 'var(--color-neutral-50)',
                                borderRadius: 'var(--radius-md)', textAlign: 'center',
                            }}>
                                <div className={`stat-icon ${modColors[mod]}`} style={{ margin: '0 auto var(--space-2)' }}>
                                    <Icon size={18} />
                                </div>
                                <div className="font-semibold" style={{ textTransform: 'capitalize' }}>{mod}</div>
                                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 'var(--space-1) 0' }}>
                                    {avg}
                                </div>
                                <div className="text-xs text-muted">{count} tests • Best: {best || '—'}</div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Insights */}
            <div className="grid grid-2">
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Insights</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {strongest && (
                            <div style={{
                                padding: 'var(--space-3)', background: '#F0FDF4',
                                borderRadius: 'var(--radius-md)', borderLeft: '3px solid #22C55E',
                            }}>
                                <div className="text-sm font-semibold" style={{ color: '#15803D' }}>Strongest Module</div>
                                <div className="text-sm" style={{ textTransform: 'capitalize' }}>
                                    {strongest.mod} — Band {strongest.avg}
                                </div>
                            </div>
                        )}
                        {weakest && weakest.mod !== strongest?.mod && (
                            <div style={{
                                padding: 'var(--space-3)', background: '#FEF2F2',
                                borderRadius: 'var(--radius-md)', borderLeft: '3px solid #EF4444',
                            }}>
                                <div className="text-sm font-semibold" style={{ color: '#DC2626' }}>Focus Area</div>
                                <div className="text-sm" style={{ textTransform: 'capitalize' }}>
                                    {weakest.mod} — Band {weakest.avg} (needs improvement)
                                </div>
                            </div>
                        )}
                        {trend !== null && (
                            <div style={{
                                padding: 'var(--space-3)',
                                background: parseFloat(trend) >= 0 ? '#F0FDF4' : '#FEF2F2',
                                borderRadius: 'var(--radius-md)',
                                borderLeft: `3px solid ${parseFloat(trend) >= 0 ? '#22C55E' : '#EF4444'}`,
                            }}>
                                <div className="text-sm font-semibold" style={{
                                    color: parseFloat(trend) >= 0 ? '#15803D' : '#DC2626',
                                }}>
                                    Recent Trend
                                </div>
                                <div className="text-sm">
                                    {parseFloat(trend) >= 0 ? '+' : ''}{trend} band change (last 5 vs previous 5 tests)
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Recent Scores</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                        {attempts.slice(-8).reverse().map(a => {
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
                                    <span className="text-sm font-semibold">Band {a.band || '—'}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
