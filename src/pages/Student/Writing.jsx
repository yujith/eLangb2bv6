import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateWritingPrompt } from '../../lib/contentEngine';
import { evaluateWriting, cleanMarkdown, generateWritingPrompt } from '../../lib/aiService';
import { supabase } from '../../lib/supabase';
import {
    PenTool, Clock, Send, AlertCircle, RefreshCw, Award,
    BarChart3, CheckCircle, TrendingUp, BookOpen
} from 'lucide-react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Title, Tooltip, Legend
} from 'chart.js';
import VisualTaskDisplay from '../../components/VisualTaskDisplay';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend);

const TOPICS_ACADEMIC = [
    'Education', 'Technology', 'Environment', 'Health', 'Society',
    'Globalization', 'Work', 'Crime', 'Tourism', 'Media',
];
const TOPICS_GENERAL = [
    'Neighbourhood', 'Work', 'Travel', 'Customer Service', 'Housing',
    'Education', 'Community', 'Health', 'Entertainment', 'Transport',
];

const TASK1_ACADEMIC_TYPES = [
    { key: 'graph', label: 'Bar / Line Graph', desc: 'Describe trends and comparisons in a graph' },
    { key: 'pie_chart', label: 'Pie Chart', desc: 'Summarise proportions and percentages' },
    { key: 'table', label: 'Table', desc: 'Compare data across categories and time' },
    { key: 'map', label: 'Map', desc: 'Describe changes to a place or give directions' },
    { key: 'process', label: 'Process Diagram', desc: 'Explain steps in a process or cycle' },
];
const TASK1_GENERAL_TYPES = [
    { key: 'formal', label: 'Formal Letter', desc: 'To an authority, company, or unknown recipient' },
    { key: 'semi_formal', label: 'Semi-Formal Letter', desc: 'To an acquaintance or in a professional context' },
    { key: 'informal', label: 'Informal Letter', desc: 'To a friend or family member' },
];

export default function WritingModule() {
    const { profile, organization, hasTeachers } = useAuth();
    const [step, setStep] = useState('setup'); // setup | loading | writing | grading | results
    const [config, setConfig] = useState({
        taskType: 2,
        ieltsType: 'academic',
        topic: '',
        task1Subtype: '',
    });
    const [prompt, setPrompt] = useState(null);
    const [structuredTask, setStructuredTask] = useState(null); // parsed JSON for Academic Task 1
    const [contentItem, setContentItem] = useState(null);
    const [essay, setEssay] = useState('');
    const [wordCount, setWordCount] = useState(0);
    const [timeLeft, setTimeLeft] = useState(40 * 60);
    const [evaluation, setEvaluation] = useState(null);
    const [error, setError] = useState('');
    const [attemptId, setAttemptId] = useState(null);
    const [humanReviewRequested, setHumanReviewRequested] = useState(false);
    const timerRef = useRef(null);

    const minWords = config.taskType === 1 ? 150 : 250;

    // Timer
    useEffect(() => {
        if (step === 'writing' && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timerRef.current);
        }
    }, [step]);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const handleEssayChange = (e) => {
        const text = e.target.value;
        setEssay(text);
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
    };

    const startTest = async () => {
        setStep('loading');
        setError('');

        try {
            const topicPool = config.ieltsType === 'academic' ? TOPICS_ACADEMIC : TOPICS_GENERAL;
            const result = await getOrCreateWritingPrompt({
                taskType: config.taskType,
                ieltsType: config.ieltsType,
                topic: config.topic || topicPool[Math.floor(Math.random() * topicPool.length)],
                task1Subtype: config.task1Subtype || undefined,
                organizationId: organization?.id,
                studentId: profile?.id,
            });

            let body = result.contentItem?.body || '';
            let parsed = null;

            // For Academic Task 1, body MUST be structured JSON with chartData
            if (config.taskType === 1 && config.ieltsType === 'academic') {
                // Helper: extract structured data from a value that may be a string or object
                const extractStructured = (input) => {
                    let obj = null;
                    if (typeof input === 'object' && input !== null) {
                        obj = input;
                    } else if (typeof input === 'string') {
                        try { obj = JSON.parse(input); } catch { return null; }
                    }
                    if (!obj || typeof obj !== 'object') return null;
                    // Normalise alternative key names the AI might return
                    if (!obj.chartData && obj.chart_data) obj.chartData = obj.chart_data;
                    if (!obj.taskInstruction && obj.task_instruction) obj.taskInstruction = obj.task_instruction;
                    return obj.chartData ? obj : null;
                };

                // Step 1: try to parse body returned by content engine
                parsed = extractStructured(body);
                if (parsed) {
                    console.log('[Writing] Structured chart data loaded:', parsed.chartData?.type);
                } else {
                    console.warn('[Writing] Body not structured (type=' + typeof body + '), will generate fresh prompt');
                }

                // Step 2: if content-engine body wasn't structured, generate fresh via AI
                if (!parsed) {
                    console.log('[Writing] Generating fresh structured prompt via AI...');
                    const freshTopic = config.topic || TOPICS_ACADEMIC[Math.floor(Math.random() * TOPICS_ACADEMIC.length)];
                    const { prompt: freshPrompt } = await generateWritingPrompt(
                        1, 'academic', freshTopic, config.task1Subtype || undefined
                    );
                    parsed = extractStructured(freshPrompt);
                    if (parsed) {
                        body = typeof freshPrompt === 'string' ? freshPrompt : JSON.stringify(parsed);
                        console.log('[Writing] Fresh structured data generated:', parsed.chartData?.type);
                    } else {
                        console.error('[Writing] Fresh AI response has no chartData:', String(freshPrompt).substring(0, 200));
                    }
                }
            }

            if (parsed) {
                setStructuredTask(parsed);
                setPrompt(null);
            } else {
                setPrompt(cleanMarkdown(body));
                setStructuredTask(null);
            }
            setContentItem(result.contentItem);

            // Create attempt
            const { data: attempt } = await supabase.from('attempts').insert({
                student_id: profile.id,
                content_item_id: result.contentItem?.id,
                module: 'writing',
                ielts_type: config.ieltsType,
                status: 'in_progress',
            }).select().single();

            if (attempt) setAttemptId(attempt.id);

            setTimeLeft(config.taskType === 1 ? 20 * 60 : 40 * 60);
            setEssay('');
            setWordCount(0);
            setStep('writing');
        } catch (err) {
            console.error('Error:', err);
            setError(err.message || 'Failed to generate writing prompt.');
            setStep('setup');
        }
    };

    const submitEssay = async () => {
        if (wordCount < minWords * 0.5) {
            setError(`Please write at least ${Math.floor(minWords * 0.5)} words before submitting.`);
            return;
        }
        setError('');
        clearInterval(timerRef.current);
        setStep('grading');

        try {
            const timeTaken = (config.taskType === 1 ? 20 * 60 : 40 * 60) - timeLeft;

            // AI evaluation — use taskInstruction from structured task when prompt is null
            const promptText = structuredTask?.taskInstruction || prompt || '';
            const { evaluation: evalResult, tokensUsed } = await evaluateWriting(
                essay, promptText, config.taskType
            );
            setEvaluation(evalResult);

            // Save writing submission
            await supabase.from('writing_submissions').insert({
                attempt_id: attemptId,
                student_id: profile.id,
                prompt_content_id: contentItem?.id,
                essay_text: essay,
                word_count: wordCount,
                ai_feedback: evalResult,
                ai_band_scores: evalResult.criteria,
                human_review_requested: humanReviewRequested,
                status: humanReviewRequested ? 'submitted' : 'ai_graded',
            });

            // Update attempt
            if (attemptId) {
                await supabase.from('attempts').update({
                    score: evalResult.overallBand,
                    band: evalResult.overallBand,
                    completed_at: new Date().toISOString(),
                    duration_seconds: timeTaken,
                    status: 'completed',
                }).eq('id', attemptId);
            }

            // Log AI usage
            await supabase.from('ai_usage_log').insert({
                organization_id: organization?.id,
                module: 'writing',
                action: 'writing_eval',
                tokens_used: tokensUsed,
                cost_estimate: (tokensUsed / 1000000) * 0.375,
                was_cache_hit: false,
            });

            setStep('results');
        } catch (err) {
            console.error('Grading error:', err);
            setError('AI grading failed. Your essay has been saved and can be reviewed by a teacher.');
            setStep('results');
        }
    };

    // ========== SETUP ==========
    if (step === 'setup') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Writing Practice</h1>
                <p className="page-subtitle">Get an AI-generated prompt and receive instant feedback on your essay.</p>

                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                        background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)',
                    }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <div className="card" style={{ maxWidth: '640px' }}>
                    <h3 style={{ marginBottom: 'var(--space-6)' }}>Test Configuration</h3>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">IELTS Type</label>
                        <div className="tabs" style={{ border: 'none', margin: 0 }}>
                            <button className={`tab ${config.ieltsType === 'academic' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'academic', topic: '', task1Subtype: '' }))}>Academic</button>
                            <button className={`tab ${config.ieltsType === 'general' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'general', topic: '', task1Subtype: '' }))}>General Training</button>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Writing Task</label>
                        <div className="tabs" style={{ border: 'none', margin: 0 }}>
                            <button className={`tab ${config.taskType === 1 ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, taskType: 1, task1Subtype: '' }))}>Task 1 (150+ words)</button>
                            <button className={`tab ${config.taskType === 2 ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, taskType: 2, task1Subtype: '' }))}>Task 2 (250+ words)</button>
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                            {config.taskType === 2
                                ? 'Write an essay responding to a point of view, argument, or problem. Tests critical thinking, coherence, vocabulary, and grammar. (40 min)'
                                : config.ieltsType === 'academic'
                                    ? 'Describe visual information such as a graph, chart, table, map, or process. Summarise key features objectively. (20 min)'
                                    : 'Write a letter (formal, semi-formal, or informal) responding to a given situation. (20 min)'}
                        </p>
                    </div>

                    {config.taskType === 1 && (
                        <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                            <label className="form-label">
                                {config.ieltsType === 'academic' ? 'Visual Type (optional)' : 'Letter Type (optional)'}
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                                {(config.ieltsType === 'academic' ? TASK1_ACADEMIC_TYPES : TASK1_GENERAL_TYPES).map(t => (
                                    <div key={t.key}
                                        onClick={() => setConfig(c => ({ ...c, task1Subtype: c.task1Subtype === t.key ? '' : t.key }))}
                                        style={{
                                            padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                            border: config.task1Subtype === t.key ? '2px solid var(--color-primary)' : '2px solid var(--color-neutral-200)',
                                            background: config.task1Subtype === t.key ? 'var(--color-primary-light, #EEF2FF)' : 'var(--color-neutral-50)',
                                        }}>
                                        <div className="font-medium text-sm">{t.label}</div>
                                        <div className="text-xs text-muted" style={{ marginTop: 2 }}>{t.desc}</div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Leave unselected for a random type.</p>
                        </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                        <label className="form-label">Topic (optional)</label>
                        <select className="form-select" value={config.topic}
                            onChange={(e) => setConfig(c => ({ ...c, topic: e.target.value }))}>
                            <option value="">Random Topic</option>
                            {(config.ieltsType === 'academic' ? TOPICS_ACADEMIC : TOPICS_GENERAL).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>

                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={startTest}>
                        <PenTool size={18} /> Start Writing Test
                    </button>
                </div>
            </div>
        );
    }

    // ========== LOADING ==========
    if (step === 'loading') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <h3 style={{ marginTop: 'var(--space-6)' }}>Generating your writing prompt...</h3>
                <p className="text-muted">Finding the best match from the content library</p>
            </div>
        );
    }

    // ========== WRITING ==========
    if (step === 'writing') {
        const isWarning = timeLeft < 300;

        return (
            <div className="animate-fade-in">
                {/* Timer */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: isWarning ? '#FEF2F2' : 'var(--color-neutral-50)',
                    borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                    border: isWarning ? '1px solid #FECACA' : '1px solid var(--color-neutral-100)',
                }}>
                    <span className="font-semibold">Writing Task {config.taskType}</span>
                    <div className="flex items-center gap-4">
                        <span className={`text-sm ${wordCount >= minWords ? 'font-semibold' : 'text-muted'}`}
                            style={{ color: wordCount >= minWords ? '#22C55E' : undefined }}>
                            {wordCount} / {minWords}+ words
                        </span>
                        <div className="flex items-center gap-2" style={{
                            color: isWarning ? 'var(--color-error)' : 'var(--color-neutral-700)', fontWeight: 600,
                        }}>
                            <Clock size={16} /> {formatTime(timeLeft)}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', minHeight: '70vh' }}>
                    {/* Prompt / Visual */}
                    <div className="card" style={{ overflowY: 'auto' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <BookOpen size={18} /> Writing Task {config.taskType}
                            <span className="badge badge-primary" style={{ marginLeft: 8, fontSize: 'var(--text-xs)' }}>
                                {config.ieltsType === 'academic' ? 'Academic' : 'General Training'}
                            </span>
                        </h3>

                        {structuredTask ? (
                            <VisualTaskDisplay data={structuredTask} />
                        ) : (
                            <div style={{
                                padding: 'var(--space-4)', background: 'var(--color-neutral-50)',
                                borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-primary)',
                                lineHeight: 1.9, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap',
                            }}>
                                {prompt}
                            </div>
                        )}

                        <div className="text-sm text-muted" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' }}>
                            Minimum <strong>{minWords} words</strong> required.
                        </div>
                    </div>

                    {/* Editor */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <PenTool size={18} /> Your Essay
                        </h3>
                        {error && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                                background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-sm)',
                                marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)',
                            }}>
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}
                        <textarea
                            value={essay}
                            onChange={handleEssayChange}
                            placeholder="Start writing your essay here..."
                            style={{
                                flex: 1, minHeight: '400px', resize: 'none',
                                padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-neutral-200)',
                                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                                lineHeight: 1.8, outline: 'none',
                            }}
                        />
                        {hasTeachers && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                marginTop: 'var(--space-4)', padding: 'var(--space-3)',
                                background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)',
                            }}>
                                <input type="checkbox" id="humanReview" checked={humanReviewRequested}
                                    onChange={(e) => setHumanReviewRequested(e.target.checked)} />
                                <label htmlFor="humanReview" className="text-sm" style={{ margin: 0, cursor: 'pointer' }}>
                                    Request teacher review (a human teacher will grade your writing in addition to AI)
                                </label>
                            </div>
                        )}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginTop: 'var(--space-3)',
                        }}>
                            <span className="text-sm text-muted">{wordCount} words</span>
                            <button className="btn btn-primary" onClick={submitEssay}>
                                <Send size={16} /> Submit Essay
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ========== GRADING ==========
    if (step === 'grading') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <h3 style={{ marginTop: 'var(--space-6)' }}>AI is grading your essay...</h3>
                <p className="text-muted">Analyzing task response, coherence, vocabulary, and grammar</p>
            </div>
        );
    }

    // ========== RESULTS ==========
    if (step === 'results') {
        const criteria = evaluation?.criteria || {};

        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Writing Results</h1>

                {/* Overall Band */}
                <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                    <div className="stat-card">
                        <div className="stat-icon red"><Award size={22} /></div>
                        <div className="stat-value">{evaluation?.overallBand || '—'}</div>
                        <div className="stat-label">Overall Band</div>
                    </div>
                    {Object.entries(criteria).map(([key, val], i) => (
                        <div key={key} className="stat-card">
                            <div className={`stat-icon ${['blue', 'green', 'cyan'][i] || 'blue'}`}>
                                <BarChart3 size={22} />
                            </div>
                            <div className="stat-value">{val.band}</div>
                            <div className="stat-label" style={{ fontSize: 'var(--text-xs)' }}>
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Criteria Feedback */}
                <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Detailed Feedback</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {Object.entries(criteria).map(([key, val]) => (
                            <div key={key} style={{
                                padding: 'var(--space-4)',
                                background: 'var(--color-neutral-50)',
                                borderRadius: 'var(--radius-md)',
                            }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
                                    <span className="font-semibold" style={{ textTransform: 'capitalize' }}>
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                    <span className="badge badge-primary">Band {val.band}</span>
                                </div>
                                <p className="text-sm" style={{ color: 'var(--color-neutral-600)', lineHeight: 1.6 }}>
                                    {val.feedback}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Strengths & Improvements */}
                <div className="grid grid-2" style={{ marginBottom: 'var(--space-6)' }}>
                    <div className="card">
                        <h4 className="card-title" style={{ color: '#22C55E', marginBottom: 'var(--space-3)' }}>
                            <CheckCircle size={18} /> Strengths
                        </h4>
                        <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {(evaluation?.strengths || []).map((s, i) => (
                                <li key={i} className="text-sm">{s}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="card">
                        <h4 className="card-title" style={{ color: '#F59E0B', marginBottom: 'var(--space-3)' }}>
                            <TrendingUp size={18} /> Areas to Improve
                        </h4>
                        <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {(evaluation?.improvements || []).map((s, i) => (
                                <li key={i} className="text-sm">{s}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* Model Paragraph */}
                {evaluation?.modelParagraph && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h4 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
                            📝 Model Improvement Example
                        </h4>
                        <div style={{
                            padding: 'var(--space-4)', background: '#F0FDF4',
                            borderRadius: 'var(--radius-md)', borderLeft: '4px solid #22C55E',
                            fontSize: 'var(--text-sm)', lineHeight: 1.8,
                        }}>
                            {evaluation.modelParagraph}
                        </div>
                    </div>
                )}

                <div className="flex gap-3">
                    <button className="btn btn-primary" onClick={() => { setStep('setup'); setEvaluation(null); setEssay(''); }}>
                        <RefreshCw size={16} /> Practice Again
                    </button>
                    <button className="btn btn-outline" onClick={() => window.history.back()}>
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
