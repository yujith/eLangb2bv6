import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { GraduationCap, Award, BarChart3, Search, BookOpen, PenTool, Headphones, Mic } from 'lucide-react';

export default function Students() {
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);
    const [attempts, setAttempts] = useState([]);

    useEffect(() => { fetchStudents(); }, []);

    const fetchStudents = async () => {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'student')
                .order('full_name');
            setStudents(data || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const viewStudent = async (s) => {
        setSelected(s);
        const { data } = await supabase
            .from('attempts')
            .select('*')
            .eq('student_id', s.id)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(20);
        setAttempts(data || []);
    };

    const filtered = students.filter(s =>
        s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
    );

    const modIcons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };

    if (selected) {
        const avg = attempts.length > 0
            ? (attempts.reduce((s, a) => s + (a.band || 0), 0) / attempts.length).toFixed(1) : '—';
        return (
            <div className="animate-fade-in">
                <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}
                    style={{ marginBottom: 'var(--space-4)' }}>← Back</button>
                <h2>{selected.full_name}</h2>
                <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-6)' }}>{selected.email}</p>
                <div className="grid grid-3" style={{ marginBottom: 'var(--space-6)' }}>
                    <div className="stat-card">
                        <div className="stat-icon red"><Award size={22} /></div>
                        <div className="stat-value">{avg}</div>
                        <div className="stat-label">Avg Band</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue"><BarChart3 size={22} /></div>
                        <div className="stat-value">{attempts.length}</div>
                        <div className="stat-label">Tests</div>
                    </div>
                    <div className="stat-card">
                        <div className={`stat-icon ${selected.license_active ? 'green' : 'yellow'}`}>
                            <GraduationCap size={22} />
                        </div>
                        <div className="stat-value">{selected.license_active ? 'Active' : 'None'}</div>
                        <div className="stat-label">License</div>
                    </div>
                </div>
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Recent Attempts</h4>
                    {attempts.length === 0 ? (
                        <p className="text-sm text-muted">No completed attempts.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {attempts.map(a => {
                                const Icon = modIcons[a.module] || BarChart3;
                                return (
                                    <div key={a.id} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                        borderRadius: 'var(--radius-md)',
                                    }}>
                                        <div className="flex items-center gap-3">
                                            <Icon size={14} />
                                            <span className="text-sm" style={{ textTransform: 'capitalize' }}>{a.module}</span>
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
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Student Oversight</h1>
            <p className="page-subtitle">Monitor individual student performance and progress.</p>
            <div style={{ marginBottom: 'var(--space-6)', position: 'relative', maxWidth: '400px' }}>
                <Search size={16} style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-neutral-400)',
                }} />
                <input className="form-input" placeholder="Search students..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '36px' }} />
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <GraduationCap size={64} />
                    <h3>No students found</h3>
                    <p>Add students via User Management to begin tracking their progress.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {filtered.map(s => (
                        <div key={s.id} className="card" style={{ cursor: 'pointer' }}
                            onClick={() => viewStudent(s)}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="font-semibold">{s.full_name}</div>
                                    <div className="text-xs text-muted">{s.email}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`badge ${s.license_active ? 'badge-success' : 'badge-warning'}`}>
                                        {s.license_active ? 'Licensed' : 'No License'}
                                    </span>
                                    <span className={`badge ${s.status === 'active' ? 'badge-info' : 'badge-neutral'}`}>
                                        {s.status}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
