import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { UserCheck, PenTool, Mic, Search } from 'lucide-react';

export default function Teachers() {
    const [teachers, setTeachers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => { fetchTeachers(); }, []);

    const fetchTeachers = async () => {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'teacher')
                .order('full_name');
            setTeachers(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filtered = teachers.filter(t =>
        t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Teacher Oversight</h1>
            <p className="page-subtitle">View teacher workloads and grading performance.</p>

            <div style={{ marginBottom: 'var(--space-6)', position: 'relative', maxWidth: '400px' }}>
                <Search size={16} style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-neutral-400)',
                }} />
                <input className="form-input" placeholder="Search teachers..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '36px' }} />
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <UserCheck size={64} />
                    <h3>No teachers found</h3>
                    <p>Add teachers via User Management to begin tracking their workload.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {filtered.map(t => (
                        <div key={t.id} className="card">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: '#EFF6FF', color: '#3B82F6',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 600, fontSize: 'var(--text-sm)',
                                    }}>
                                        {t.full_name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <div className="font-semibold">{t.full_name}</div>
                                        <div className="text-xs text-muted">{t.email}</div>
                                    </div>
                                </div>
                                <span className={`badge ${t.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                                    {t.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
