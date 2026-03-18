import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Zap, Activity, RefreshCw, BookOpen, PenTool, Headphones, Mic } from 'lucide-react';

export default function CostMonitor() {
    const [logs, setLogs] = useState([]);
    const [topContent, setTopContent] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [{ data: aiLogs }, { data: contentItems }] = await Promise.all([
                supabase.from('ai_usage_log').select('*'),
                supabase.from('global_content_items').select('id, title, module, usage_count')
                    .eq('status', 'active').order('usage_count', { ascending: false }).limit(10),
            ]);
            setLogs(aiLogs || []);
            setTopContent(contentItems || []);
        } catch (err) {
            console.error('Error fetching cost data:', err);
        } finally {
            setLoading(false);
        }
    };

    const totalCalls = logs.length;
    const cacheHits = logs.filter(l => l.was_cache_hit).length;
    const reuseRate = totalCalls > 0 ? Math.round((cacheHits / totalCalls) * 100) : 0;
    const totalCost = logs.reduce((s, l) => s + (l.cost_estimate || 0), 0);
    const ttsNew = logs.filter(l => l.action === 'tts_generation' && !l.was_cache_hit).length;
    const ttsCached = logs.filter(l => l.action === 'tts_generation' && l.was_cache_hit).length;

    const modules = ['reading', 'listening', 'writing', 'speaking'];
    const modIcons = { reading: BookOpen, listening: Headphones, writing: PenTool, speaking: Mic };
    const moduleCosts = modules.map(mod => {
        const modLogs = logs.filter(l => l.module === mod);
        const cost = modLogs.reduce((s, l) => s + (l.cost_estimate || 0), 0);
        const calls = modLogs.length;
        const hits = modLogs.filter(l => l.was_cache_hit).length;
        return { mod, cost, calls, hits };
    });

    const kpis = [
        { icon: Zap, label: 'Total AI Calls', value: totalCalls.toString(), sub: `${cacheHits} cache hits`, color: 'yellow' },
        { icon: RefreshCw, label: 'Reuse Hit Rate', value: `${reuseRate}%`, sub: 'Target: 80%+', color: reuseRate >= 80 ? 'green' : 'yellow' },
        { icon: DollarSign, label: 'Est. Total Cost', value: `$${totalCost.toFixed(2)}`, sub: 'All time', color: 'red' },
        { icon: Activity, label: 'TTS Generations', value: ttsNew.toString(), sub: `${ttsCached} replays (cached)`, color: 'cyan' },
    ];

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
                <h1 className="page-title">AI Cost Monitor</h1>
                <button className="btn btn-outline btn-sm" onClick={fetchData}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>
            <p className="page-subtitle" style={{ marginBottom: 'var(--space-6)' }}>
                Track AI usage, content reuse efficiency, and estimated costs.
            </p>

            {/* KPI Cards */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                {kpis.map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className={`stat-icon ${stat.color}`}>
                            <stat.icon size={22} />
                        </div>
                        <div className="stat-value">{loading ? '...' : stat.value}</div>
                        <div className="stat-label">{stat.label}</div>
                        <div className="text-xs text-muted">{stat.sub}</div>
                    </div>
                ))}
            </div>

            {/* Breakdown */}
            <div className="grid grid-2">
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Cost by Module</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {moduleCosts.map(({ mod, cost, calls, hits }) => {
                            const Icon = modIcons[mod];
                            const hitRate = calls > 0 ? Math.round((hits / calls) * 100) : 0;
                            return (
                                <div key={mod} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    <div className="flex items-center gap-3">
                                        <Icon size={16} />
                                        <div>
                                            <span className="text-sm font-medium" style={{ textTransform: 'capitalize' }}>{mod}</span>
                                            <div className="text-xs text-muted">{calls} calls • {hitRate}% reuse</div>
                                        </div>
                                    </div>
                                    <span className="text-sm font-semibold">${cost.toFixed(2)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Most Reused Content</h4>
                    {topContent.filter(c => (c.usage_count || 0) > 1).length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                            <p className="text-sm text-muted">No content has been reused yet.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {topContent.filter(c => (c.usage_count || 0) > 1).map(c => {
                                const Icon = modIcons[c.module] || Zap;
                                return (
                                    <div key={c.id} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-2) var(--space-3)',
                                        background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)',
                                    }}>
                                        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                                            <Icon size={14} style={{ flexShrink: 0 }} />
                                            <span className="text-xs" style={{
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {c.title || 'Untitled'}
                                            </span>
                                        </div>
                                        <span className="badge badge-success" style={{ flexShrink: 0 }}>
                                            {c.usage_count}x
                                        </span>
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
