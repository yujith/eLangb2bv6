import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    PenTool, CheckCircle, Clock, Eye, Award, Save, ChevronDown, ChevronUp,
    AlertCircle, User
} from 'lucide-react';

export default function WritingReview() {
    const { profile, organization } = useAuth();
    const [submissions, setSubmissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSub, setSelectedSub] = useState(null);
    const [filter, setFilter] = useState('pending'); // pending | reviewed | all
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState({
        teacher_feedback: '',
        teacher_band: '',
        criteria: {
            taskResponse: '',
            coherenceCohesion: '',
            lexicalResource: '',
            grammaticalRange: '',
        },
    });

    useEffect(() => {
        fetchSubmissions();
    }, [filter]);

    const fetchSubmissions = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('writing_submissions')
                .select(`
                    *,
                    profiles:student_id (full_name, email),
                    attempts!attempt_id (module, ielts_type, started_at)
                `)
                .order('created_at', { ascending: false });

            if (filter === 'pending') {
                query = query.in('status', ['ai_graded', 'submitted']);
            } else if (filter === 'reviewed') {
                query = query.eq('status', 'teacher_reviewed');
            }

            const { data, error } = await query;
            if (error) throw error;
            setSubmissions(data || []);
        } catch (err) {
            console.error('Error fetching submissions:', err);
        } finally {
            setLoading(false);
        }
    };

    const openReview = (sub) => {
        setSelectedSub(sub);
        setFeedback({
            teacher_feedback: sub.teacher_feedback || '',
            teacher_band: sub.teacher_band_scores?.overall || sub.ai_band_scores?.taskResponse?.band || '',
            criteria: {
                taskResponse: sub.teacher_band_scores?.taskResponse || '',
                coherenceCohesion: sub.teacher_band_scores?.coherenceCohesion || '',
                lexicalResource: sub.teacher_band_scores?.lexicalResource || '',
                grammaticalRange: sub.teacher_band_scores?.grammaticalRange || '',
            },
        });
    };

    const saveReview = async () => {
        if (!selectedSub) return;
        setSaving(true);
        try {
            const overallBand = feedback.teacher_band
                ? parseFloat(feedback.teacher_band)
                : null;

            await supabase.from('writing_submissions').update({
                teacher_feedback: feedback.teacher_feedback,
                teacher_band_scores: {
                    overall: overallBand,
                    ...feedback.criteria,
                },
                status: 'teacher_reviewed',
                reviewed_by: profile.id,
                reviewed_at: new Date().toISOString(),
            }).eq('id', selectedSub.id);

            // Update attempt band if teacher provided one
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
            submitted: { label: 'Submitted', cls: 'badge-warning' },
            ai_graded: { label: 'AI Graded', cls: 'badge-info' },
            teacher_reviewed: { label: 'Reviewed', cls: 'badge-success' },
        };
        const s = map[status] || { label: status, cls: 'badge-neutral' };
        return <span className={`badge ${s.cls}`}>{s.label}</span>;
    };

    // ========== REVIEW MODAL ==========
    if (selectedSub) {
        const aiFeedback = selectedSub.ai_feedback || {};
        const aiCriteria = aiFeedback.criteria || selectedSub.ai_band_scores || {};

        return (
            <div className="animate-fade-in">
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedSub(null)}
                    style={{ marginBottom: 'var(--space-4)' }}>
                    ← Back to Queue
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                    {/* Essay */}
                    <div className="card" style={{ maxHeight: '80vh', overflow: 'auto' }}>
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
                            {selectedSub.word_count} words • {new Date(selectedSub.created_at).toLocaleDateString()}
                        </div>

                        <div style={{
                            whiteSpace: 'pre-wrap', lineHeight: 1.8,
                            fontSize: 'var(--text-sm)', color: 'var(--color-neutral-700)',
                        }}>
                            {selectedSub.essay_text}
                        </div>
                    </div>

                    {/* Review Panel */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {/* AI Feedback Summary */}
                        {Object.keys(aiCriteria).length > 0 && (
                            <div className="card">
                                <h4 className="card-title" style={{ marginBottom: 'var(--space-3)', color: '#3B82F6' }}>
                                    <Award size={16} /> AI Assessment (Band {aiFeedback.overallBand || '—'})
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                                    {Object.entries(aiCriteria).map(([key, val]) => (
                                        <div key={key} style={{
                                            padding: 'var(--space-2)', background: 'var(--color-neutral-50)',
                                            borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                                        }}>
                                            <span className="text-muted">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                            <div className="font-semibold">Band {val.band || val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Teacher Review Form */}
                        <div className="card">
                            <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                                <PenTool size={16} /> Your Review
                            </h4>

                            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="form-label">Overall Band Score</label>
                                <input type="number" className="form-input" min="0" max="9" step="0.5"
                                    placeholder="e.g. 6.5"
                                    value={feedback.teacher_band}
                                    onChange={(e) => setFeedback(f => ({ ...f, teacher_band: e.target.value }))}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                                {['taskResponse', 'coherenceCohesion', 'lexicalResource', 'grammaticalRange'].map(key => (
                                    <div key={key} className="form-group">
                                        <label className="form-label" style={{ fontSize: 'var(--text-xs)' }}>
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </label>
                                        <input type="number" className="form-input" min="0" max="9" step="0.5"
                                            placeholder="Band"
                                            value={feedback.criteria[key]}
                                            onChange={(e) => setFeedback(f => ({
                                                ...f,
                                                criteria: { ...f.criteria, [key]: e.target.value },
                                            }))}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                                <label className="form-label">Feedback & Comments</label>
                                <textarea className="form-input" rows={6}
                                    placeholder="Provide detailed feedback on the student's essay..."
                                    value={feedback.teacher_feedback}
                                    onChange={(e) => setFeedback(f => ({ ...f, teacher_feedback: e.target.value }))}
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
            </div>
        );
    }

    // ========== QUEUE VIEW ==========
    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 className="page-title">Writing Review</h1>
                    <p className="page-subtitle">Review student essays and provide band scores and feedback.</p>
                </div>
            </div>

            {/* Filter Tabs */}
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
                    <PenTool size={64} />
                    <h3>No submissions {filter === 'pending' ? 'to review' : 'found'}</h3>
                    <p>Student writing submissions will appear here for grading.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {submissions.map(sub => (
                        <div key={sub.id} className="card" style={{
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                            borderLeft: sub.status === 'teacher_reviewed'
                                ? '4px solid #22C55E'
                                : sub.status === 'ai_graded'
                                    ? '4px solid #3B82F6'
                                    : '4px solid #F59E0B',
                        }} onClick={() => openReview(sub)}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <div className="font-semibold">
                                            {sub.profiles?.full_name || 'Unknown Student'}
                                        </div>
                                        <div className="text-sm text-muted">
                                            {sub.word_count} words • {new Date(sub.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {sub.ai_feedback?.overallBand && (
                                        <span className="text-sm text-muted">
                                            AI: Band {sub.ai_feedback.overallBand}
                                        </span>
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
