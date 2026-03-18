import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Headphones, Eye, Award, Save, User, CheckCircle, AlertCircle } from 'lucide-react';

export default function ListeningReview() {
    const { profile } = useAuth();
    const [attempts, setAttempts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [filter, setFilter] = useState('pending');
    const [saving, setSaving] = useState(false);
    const [review, setReview] = useState({
        override_score: '',
        feedback: '',
    });

    useEffect(() => { fetchAttempts(); }, [filter]);

    const fetchAttempts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('attempts')
                .select(`
                    *,
                    profiles:student_id (full_name, email),
                    attempt_answers (question_index, student_answer, correct_answer, is_correct)
                `)
                .eq('module', 'listening')
                .eq('status', 'completed')
                .order('completed_at', { ascending: false });

            if (filter === 'pending') {
                query = query.is('reviewed_by', null);
            } else if (filter === 'reviewed') {
                query = query.not('reviewed_by', 'is', null);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAttempts(data || []);
        } catch (err) {
            console.error('Error fetching listening attempts:', err);
        } finally {
            setLoading(false);
        }
    };

    const openReview = (attempt) => {
        setSelectedAttempt(attempt);
        setReview({
            override_score: attempt.teacher_override_score ?? attempt.band ?? '',
            feedback: attempt.teacher_feedback || '',
        });
    };

    const saveReview = async () => {
        if (!selectedAttempt) return;
        setSaving(true);
        try {
            const overrideScore = review.override_score ? parseFloat(review.override_score) : null;

            await supabase.from('attempts').update({
                teacher_override_score: overrideScore,
                teacher_feedback: review.feedback,
                reviewed_by: profile.id,
                reviewed_at: new Date().toISOString(),
                ...(overrideScore != null ? { band: overrideScore, score: overrideScore } : {}),
            }).eq('id', selectedAttempt.id);

            setSelectedAttempt(null);
            fetchAttempts();
        } catch (err) {
            console.error('Error saving review:', err);
        } finally {
            setSaving(false);
        }
    };

    const getStatusBadge = (attempt) => {
        if (attempt.reviewed_by) return <span className="badge badge-success">Reviewed</span>;
        return <span className="badge badge-warning">Pending</span>;
    };

    const computeAutoScore = (answers) => {
        if (!answers || answers.length === 0) return null;
        const correct = answers.filter(a => a.is_correct).length;
        return { correct, total: answers.length, pct: Math.round((correct / answers.length) * 100) };
    };

    // ========== REVIEW VIEW ==========
    if (selectedAttempt) {
        const answers = selectedAttempt.attempt_answers || [];
        const autoScore = computeAutoScore(answers);

        return (
            <div className="animate-fade-in">
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedAttempt(null)}
                    style={{ marginBottom: 'var(--space-4)' }}>
                    &larr; Back to Queue
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                    {/* Student Info & Auto-Score */}
                    <div className="card">
                        <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)' }}>
                            <h3 className="card-title">
                                <User size={18} /> {selectedAttempt.profiles?.full_name || 'Student'}
                            </h3>
                            {getStatusBadge(selectedAttempt)}
                        </div>

                        <div style={{
                            padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                            fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)',
                        }}>
                            Completed {selectedAttempt.completed_at ? new Date(selectedAttempt.completed_at).toLocaleDateString() : 'N/A'}
                            {selectedAttempt.ielts_type && ` | ${selectedAttempt.ielts_type}`}
                        </div>

                        {/* Auto-graded score */}
                        {autoScore && (
                            <div style={{
                                padding: 'var(--space-4)', background: '#F0FDF4',
                                borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                                borderLeft: '4px solid #22C55E',
                            }}>
                                <div className="text-sm font-semibold" style={{ marginBottom: 4 }}>Auto-Graded Result</div>
                                <div className="flex items-center gap-4">
                                    <div>
                                        <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: '#16A34A' }}>
                                            {autoScore.correct}/{autoScore.total}
                                        </span>
                                        <span className="text-sm text-muted" style={{ marginLeft: 6 }}>({autoScore.pct}%)</span>
                                    </div>
                                    {selectedAttempt.band && (
                                        <div className="badge badge-success">Band {selectedAttempt.band}</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Answer breakdown */}
                        <div style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="form-label" style={{ marginBottom: 'var(--space-2)' }}>Answer Breakdown</label>
                            <div style={{
                                maxHeight: '300px', overflowY: 'auto',
                                display: 'flex', flexDirection: 'column', gap: '6px',
                            }}>
                                {answers.length > 0 ? answers.sort((a, b) => a.question_index - b.question_index).map((a, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                        padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                        background: a.is_correct ? '#F0FDF4' : '#FEF2F2',
                                        fontSize: 'var(--text-sm)',
                                    }}>
                                        <span style={{
                                            width: 20, height: 20, borderRadius: '50%',
                                            background: a.is_correct ? '#22C55E' : '#EF4444',
                                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '10px', fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {a.question_index + 1}
                                        </span>
                                        <span style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--color-neutral-500)' }}>Student: </span>
                                            <strong>{a.student_answer || '—'}</strong>
                                        </span>
                                        {!a.is_correct && (
                                            <span className="text-xs" style={{ color: '#16A34A' }}>
                                                Correct: {a.correct_answer}
                                            </span>
                                        )}
                                    </div>
                                )) : (
                                    <p className="text-sm text-muted">No detailed answers recorded.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Review Form */}
                    <div className="card">
                        <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <Award size={16} /> Teacher Review
                        </h4>

                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="form-label">Override Band Score</label>
                            <input type="number" className="form-input" min="0" max="9" step="0.5"
                                placeholder={selectedAttempt.band ? `Auto: ${selectedAttempt.band}` : 'e.g. 6.5'}
                                value={review.override_score}
                                onChange={(e) => setReview(r => ({ ...r, override_score: e.target.value }))}
                            />
                            <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                                Leave empty to keep the auto-graded score. Set a value to override.
                            </p>
                        </div>

                        <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                            <label className="form-label">Feedback & Comments</label>
                            <textarea className="form-input" rows={6}
                                placeholder="Provide feedback on the student's listening performance..."
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
                    <h1 className="page-title">Listening Review</h1>
                    <p className="page-subtitle">Review student listening attempts, verify scores, and provide feedback.</p>
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
            ) : attempts.length === 0 ? (
                <div className="empty-state">
                    <Headphones size={64} />
                    <h3>No listening attempts {filter === 'pending' ? 'to review' : 'found'}</h3>
                    <p>Completed listening tests from students will appear here for review.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {attempts.map(attempt => {
                        const autoScore = computeAutoScore(attempt.attempt_answers);
                        return (
                            <div key={attempt.id} className="card" style={{
                                cursor: 'pointer',
                                borderLeft: attempt.reviewed_by
                                    ? '4px solid #22C55E' : '4px solid #F59E0B',
                            }} onClick={() => openReview(attempt)}>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <Headphones size={18} style={{ color: 'var(--color-primary)' }} />
                                        <div>
                                            <div className="font-semibold">
                                                {attempt.profiles?.full_name || 'Unknown Student'}
                                            </div>
                                            <div className="text-sm text-muted">
                                                {attempt.completed_at ? new Date(attempt.completed_at).toLocaleDateString() : 'N/A'}
                                                {attempt.ielts_type && ` | ${attempt.ielts_type}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {autoScore && (
                                            <span className="text-sm font-medium">
                                                {autoScore.correct}/{autoScore.total} ({autoScore.pct}%)
                                            </span>
                                        )}
                                        {attempt.band && (
                                            <span className="text-sm font-semibold">Band {attempt.band}</span>
                                        )}
                                        {getStatusBadge(attempt)}
                                        <Eye size={16} style={{ color: 'var(--color-neutral-400)' }} />
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
