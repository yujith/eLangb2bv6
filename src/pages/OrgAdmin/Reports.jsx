import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { BarChart3, Award, TrendingUp, BookOpen, PenTool, Headphones, Mic, Clock } from 'lucide-react';

export default function OrgAdminReports() {
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchReports(); }, []);

    const fetchReports = async () => {
        try {
            const { data, error } = await supabase
                .from('attempts')
                .select('*, profiles:student_id (full_name)')
                .eq('status', 'completed')
                .order('completed_at', { ascending: false })
                .limit(50);
            if (error) throw error;
            setAttempts(data || []);
        } catch (err) {
            console.error('Error fetching reports:', err);
        } finally {
            setLoading(false);
        }
    };

    const modules = ['reading', 'writing', 'listening', 'speaking'];
    const icons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const colors = { reading: 'red', writing: 'blue', listening: 'green', speaking: 'cyan' };

    const moduleData = modules.map(mod => {
        const modAttempts = attempts.filter(a => a.module === mod);
        const avg = modAttempts.length > 0
            ? (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1) : '—';
        return { mod, count: modAttempts.length, avg };
    });

    const overallAvg = attempts.length > 0
        ? (attempts.reduce((s, a) => s + (a.band || 0), 0) / attempts.length).toFixed(1) : '—';

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">Student performance data and trends across all IELTS modules.</p>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : attempts.length === 0 ? (
                <div className="empty-state">
                    <BarChart3 size={64} />
                    <h3>No report data yet</h3>
                    <p>Reports will populate as students take tests and receive scores.</p>
                </div>
            ) : (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                        <div className="stat-card">
                            <div className="stat-icon red"><Award size={22} /></div>
                            <div className="stat-value">{overallAvg}</div>
                            <div className="stat-label">Overall Avg Band</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon blue"><BarChart3 size={22} /></div>
                            <div className="stat-value">{attempts.length}</div>
                            <div className="stat-label">Total Tests</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon green"><TrendingUp size={22} /></div>
                            <div className="stat-value">
                                {attempts.filter(a => (a.band || 0) >= 6.5).length}
                            </div>
                            <div className="stat-label">Band 6.5+</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-icon cyan"><Clock size={22} /></div>
                            <div className="stat-value">
                                {new Set(attempts.map(a => a.student_id)).size}
                            </div>
                            <div className="stat-label">Active Students</div>
                        </div>
                    </div>

                    {/* Module Breakdown */}
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Module Breakdown</h3>
                        <div className="grid grid-4">
                            {moduleData.map(({ mod, count, avg }) => {
                                const Icon = icons[mod];
                                return (
                                    <div key={mod} style={{
                                        padding: 'var(--space-4)', background: 'var(--color-neutral-50)',
                                        borderRadius: 'var(--radius-md)', textAlign: 'center',
                                    }}>
                                        <div className={`stat-icon ${colors[mod]}`} style={{ margin: '0 auto var(--space-2)' }}>
                                            <Icon size={18} />
                                        </div>
                                        <div className="font-semibold" style={{ textTransform: 'capitalize' }}>{mod}</div>
                                        <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{avg}</div>
                                        <div className="text-xs text-muted">{count} attempts</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recent Attempts Table */}
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Recent Attempts</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {attempts.slice(0, 20).map(a => {
                                const Icon = icons[a.module] || BarChart3;
                                return (
                                    <div key={a.id} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                        borderRadius: 'var(--radius-md)',
                                    }}>
                                        <div className="flex items-center gap-3">
                                            <Icon size={14} />
                                            <span className="text-sm font-medium">{a.profiles?.full_name || 'Student'}</span>
                                            <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>{a.module}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-sm font-semibold">Band {a.band || '—'}</span>
                                            <span className="text-xs text-muted">
                                                {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : ''}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
