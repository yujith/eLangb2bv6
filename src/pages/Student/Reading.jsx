import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateReadingContent } from '../../lib/contentEngine';
import { cleanMarkdown } from '../../lib/aiService';
import { supabase } from '../../lib/supabase';
import {
    BookOpen, Clock, ChevronRight, ChevronLeft, CheckCircle,
    XCircle, AlertCircle, RefreshCw, BarChart3, Award
} from 'lucide-react';

const TOPICS_ACADEMIC = [
    'Climate Change', 'Technology', 'Education', 'Space Exploration',
    'Psychology', 'Economics', 'Biology', 'Architecture',
    'Language', 'Medicine', 'History', 'Environment',
];
const TOPICS_GENERAL = [
    'Health', 'Society', 'Culture', 'Work', 'Advertising',
    'Local Community', 'Transport', 'Housing', 'Tourism', 'Media',
];

const PASSAGES_ACADEMIC = [
    {
        key: 1, label: 'Passage 1',
        desc: 'Descriptive or factual text. Accessible topic, moderate complexity. Tests basic comprehension and detail retrieval.',
    },
    {
        key: 2, label: 'Passage 2',
        desc: 'Discursive or analytical text with opinions and arguments. Intermediate-to-advanced vocabulary.',
    },
    {
        key: 3, label: 'Passage 3',
        desc: 'Longest and most complex. Abstract, argumentative texts from academic journals or research papers.',
    },
];
const PASSAGES_GENERAL = [
    {
        key: 'A', label: 'Section A',
        desc: 'Short everyday texts such as advertisements, notices, schedules, or workplace instructions. Tests skimming and scanning.',
    },
    {
        key: 'B', label: 'Section B',
        desc: 'Longer workplace texts such as company policies, job descriptions, training materials, or staff handbooks.',
    },
    {
        key: 'C', label: 'Section C',
        desc: 'A single general-interest passage of greater length and complexity, similar to Academic Reading in depth.',
    },
];

const QUESTION_TYPES_ACADEMIC = [
    { key: 'mcq', label: 'Multiple Choice' },
    { key: 'tfng', label: 'True / False / Not Given' },
    { key: 'ynng', label: 'Yes / No / Not Given' },
    { key: 'matching_headings', label: 'Matching Headings' },
    { key: 'matching_info', label: 'Matching Information' },
    { key: 'fill_blank', label: 'Sentence Completion' },
    { key: 'summary', label: 'Summary Completion' },
    { key: 'diagram', label: 'Diagram Labelling' },
];
const QUESTION_TYPES_GENERAL = [
    { key: 'mcq', label: 'Multiple Choice' },
    { key: 'tfng', label: 'True / False / Not Given' },
    { key: 'matching_info', label: 'Matching Information' },
    { key: 'fill_blank', label: 'Sentence Completion' },
    { key: 'summary', label: 'Summary Completion' },
    { key: 'short_answer', label: 'Short Answer' },
];

export default function ReadingModule() {
    const { profile, organization } = useAuth();
    const [step, setStep] = useState('setup'); // setup | loading | test | results
    const [config, setConfig] = useState({
        ieltsType: 'academic',
        passage: 1,
        difficulty: 'band_6_7',
        topic: '',
        questionTypes: ['mcq', 'tfng', 'fill_blank'],
    });

    const toggleQuestionType = (key) => {
        setConfig(c => {
            const already = c.questionTypes.includes(key);
            if (already && c.questionTypes.length === 1) return c; // keep at least one
            return {
                ...c,
                questionTypes: already
                    ? c.questionTypes.filter(k => k !== key)
                    : [...c.questionTypes, key],
            };
        });
    };
    const [content, setContent] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentQ, setCurrentQ] = useState(0);
    const [timeLeft, setTimeLeft] = useState(20 * 60); // 20 mins per passage
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);
    const [attemptId, setAttemptId] = useState(null);
    const timerRef = useRef(null);

    // Timer
    useEffect(() => {
        if (step === 'test' && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        handleSubmit();
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

    const startTest = async () => {
        setStep('loading');
        setError('');

        try {
            const topicPool = config.ieltsType === 'academic' ? TOPICS_ACADEMIC : TOPICS_GENERAL;
            const result = await getOrCreateReadingContent({
                topic: config.topic || topicPool[Math.floor(Math.random() * topicPool.length)],
                difficulty: config.difficulty,
                ieltsType: config.ieltsType,
                passage: config.passage,
                questionTypes: config.questionTypes,
                organizationId: organization?.id,
                studentId: profile?.id,
            });

            const ci = result.contentItem;
            // Parse title from first line of body if not already set cleanly
            const rawBody = ci?.body || '';
            const lines = rawBody.split('\n').filter(l => l.trim());
            const parsedTitle = cleanMarkdown(lines[0] || '');
            const parsedBody = cleanMarkdown(lines.slice(1).join('\n').trim());
            setContent({ ...ci, _parsedTitle: parsedTitle, _parsedBody: parsedBody });

            const rawQs = result.questionSet?.questions;
            const qs = Array.isArray(rawQs)
                ? rawQs
                : (typeof rawQs === 'string' ? JSON.parse(rawQs) : []);
            // Clean markdown from question text and explanations
            const cleanQs = qs.map(q => ({
                ...q,
                question: cleanMarkdown(q.question || ''),
                explanation: cleanMarkdown(q.explanation || ''),
                options: q.options ? q.options.map(o => cleanMarkdown(String(o))) : null,
            }));
            setQuestions(cleanQs);
            setAnswers({});

            // Create attempt record
            const { data: attempt } = await supabase.from('attempts').insert({
                student_id: profile.id,
                content_item_id: result.contentItem.id,
                question_set_id: result.questionSet?.id,
                module: 'reading',
                ielts_type: config.ieltsType,
                status: 'in_progress',
            }).select().single();

            if (attempt) setAttemptId(attempt.id);

            setTimeLeft(20 * 60);
            setStep('test');
        } catch (err) {
            console.error('Error starting test:', err);
            setError(err.message || 'Failed to generate reading test. Please try again.');
            setStep('setup');
        }
    };

    const handleAnswer = (questionIndex, answer) => {
        setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    };

    const handleSubmit = async () => {
        clearInterval(timerRef.current);

        // Score the test
        let correct = 0;
        const scoredAnswers = questions.map((q, i) => {
            const studentAnswer = answers[q.index || i] || '';
            const isCorrect = studentAnswer.toLowerCase().trim() ===
                (q.correctAnswer || '').toLowerCase().trim();
            if (isCorrect) correct++;

            return {
                question: q.question,
                studentAnswer,
                correctAnswer: q.correctAnswer,
                isCorrect,
                explanation: q.explanation,
                type: q.type,
            };
        });

        const score = questions.length > 0 ? (correct / questions.length) * 100 : 0;
        const band = scoreToBand(score);
        const timeTaken = (20 * 60) - timeLeft;

        setResults({ scoredAnswers, correct, total: questions.length, score, band, timeTaken });
        setStep('results');

        // Save to database
        if (attemptId) {
            await supabase.from('attempts').update({
                score,
                band,
                completed_at: new Date().toISOString(),
                duration_seconds: timeTaken,
                status: 'completed',
            }).eq('id', attemptId);

            // Save individual answers
            const answerRecords = scoredAnswers.map((a, i) => ({
                attempt_id: attemptId,
                question_index: i,
                student_answer: a.studentAnswer,
                correct_answer: a.correctAnswer,
                is_correct: a.isCorrect,
            }));

            await supabase.from('attempt_answers').insert(answerRecords);
        }
    };

    const scoreToBand = (pct) => {
        if (pct >= 95) return 9;
        if (pct >= 87) return 8.5;
        if (pct >= 80) return 8;
        if (pct >= 72) return 7.5;
        if (pct >= 65) return 7;
        if (pct >= 57) return 6.5;
        if (pct >= 50) return 6;
        if (pct >= 42) return 5.5;
        if (pct >= 35) return 5;
        if (pct >= 27) return 4.5;
        if (pct >= 20) return 4;
        return 3.5;
    };

    // ========== SETUP SCREEN ==========
    if (step === 'setup') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Reading Practice</h1>
                <p className="page-subtitle">Select your preferences and start a timed reading test.</p>

                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                        background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)',
                    }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <div className="card" style={{ maxWidth: '720px' }}>
                    <h3 style={{ marginBottom: 'var(--space-6)' }}>Test Configuration</h3>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">IELTS Type</label>
                        <div className="tabs" style={{ border: 'none', margin: 0 }}>
                            <button className={`tab ${config.ieltsType === 'academic' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'academic', topic: '', passage: 1, questionTypes: ['mcq', 'tfng', 'fill_blank'] }))}>Academic</button>
                            <button className={`tab ${config.ieltsType === 'general' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'general', topic: '', passage: 'A', questionTypes: ['mcq', 'tfng', 'fill_blank'] }))}>General Training</button>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">
                            {config.ieltsType === 'academic' ? 'Passage' : 'Section'}
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {(config.ieltsType === 'academic' ? PASSAGES_ACADEMIC : PASSAGES_GENERAL).map(p => (
                                <div key={p.key}
                                    onClick={() => setConfig(c => ({ ...c, passage: p.key }))}
                                    style={{
                                        padding: 'var(--space-3) var(--space-4)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        border: config.passage === p.key
                                            ? '2px solid var(--color-primary)'
                                            : '2px solid var(--color-neutral-200)',
                                        background: config.passage === p.key
                                            ? 'var(--color-primary-light, #EEF2FF)'
                                            : 'var(--color-neutral-50)',
                                        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                                    }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: config.passage === p.key ? 'var(--color-primary)' : 'var(--color-neutral-200)',
                                        color: config.passage === p.key ? 'white' : 'var(--color-neutral-600)',
                                        fontWeight: 700, fontSize: 'var(--text-sm)',
                                    }}>{p.key}</div>
                                    <div>
                                        <div className="font-medium text-sm">{p.label}</div>
                                        <div className="text-xs text-muted" style={{ marginTop: 2, lineHeight: 1.5 }}>{p.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Question Types <span className="text-xs text-muted">(select all you want to practise)</span></label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                            {(config.ieltsType === 'academic' ? QUESTION_TYPES_ACADEMIC : QUESTION_TYPES_GENERAL).map(qt => {
                                const selected = config.questionTypes.includes(qt.key);
                                return (
                                    <button key={qt.key}
                                        onClick={() => toggleQuestionType(qt.key)}
                                        style={{
                                            padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--text-xs)',
                                            border: selected ? '1.5px solid var(--color-primary)' : '1.5px solid var(--color-neutral-300)',
                                            background: selected ? 'var(--color-primary)' : 'white',
                                            color: selected ? 'white' : 'var(--color-neutral-600)',
                                            cursor: 'pointer', fontWeight: selected ? 600 : 400,
                                        }}>
                                        {qt.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>40 questions per full test. At least one type must be selected.</p>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Difficulty Level</label>
                        <select className="form-select" value={config.difficulty}
                            onChange={(e) => setConfig(c => ({ ...c, difficulty: e.target.value }))}>
                            <option value="band_4_5">Band 4–5 (Beginner)</option>
                            <option value="band_6_7">Band 6–7 (Intermediate)</option>
                            <option value="band_8_9">Band 8–9 (Advanced)</option>
                        </select>
                    </div>

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
                        <BookOpen size={18} /> Start Reading Test
                    </button>
                </div>
            </div>
        );
    }

    // ========== LOADING SCREEN ==========
    if (step === 'loading') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <h3 style={{ marginTop: 'var(--space-6)' }}>Preparing your reading test...</h3>
                <p className="text-muted">Searching content library for the best match</p>
            </div>
        );
    }

    // ========== TEST SCREEN ==========
    if (step === 'test') {
        const currentQuestion = questions[currentQ];
        const isWarning = timeLeft < 300;

        return (
            <div className="animate-fade-in">
                {/* Timer Bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: isWarning ? '#FEF2F2' : 'var(--color-neutral-50)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                    border: isWarning ? '1px solid #FECACA' : '1px solid var(--color-neutral-100)',
                }}>
                    <span className="font-semibold">
                        Reading Test — {config.ieltsType === 'academic' ? 'Academic' : 'General Training'}
                    </span>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted">
                            {Object.keys(answers).length}/{questions.length} answered
                        </span>
                        <div className="flex items-center gap-2" style={{
                            color: isWarning ? 'var(--color-error)' : 'var(--color-neutral-700)',
                            fontWeight: 600,
                        }}>
                            <Clock size={16} /> {formatTime(timeLeft)}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', minHeight: '70vh' }}>
                    {/* Passage */}
                    <div className="card" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                        <div style={{ marginBottom: 'var(--space-2)' }}>
                            <span className="badge badge-primary" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)', display: 'inline-block' }}>
                                {config.ieltsType === 'academic' ? 'Academic' : 'General Training'}
                            </span>
                            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
                                {content?._parsedTitle || content?.title || 'Reading Passage'}
                            </h3>
                        </div>
                        <div style={
                            { borderTop: '1px solid var(--color-neutral-100)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-4)' }
                        }>
                            {(content?._parsedBody || '').split('\n\n').map((para, i) => (
                                <p key={i} style={{
                                    lineHeight: 1.85, fontSize: 'var(--text-sm)',
                                    color: 'var(--color-neutral-700)', marginBottom: 'var(--space-4)',
                                }}>{para}</p>
                            ))}
                        </div>
                    </div>

                    {/* Questions Panel */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)',
                            borderBottom: '1px solid var(--color-neutral-100)',
                        }}>
                            <h4>Question {currentQ + 1} of {questions.length}</h4>
                            <span className={`badge ${currentQuestion?.type === 'mcq' ? 'badge-info' : currentQuestion?.type === 'tfng' ? 'badge-warning' : 'badge-neutral'}`}>
                                {currentQuestion?.type?.replace('_', ' ')?.toUpperCase()}
                            </span>
                        </div>

                        {currentQuestion && (
                            <div style={{ flex: 1 }}>
                                <p className="font-medium" style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--text-base)', lineHeight: 1.6 }}>
                                    {currentQuestion.question}
                                </p>

                                {/* MCQ Options */}
                                {currentQuestion.options && currentQuestion.options.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                        {currentQuestion.options.map((opt, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleAnswer(currentQuestion.index || currentQ, opt)}
                                                style={{
                                                    padding: 'var(--space-3) var(--space-4)',
                                                    border: `2px solid ${answers[currentQuestion.index || currentQ] === opt ? 'var(--color-primary)' : 'var(--color-neutral-200)'}`,
                                                    borderRadius: 'var(--radius-md)',
                                                    background: answers[currentQuestion.index || currentQ] === opt ? 'var(--color-primary-light)' : '#fff',
                                                    textAlign: 'left',
                                                    cursor: 'pointer',
                                                    transition: 'all var(--transition-fast)',
                                                    fontSize: 'var(--text-sm)',
                                                }}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                ) : currentQuestion.type === 'tfng' ? (
                                    /* True/False/Not Given */
                                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                        {['TRUE', 'FALSE', 'NOT GIVEN'].map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => handleAnswer(currentQuestion.index || currentQ, opt)}
                                                className={`btn ${answers[currentQuestion.index || currentQ] === opt ? 'btn-primary' : 'btn-outline'}`}
                                                style={{ flex: 1 }}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    /* Text Input */
                                    <input
                                        className="form-input"
                                        placeholder="Type your answer..."
                                        value={answers[currentQuestion.index || currentQ] || ''}
                                        onChange={(e) => handleAnswer(currentQuestion.index || currentQ, e.target.value)}
                                    />
                                )}
                            </div>
                        )}

                        {/* Navigation */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)',
                            borderTop: '1px solid var(--color-neutral-100)',
                        }}>
                            <button
                                className="btn btn-outline btn-sm"
                                disabled={currentQ === 0}
                                onClick={() => setCurrentQ(c => c - 1)}
                            >
                                <ChevronLeft size={16} /> Previous
                            </button>

                            {/* Question dots */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '200px' }}>
                                {questions.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentQ(i)}
                                        style={{
                                            width: 24, height: 24, borderRadius: '50%',
                                            border: i === currentQ ? '2px solid var(--color-primary)' : '1px solid var(--color-neutral-200)',
                                            background: answers[questions[i]?.index || i] ? 'var(--color-primary)' : i === currentQ ? 'var(--color-primary-light)' : '#fff',
                                            color: answers[questions[i]?.index || i] ? '#fff' : 'var(--color-neutral-600)',
                                            fontSize: '10px', fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>

                            {currentQ < questions.length - 1 ? (
                                <button className="btn btn-primary btn-sm" onClick={() => setCurrentQ(c => c + 1)}>
                                    Next <ChevronRight size={16} />
                                </button>
                            ) : (
                                <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
                                    Submit Test
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ========== RESULTS SCREEN ==========
    if (step === 'results' && results) {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Test Results</h1>

                {/* Score Overview */}
                <div className="grid grid-4" style={{ marginBottom: 'var(--space-8)' }}>
                    <div className="stat-card">
                        <div className="stat-icon red"><Award size={22} /></div>
                        <div className="stat-value">{results.band}</div>
                        <div className="stat-label">Band Score</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon green"><CheckCircle size={22} /></div>
                        <div className="stat-value">{results.correct}/{results.total}</div>
                        <div className="stat-label">Correct</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon blue"><BarChart3 size={22} /></div>
                        <div className="stat-value">{Math.round(results.score)}%</div>
                        <div className="stat-label">Accuracy</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon cyan"><Clock size={22} /></div>
                        <div className="stat-value">{formatTime(results.timeTaken)}</div>
                        <div className="stat-label">Time Taken</div>
                    </div>
                </div>

                {/* Answer Review */}
                <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Answer Review</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {results.scoredAnswers.map((a, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                                padding: 'var(--space-3) var(--space-4)',
                                background: a.isCorrect ? '#F0FDF4' : '#FEF2F2',
                                borderRadius: 'var(--radius-md)',
                                borderLeft: `3px solid ${a.isCorrect ? '#22C55E' : '#EF4444'}`,
                            }}>
                                <div style={{ marginTop: '2px' }}>
                                    {a.isCorrect
                                        ? <CheckCircle size={16} style={{ color: '#22C55E' }} />
                                        : <XCircle size={16} style={{ color: '#EF4444' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p className="font-medium text-sm" style={{ marginBottom: '4px' }}>
                                        Q{i + 1}: {a.question}
                                    </p>
                                    {!a.isCorrect && (
                                        <p className="text-sm">
                                            <span style={{ color: '#EF4444' }}>Your answer: {a.studentAnswer || '(empty)'}</span>
                                            <span className="text-muted"> → </span>
                                            <span style={{ color: '#22C55E', fontWeight: 600 }}>Correct: {a.correctAnswer}</span>
                                        </p>
                                    )}
                                    {a.explanation && (
                                        <p className="text-xs text-muted" style={{ marginTop: '4px' }}>{a.explanation}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3">
                    <button className="btn btn-primary" onClick={() => { setStep('setup'); setResults(null); }}>
                        <RefreshCw size={16} /> Take Another Test
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
