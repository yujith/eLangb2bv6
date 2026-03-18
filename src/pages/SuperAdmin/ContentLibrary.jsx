import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Library, Search, BookOpen, PenTool, Headphones, Mic, RefreshCw, Eye } from 'lucide-react';

export default function ContentLibrary() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    useEffect(() => { fetchContent(); }, [filter]);

    const fetchContent = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('global_content_items')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(100);

            if (filter !== 'all') {
                query = query.eq('module', filter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            console.error('Error fetching content:', err);
        } finally {
            setLoading(false);
        }
    };

    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
    const modColors = { reading: 'red', writing: 'blue', listening: 'green', speaking: 'cyan' };

    const countByModule = (mod) => items.filter(i => i.module === mod).length;
    const allItems = items;

    const stats = [
        { label: 'Reading Passages', value: filter === 'all' ? countByModule('reading') : (filter === 'reading' ? items.length : 0), color: 'red' },
        { label: 'Listening Scripts', value: filter === 'all' ? countByModule('listening') : (filter === 'listening' ? items.length : 0), color: 'blue' },
        { label: 'Writing Prompts', value: filter === 'all' ? countByModule('writing') : (filter === 'writing' ? items.length : 0), color: 'green' },
        { label: 'Speaking Sets', value: filter === 'all' ? countByModule('speaking') : (filter === 'speaking' ? items.length : 0), color: 'cyan' },
    ];

    const filtered = search
        ? items.filter(i => i.title?.toLowerCase().includes(search.toLowerCase()) || i.topic_tags?.some(t => t.includes(search.toLowerCase())))
        : items;

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 className="page-title">Global Content Library</h1>
                    <p className="text-muted">Manage AI-generated and curated IELTS content platform-wide</p>
                </div>
                <button className="btn btn-outline btn-sm" onClick={fetchContent}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
                {stats.map((stat, i) => (
                    <div key={i} className="stat-card">
                        <div className="stat-label">{stat.label}</div>
                        <div className="stat-value">{loading ? '...' : stat.value}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="tabs" style={{ flex: 1 }}>
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
                <div style={{ position: 'relative', width: '250px' }}>
                    <Search size={14} style={{
                        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--color-neutral-400)',
                    }} />
                    <input className="form-input" placeholder="Search content..."
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        style={{ paddingLeft: '32px', fontSize: 'var(--text-sm)' }} />
                </div>
            </div>

            {/* Content List */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <Library size={64} />
                    <h3>No content found</h3>
                    <p>As students use the platform, AI-generated content will be stored here for reuse.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {filtered.map(item => {
                        const Icon = modIcons[item.module] || Library;
                        const color = modColors[item.module] || 'neutral';
                        return (
                            <div key={item.id} className="card" style={{
                                borderLeft: `3px solid var(--color-${color === 'red' ? 'primary' : color === 'blue' ? 'info' : color === 'green' ? 'success' : 'warning'}, #6B7280)`,
                            }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
                                        <Icon size={16} style={{ flexShrink: 0 }} />
                                        <div style={{ minWidth: 0 }}>
                                            <div className="font-semibold text-sm" style={{
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>
                                                {item.title || 'Untitled'}
                                            </div>
                                            <div className="text-xs text-muted">
                                                {item.module} • {item.difficulty?.replace('_', ' ')} • {item.ielts_type}
                                                {item.topic_tags?.length > 0 && ` • ${item.topic_tags.join(', ')}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                                        <span className="text-xs text-muted">
                                            Used {item.usage_count || 0}x
                                        </span>
                                        <span className="badge badge-neutral">{item.created_by}</span>
                                        <span className="text-xs text-muted">
                                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                                        </span>
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
