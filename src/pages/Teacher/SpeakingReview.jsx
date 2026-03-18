import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Mic, Play, Pause, Eye, Award, Save, User, CheckCircle } from 'lucide-react';

export default function SpeakingReview() {
    const { profile } = useAuth();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSub, setSelectedSub] = useState(null);
    const [filter, setFilter] = useState('pending');
    const [saving, setSaving] = useState(false);
    const [playingAudio, setPlayingAudio] = useState(null);
    const [review, setReview] = useState({
        band: '',
        fluency: '',
        vocabulary: '',
        grammar: '',
        pronunciation: '',
        feedback: '',
    });

    useEffect(() => { fetchSubmissions(); }, [filter]);

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('speaking_submissions')
                .select(`
                    *,
                    profiles:student_id (full_name, email),
                    attempts!attempt_id (module, started_at)
                `)
                .order('created_at', { ascending: false });

            if (filter === 'pending') {
                query = query.eq('status', 'submitted');
            } else if (filter === 'reviewed') {
                query = query.in('status', ['reviewed', 'teacher_reviewed']);
            }

            const { data, error } = await query;
            if (error) throw error;
            setSubmissions(data || []);
        } catch (err) {
            console.error('Error fetching speaking submissions:', err);
        } finally {
            setLoading(false);
        }
    };

    const openReview = (sub) => {
        setSelectedSub(sub);
        setReview({
            band: sub.teacher_band || '',
            fluency: sub.teacher_band_scores?.fluency || '',
            vocabulary: sub.teacher_band_scores?.vocabulary || '',
            grammar: sub.teacher_band_scores?.grammar || '',
            pronunciation: sub.teacher_band_scores?.pronunciation || '',
            feedback: sub.teacher_feedback || '',
        });
    };

    const saveReview = async () => {
        if (!selectedSub) return;
        setSaving(true);
        try {
            const overallBand = review.band ? parseFloat(review.band) : null;

            await supabase.from('speaking_submissions').update({
                teacher_feedback: review.feedback,
                teacher_band: overallBand,
                teacher_band_scores: {
                    fluency: review.fluency,
                    vocabulary: review.vocabulary,
                    grammar: review.grammar,
                    pronunciation: review.pronunciation,
                },
                status: 'teacher_reviewed',
                reviewed_by: profile.id,
                reviewed_at: new Date().toISOString(),
            }).eq('id', selectedSub.id);

            if (overallBand && selectedSub.attempt_id) {
                await supabase.from('attempts').update({
                    band: overallBand,
                    score: overallBand,
                }).eq('id', selectedSub.attempt_id);
            }

            setSelectedSub(null);
            fetchSubmissions();
        } catch (err) {
            console.error('Error saving review:', err);
        } finally {
            setSaving(false);
        }
    };

    const getStatusBadge = (status) => {
        const map = {
            submitted: { label: 'Pending', cls: 'badge-warning' },
            teacher_reviewed: { label: 'Reviewed', cls: 'badge-success' },
        };
        const s = map[status] || { label: status, cls: 'badge-neutral' };
        return <span className={`badge ${s.cls}`}>{s.label}</span>;
    };

    // ========== REVIEW VIEW ==========
    if (selectedSub) {
        return (
            <div className="animate-fade-in">
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedSub(null)}
                    style={{ marginBottom: 'var(--space-4)' }}>
                    ← Back to Queue
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                    {/* Audio & Student Info */}
                    <div className="card">
                        <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)' }}>
                            <h3 className="card-title">
                                <User size={18} /> {selectedSub.profiles?.full_name || 'Student'}
                            </h3>
                            {getStatusBadge(selectedSub.status)}
                        </div>

                        <div style={{
                            padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                            fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)',
                        }}>
                            Submitted {new Date(selectedSub.created_at).toLocaleDateString()}
                        </div>

                        {selectedSub.audio_url ? (
                            <div style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="form-label">Student Recording</label>
                                <audio controls src={selectedSub.audio_url} style={{ width: '100%' }} />
                            </div>
                        ) : (
                            <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
                                <Mic size={32} />
                                <p className="text-sm text-muted">No audio recording available</p>
                            </div>
                        )}
                    </div>

                    {/* Review Form */}
                    <div className="card">
                        <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <Award size={16} /> Grade Speaking
                        </h4>

                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="form-label">Overall Band Score</label>
                            <input type="number" className="form-input" min="0" max="9" step="0.5"
                                placeholder="e.g. 6.5"
                                value={review.band}
                                onChange={(e) => setReview(r => ({ ...r, band: e.target.value }))}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                            {['fluency', 'vocabulary', 'grammar', 'pronunciation'].map(key => (
                                <div key={key} className="form-group">
                                    <label className="form-label" style={{ fontSize: 'var(--text-xs)', textTransform: 'capitalize' }}>
                                        {key === 'fluency' ? 'Fluency & Coherence' : key === 'grammar' ? 'Grammatical Range' : key === 'vocabulary' ? 'Lexical Resource' : 'Pronunciation'}
                                    </label>
                                    <input type="number" className="form-input" min="0" max="9" step="0.5"
                                        placeholder="Band"
                                        value={review[key]}
                                        onChange={(e) => setReview(r => ({ ...r, [key]: e.target.value }))}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="form-label">Feedback & Comments</label>
                            <textarea className="form-input" rows={5}
                                placeholder="Provide feedback on the student's speaking..."
                                value={review.feedback}
                                onChange={(e) => setReview(r => ({ ...r, feedback: e.target.value }))}
                                style={{ resize: 'vertical' }}
                            />
                        </div>

                        <button className="btn btn-primary" onClick={saveReview} disabled={saving}
                            style={{ width: '100%' }}>
                            {saving ? 'Saving...' : <><Save size={16} /> Save Review</>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========== QUEUE VIEW ==========
    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 className="page-title">Speaking Review</h1>
                    <p className="page-subtitle">Listen to student recordings and grade per IELTS criteria.</p>
                </div>
            </div>

            <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
                {[
                    { key: 'pending', label: 'Pending Review' },
                    { key: 'reviewed', label: 'Reviewed' },
                    { key: 'all', label: 'All' },
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
            ) : submissions.length === 0 ? (
                <div className="empty-state">
                    <Mic size={64} />
                    <h3>No recordings {filter === 'pending' ? 'to review' : 'found'}</h3>
                    <p>Speaking submissions from students will appear here for grading.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {submissions.map(sub => (
                        <div key={sub.id} className="card" style={{
                            cursor: 'pointer',
                            borderLeft: sub.status === 'teacher_reviewed'
                                ? '4px solid #22C55E' : '4px solid #F59E0B',
                        }} onClick={() => openReview(sub)}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <Mic size={18} style={{ color: 'var(--color-primary)' }} />
                                    <div>
                                        <div className="font-semibold">
                                            {sub.profiles?.full_name || 'Unknown Student'}
                                        </div>
                                        <div className="text-sm text-muted">
                                            {new Date(sub.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {sub.teacher_band && (
                                        <span className="text-sm font-semibold">Band {sub.teacher_band}</span>
                                    )}
                                    {getStatusBadge(sub.status)}
                                    <Eye size={16} style={{ color: 'var(--color-neutral-400)' }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
