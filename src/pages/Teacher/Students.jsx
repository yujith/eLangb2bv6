import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { GraduationCap, Award, BarChart3, BookOpen, PenTool, Headphones, Mic, Search } from 'lucide-react';

export default function TeacherStudents() {
    const { organization } = useAuth();
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [attempts, setAttempts] = useState([]);

    useEffect(() => { fetchStudents(); }, []);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'student')
                .eq('status', 'active')
                .order('full_name');

            if (error) throw error;
            setStudents(data || []);
        } catch (err) {
            console.error('Error fetching students:', err);
        } finally {
            setLoading(false);
        }
    };

    const viewStudent = async (student) => {
        setSelectedStudent(student);
        try {
            const { data } = await supabase
                .from('attempts')
                .select('*')
                .eq('student_id', student.id)
                .eq('status', 'completed')
                .order('completed_at', { ascending: false })
                .limit(20);
            setAttempts(data || []);
        } catch (err) {
            console.error('Error fetching attempts:', err);
        }
    };

    const filtered = students.filter(s =>
        s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
    );

    const moduleIcon = (mod) => {
        const icons = { reading: BookOpen, writing: PenTool, listening: Headphones, speaking: Mic };
        const Icon = icons[mod] || BarChart3;
        return <Icon size={14} />;
    };

    // ========== STUDENT DETAIL ==========
    if (selectedStudent) {
        const avgBand = attempts.length > 0
            ? (attempts.reduce((sum, a) => sum + (a.band || 0), 0) / attempts.length).toFixed(1)
            : '—';

        const byModule = {};
        attempts.forEach(a => {
            if (!byModule[a.module]) byModule[a.module] = [];
            byModule[a.module].push(a);
        });

        return (
            <div className="animate-fade-in">
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedStudent(null)}
                    style={{ marginBottom: 'var(--space-4)' }}>
                    ← Back to Students
                </button>

                <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 'var(--text-lg)',
                    }}>
                        {selectedStudent.full_name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                        <h2 style={{ margin: 0 }}>{selectedStudent.full_name}</h2>
                        <p className="text-sm text-muted">{selectedStudent.email}</p>
                    </div>
                </div>

                <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
                    <div className="stat-card">
                        <div className="stat-icon red"><Award size={22} /></div>
                        <div className="stat-value">{avgBand}</div>
                        <div className="stat-label">Avg Band</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue"><BarChart3 size={22} /></div>
                        <div className="stat-value">{attempts.length}</div>
                        <div className="stat-label">Tests Taken</div>
                    </div>
                    {Object.entries(byModule).map(([mod, modAttempts]) => {
                        const avg = (modAttempts.reduce((s, a) => s + (a.band || 0), 0) / modAttempts.length).toFixed(1);
                        return (
                            <div key={mod} className="stat-card">
                                <div className="stat-icon green">{moduleIcon(mod)}</div>
                                <div className="stat-value">{avg}</div>
                                <div className="stat-label" style={{ textTransform: 'capitalize' }}>{mod}</div>
                            </div>
                        );
                    })}
                </div>

                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Recent Attempts</h4>
                    {attempts.length === 0 ? (
                        <p className="text-sm text-muted">No completed attempts yet.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {attempts.map(a => (
                                <div key={a.id} className="flex justify-between items-center" style={{
                                    padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    <div className="flex items-center gap-3">
                                        {moduleIcon(a.module)}
                                        <span className="text-sm font-medium" style={{ textTransform: 'capitalize' }}>{a.module}</span>
                                        {a.ielts_type && <span className="badge badge-neutral">{a.ielts_type}</span>}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-semibold">Band {a.band || '—'}</span>
                                        <span className="text-xs text-muted">
                                            {a.completed_at ? new Date(a.completed_at).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ========== STUDENT LIST ==========
    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Student Progress</h1>
            <p className="page-subtitle">Track individual student performance and improvement trends.</p>

            <div style={{ marginBottom: 'var(--space-6)', position: 'relative', maxWidth: '400px' }}>
                <Search size={16} style={{
                    position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--color-neutral-400)',
                }} />
                <input className="form-input" placeholder="Search students..."
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    style={{ paddingLeft: '36px' }}
                />
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <GraduationCap size={64} />
                    <h3>No students found</h3>
                    <p>Once students are added to your organization, they will appear here.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {filtered.map(student => (
                        <div key={student.id} className="card" style={{ cursor: 'pointer' }}
                            onClick={() => viewStudent(student)}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%',
                                        background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 600, fontSize: 'var(--text-sm)',
                                    }}>
                                        {student.full_name?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <div className="font-semibold">{student.full_name}</div>
                                        <div className="text-xs text-muted">{student.email}</div>
                                    </div>
                                </div>
                                <span className={`badge ${student.license_active ? 'badge-success' : 'badge-warning'}`}>
                                    {student.license_active ? 'Licensed' : 'No License'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
