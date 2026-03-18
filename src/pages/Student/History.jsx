import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ClipboardList, BookOpen, PenTool, Headphones, Mic, Award, Clock, BarChart3 } from 'lucide-react';

export default function AttemptHistory() {
    const { profile } = useAuth();
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    useEffect(() => { fetchHistory(); }, [filter]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('attempts')
                .select('*')
                .eq('student_id', profile.id)
                .eq('status', 'completed')
                .order('completed_at', { ascending: false });

            if (filter !== 'all') {
                query = query.eq('module', filter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAttempts(data || []);
        } catch (err) {
            console.error('Error fetching history:', err);
        } finally {
            setLoading(false);
        }
    };

    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const modColors = { reading: '#E30613', writing: '#3B82F6', listening: '#10B981', speaking: '#F59E0B' };

    const formatDuration = (secs) => {
        if (!secs) return '—';
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s}s`;
    };

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Attempt History</h1>
            <p className="page-subtitle">View all your past test attempts and scores.</p>

            {/* Filter Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
                {[
                    { key: 'all', label: 'All' },
                    { key: 'reading', label: 'Reading' },
                    { key: 'writing', label: 'Writing' },
                    { key: 'listening', label: 'Listening' },
                    { key: 'speaking', label: 'Speaking' },
                ].map(tab => (
                    <button key={tab.key}
                        className={`tab ${filter === tab.key ? 'active' : ''}`}
                        onClick={() => setFilter(tab.key)}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : attempts.length === 0 ? (
                <div className="empty-state">
                    <ClipboardList size={64} />
                    <h3>No attempts yet</h3>
                    <p>Complete your first test to see your history here.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {attempts.map(a => {
                        const Icon = modIcons[a.module] || BarChart3;
                        const color = modColors[a.module] || '#6B7280';
                        return (
                            <div key={a.id} className="card" style={{
                                borderLeft: `4px solid ${color}`,
                            }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                            background: `${color}10`, display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Icon size={20} style={{ color }} />
                                        </div>
                                        <div>
                                            <div className="font-semibold" style={{ textTransform: 'capitalize' }}>
                                                {a.module} {a.ielts_type ? `(${a.ielts_type})` : ''}
                                            </div>
                                            <div className="text-xs text-muted">
                                                {a.completed_at ? new Date(a.completed_at).toLocaleDateString('en-US', {
                                                    year: 'numeric', month: 'short', day: 'numeric',
                                                }) : ''} • {formatDuration(a.duration_seconds)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {a.score !== null && (
                                            <span className="text-sm text-muted">
                                                {typeof a.score === 'number' && a.score <= 9 ? '' : `${Math.round(a.score)}%`}
                                            </span>
                                        )}
                                        <div style={{
                                            padding: '4px 12px', borderRadius: 'var(--radius-md)',
                                            background: (a.band || 0) >= 7 ? '#F0FDF4' : (a.band || 0) >= 5.5 ? '#FFF7ED' : '#FEF2F2',
                                            color: (a.band || 0) >= 7 ? '#15803D' : (a.band || 0) >= 5.5 ? '#C2410C' : '#DC2626',
                                            fontWeight: 700, fontSize: 'var(--text-sm)',
                                        }}>
                                            Band {a.band || '—'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
