import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createRealtimeSession } from '../../lib/realtimeSpeaking';
import { evaluateTranscript, saveSpeakingSession } from '../../lib/speakingScorer';
import {
    Mic, MicOff, Play, Pause, Award, Clock, ChevronRight,
    AlertCircle, RefreshCw, CheckCircle, Volume2, Star, Calendar,
    BarChart3, BookOpen, Zap
} from 'lucide-react';

const STAGES = [
    { key: 'part1', label: 'Part 1', desc: 'Introduction' },
    { key: 'part2_prep', label: 'Part 2 Prep', desc: '60s notes' },
    { key: 'part2', label: 'Part 2', desc: 'Long Turn' },
    { key: 'part2_followup', label: 'Follow-up', desc: 'Questions' },
    { key: 'part3', label: 'Part 3', desc: 'Discussion' },
    { key: 'finished', label: 'Finished', desc: 'Done' },
];

const BAND_COLOR = (band) => {
    if (!band) return '#9CA3AF';
    if (band >= 7.5) return '#16A34A';
    if (band >= 6.5) return '#2563EB';
    if (band >= 5.5) return '#D97706';
    return '#DC2626';
};

export default function SpeakingSimulator() {
    const { profile, organization } = useAuth();
    const [step, setStep] = useState('start'); // start | connecting | test | scoring | report
    const [stage, setStage] = useState('part1');
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState('');
    const [agentSpeaking, setAgentSpeaking] = useState(false);
    const [scoreReport, setScoreReport] = useState(null);
    const [recordings, setRecordings] = useState(null);
    const [startedAt, setStartedAt] = useState(null);
    const [completedAt, setCompletedAt] = useState(null);
    const [sessionId, setSessionId] = useState(null);

    // Part 2 prep
    const [prepTimeLeft, setPrepTimeLeft] = useState(60);
    const [speakTimeLeft, setSpeakTimeLeft] = useState(120);
    const [notes, setNotes] = useState('');
    const prepTimerRef = useRef(null);
    const speakTimerRef = useRef(null);

    // Audio playback
    const [playingPart, setPlayingPart] = useState(null);
    const audioRef = useRef(null);

    // Session ref
    const sessionRef = useRef(null);
    const transcriptRef = useRef([]);

    // Premium check
    const isPremium = organization?.is_premium === true;

    const handleStageChange = useCallback((newStage) => {
        setStage(newStage);

        if (newStage === 'part2_prep') {
            setPrepTimeLeft(60);
            prepTimerRef.current = setInterval(() => {
                setPrepTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(prepTimerRef.current);
                        // Auto-advance to Part 2 speaking
                        sessionRef.current?.advancePart('part2');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        if (newStage === 'part2') {
            clearInterval(prepTimerRef.current);
            setSpeakTimeLeft(120);
            speakTimerRef.current = setInterval(() => {
                setSpeakTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(speakTimerRef.current);
                        // Speaking time is up — advance to follow-up questions
                        sessionRef.current?.advancePart('part2_followup');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        if (newStage === 'part2_followup') {
            clearInterval(speakTimerRef.current);
        }

        if (newStage === 'part3') {
            clearInterval(prepTimerRef.current);
            clearInterval(speakTimerRef.current);
        }

        if (newStage === 'finished') {
            clearInterval(prepTimerRef.current);
            clearInterval(speakTimerRef.current);
        }
    }, []);

    const handleTranscriptUpdate = useCallback((entry) => {
        transcriptRef.current = [...transcriptRef.current, entry];
        setTranscript(prev => [...prev, entry]);
    }, []);

    const handleSessionEnd = useCallback(async () => {
        const endTime = new Date().toISOString();
        setCompletedAt(endTime);

        // Get recordings
        const recs = sessionRef.current?.getRecordings();
        setRecordings(recs);

        // Start scoring
        setStep('scoring');

        try {
            const fullTranscript = transcriptRef.current;
            const report = await evaluateTranscript(fullTranscript);
            setScoreReport(report);

            // Save to database
            const saved = await saveSpeakingSession({
                studentId: profile.id,
                organizationId: organization?.id,
                transcript: fullTranscript,
                scoreReport: report,
                recordings: recs,
                startedAt: startedAt,
                completedAt: endTime,
            });
            setSessionId(saved?.id);
        } catch (err) {
            console.error('Scoring/save error:', err);
            setScoreReport({
                overallBand: null,
                error: err.message,
                isFallback: true,
                subScores: {},
                strengths: [],
                improvements: [],
                practicePlan: [],
            });
        }

        setStep('report');
    }, [profile, organization, startedAt]);

    const startTest = async () => {
        setError('');
        setStep('connecting');
        setTranscript([]);
        transcriptRef.current = [];
        setStage('part1');
        setNotes('');
        setScoreReport(null);
        setRecordings(null);
        setStartedAt(new Date().toISOString());

        let errorFired = false;
        const session = createRealtimeSession({
            onStageChange: handleStageChange,
            onTranscriptUpdate: handleTranscriptUpdate,
            onError: (err) => {
                if (errorFired) return;
                errorFired = true;
                console.error('[SpeakingTest] Error:', err.message);
                setError(err.message);
                setStep('start');
            },
            onSessionEnd: handleSessionEnd,
            onAgentSpeaking: setAgentSpeaking,
        });

        sessionRef.current = session;

        try {
            await session.connect();
            setStep('test');
        } catch (err) {
            setError(err.message);
            setStep('start');
        }
    };

    const endTestEarly = () => {
        if (confirm('Are you sure you want to end the test? Your session will still be scored.')) {
            sessionRef.current?.disconnect();
        }
    };

    // Warn before page reload/navigation during active test
    useEffect(() => {
        if (step === 'test' || step === 'connecting') {
            const handler = (e) => { e.preventDefault(); };
            window.addEventListener('beforeunload', handler);
            return () => window.removeEventListener('beforeunload', handler);
        }
    }, [step]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearInterval(prepTimerRef.current);
            clearInterval(speakTimerRef.current);
            sessionRef.current?.disconnect();
        };
    }, []);

    const formatTime = (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

    const playPartRecording = (partKey) => {
        if (!recordings?.partRecordings?.[partKey]) return;
        if (playingPart === partKey) {
            audioRef.current?.pause();
            setPlayingPart(null);
            return;
        }
        const url = URL.createObjectURL(recordings.partRecordings[partKey]);
        if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.play();
            setPlayingPart(partKey);
            audioRef.current.onended = () => setPlayingPart(null);
        }
    };

    // ==================== START SCREEN ====================
    if (step === 'start') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">IELTS Speaking Test Simulator</h1>
                <p className="page-subtitle">
                    Practice with a real-time AI examiner. Get scored on all four IELTS Speaking criteria.
                </p>

                {!isPremium && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                        background: '#FEF3C7', color: '#92400E', borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)',
                    }}>
                        <Star size={16} /> This feature is available for Premium organizations.
                        Contact your admin to upgrade.
                    </div>
                )}

                {error && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                        background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)',
                    }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                <div className="card" style={{ maxWidth: '680px' }}>
                    <h3 style={{ marginBottom: 'var(--space-5)' }}>How It Works</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                        {[
                            { icon: Mic, title: 'Real-time Conversation', desc: 'Speak naturally with an AI examiner using your microphone.' },
                            { icon: Clock, title: 'Full Test Structure', desc: 'All 3 parts: Introduction (4-5 min), Long Turn (3-4 min), Discussion (4-5 min).' },
                            { icon: BookOpen, title: 'Part 2 Cue Card', desc: '60-second prep time with a notes box, then 2-minute speaking turn.' },
                            { icon: Award, title: 'Detailed Score Report', desc: 'Band scores for all 4 criteria, evidence from your speech, and a 7-day practice plan.' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3)',
                                background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                                    background: 'var(--color-primary-light, #EEF2FF)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <item.icon size={18} style={{ color: 'var(--color-primary)' }} />
                                </div>
                                <div>
                                    <div className="font-semibold text-sm">{item.title}</div>
                                    <div className="text-xs text-muted">{item.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        padding: 'var(--space-3)', background: '#FFF7ED',
                        borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)',
                        fontSize: 'var(--text-xs)', color: '#9A3412',
                    }}>
                        <strong>Requirements:</strong> A working microphone and speakers/headphones. The test takes approximately 11-14 minutes.
                        Ensure you are in a quiet environment.
                    </div>

                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '14px', fontSize: 'var(--text-base)' }}
                        onClick={startTest}
                        disabled={!isPremium}
                    >
                        <Mic size={20} /> Start Speaking Test
                    </button>
                </div>
            </div>
        );
    }

    // ==================== CONNECTING ====================
    if (step === 'connecting') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <h3 style={{ marginTop: 'var(--space-6)' }}>Connecting to examiner...</h3>
                <p className="text-muted">Setting up your microphone and AI examiner session</p>
            </div>
        );
    }

    // ==================== TEST IN PROGRESS ====================
    if (step === 'test') {
        const currentStageIdx = STAGES.findIndex(s => s.key === stage);

        return (
            <div className="animate-fade-in">
                {/* Stage Indicator */}
                <div style={{
                    display: 'flex', gap: '4px', marginBottom: 'var(--space-4)',
                    background: 'var(--color-neutral-50)', padding: 'var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                }}>
                    {STAGES.map((s, i) => (
                        <div key={s.key} style={{
                            flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                            background: i === currentStageIdx ? 'var(--color-primary)' : i < currentStageIdx ? '#DCFCE7' : 'transparent',
                            color: i === currentStageIdx ? '#fff' : i < currentStageIdx ? '#16A34A' : 'var(--color-neutral-400)',
                            textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: i === currentStageIdx ? 600 : 400,
                            transition: 'all 0.3s',
                        }}>
                            <div>{s.label}</div>
                            <div style={{ fontSize: '10px', opacity: 0.8 }}>{s.desc}</div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                    {/* Left: Examiner & Controls */}
                    <div className="card">
                        <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)' }}>
                            <h3 className="card-title">
                                <Volume2 size={18} /> Examiner
                            </h3>
                            {agentSpeaking && (
                                <span className="badge badge-primary" style={{ animation: 'pulse 1.5s infinite' }}>
                                    Speaking...
                                </span>
                            )}
                        </div>

                        {/* Audio visualizer placeholder */}
                        <div style={{
                            height: 80, borderRadius: 'var(--radius-md)',
                            background: agentSpeaking
                                ? 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.2))'
                                : 'var(--color-neutral-50)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 'var(--space-4)',
                            transition: 'background 0.3s',
                        }}>
                            {agentSpeaking ? (
                                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} style={{
                                            width: 4, borderRadius: 2,
                                            background: 'var(--color-primary)',
                                            animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                                            height: `${20 + Math.random() * 30}px`,
                                        }} />
                                    ))}
                                </div>
                            ) : (
                                <Mic size={24} style={{ color: 'var(--color-neutral-300)' }} />
                            )}
                        </div>

                        {/* Part 2 prep timer */}
                        {stage === 'part2_prep' && (
                            <div style={{
                                padding: 'var(--space-4)', background: '#FFF7ED',
                                borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                                borderLeft: '4px solid #F59E0B',
                            }}>
                                <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
                                    <span className="font-semibold text-sm">Preparation Time</span>
                                    <span style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: prepTimeLeft <= 10 ? '#DC2626' : '#D97706' }}>
                                        {formatTime(prepTimeLeft)}
                                    </span>
                                </div>
                                <textarea
                                    className="form-input"
                                    rows={3}
                                    placeholder="Write your notes here..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    style={{ fontSize: 'var(--text-sm)' }}
                                />
                            </div>
                        )}

                        {/* Part 2 speaking timer */}
                        {stage === 'part2' && (
                            <div style={{
                                padding: 'var(--space-3)', background: '#F0FDF4',
                                borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                borderLeft: '4px solid #22C55E',
                            }}>
                                <span className="font-semibold text-sm">Speaking Time</span>
                                <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: speakTimeLeft <= 30 ? '#DC2626' : '#16A34A' }}>
                                    {formatTime(speakTimeLeft)}
                                </span>
                            </div>
                        )}

                        {/* Part 2 follow-up questions indicator */}
                        {stage === 'part2_followup' && (
                            <div style={{
                                padding: 'var(--space-3)', background: '#EEF2FF',
                                borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                                display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                borderLeft: '4px solid var(--color-primary)',
                            }}>
                                <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
                                <span className="font-semibold text-sm" style={{ color: 'var(--color-primary)' }}>
                                    Follow-up Questions
                                </span>
                            </div>
                        )}

                        {/* Recording indicator */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                            padding: 'var(--space-3)', background: '#FEF2F2',
                            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)',
                        }}>
                            <div style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: '#EF4444', animation: 'pulse 1.5s infinite',
                            }} />
                            <span className="text-sm" style={{ color: '#DC2626' }}>Recording in progress</span>
                        </div>

                        <button className="btn btn-outline btn-sm" onClick={endTestEarly}
                            style={{ width: '100%', color: 'var(--color-error)', borderColor: 'var(--color-error)' }}>
                            <MicOff size={16} /> End Test Early
                        </button>
                    </div>

                    {/* Right: Live Transcript */}
                    <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            Live Transcript
                        </h3>
                        <div style={{
                            flex: 1, maxHeight: '400px', overflowY: 'auto',
                            display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
                            padding: 'var(--space-2)',
                        }}>
                            {transcript.length === 0 ? (
                                <p className="text-sm text-muted" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                                    Waiting for examiner to begin...
                                </p>
                            ) : transcript.map((entry, i) => (
                                <div key={i} style={{
                                    display: 'flex', gap: 'var(--space-2)',
                                    justifyContent: entry.role === 'candidate' ? 'flex-end' : 'flex-start',
                                }}>
                                    <div style={{
                                        maxWidth: '85%', padding: '8px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        background: entry.role === 'examiner' ? 'var(--color-neutral-50)' : 'var(--color-primary-light, #EEF2FF)',
                                        fontSize: 'var(--text-sm)', lineHeight: 1.5,
                                    }}>
                                        <div className="text-xs font-medium" style={{
                                            color: entry.role === 'examiner' ? 'var(--color-neutral-500)' : 'var(--color-primary)',
                                            marginBottom: 2,
                                        }}>
                                            {entry.role === 'examiner' ? 'Examiner' : 'You'}
                                        </div>
                                        {entry.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <audio ref={audioRef} style={{ display: 'none' }} />

                <style>{`
                    @keyframes soundwave {
                        from { height: 8px; }
                        to { height: 40px; }
                    }
                `}</style>
            </div>
        );
    }

    // ==================== SCORING ====================
    if (step === 'scoring') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <h3 style={{ marginTop: 'var(--space-6)' }}>Analyzing your speaking performance...</h3>
                <p className="text-muted">Evaluating fluency, vocabulary, grammar, and pronunciation</p>
            </div>
        );
    }

    // ==================== SCORE REPORT ====================
    if (step === 'report') {
        const report = scoreReport || {};
        const sub = report.subScores || {};
        const metrics = report.fluencyMetrics || {};
        const plan = report.practicePlan || [];

        const subScoreEntries = [
            { key: 'fluencyCoherence', label: 'Fluency & Coherence', icon: Zap },
            { key: 'lexicalResource', label: 'Lexical Resource', icon: BookOpen },
            { key: 'grammaticalRange', label: 'Grammatical Range', icon: BarChart3 },
            { key: 'pronunciation', label: 'Pronunciation', icon: Volume2 },
        ];

        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Speaking Test Score Report</h1>

                {report.isFallback && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px',
                        background: '#FEF3C7', color: '#92400E', borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)',
                    }}>
                        <AlertCircle size={16} />
                        Scoring was limited: {report.error || 'Unknown error'}. Please try again for a full score report.
                    </div>
                )}

                {/* Overall Band */}
                <div className="card" style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                    <div style={{
                        width: 100, height: 100, borderRadius: '50%',
                        background: `${BAND_COLOR(report.overallBand)}15`,
                        border: `4px solid ${BAND_COLOR(report.overallBand)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto var(--space-4)',
                    }}>
                        <span style={{ fontSize: '2rem', fontWeight: 800, color: BAND_COLOR(report.overallBand) }}>
                            {report.overallBand ?? '—'}
                        </span>
                    </div>
                    <h2 style={{ marginBottom: 4 }}>Overall Band Score</h2>
                    <p className="text-muted">Based on the official IELTS Speaking band descriptors</p>
                </div>

                {/* Sub-scores */}
                <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)', gap: 'var(--space-4)' }}>
                    {subScoreEntries.map(({ key, label, icon: Icon }) => {
                        const score = sub[key];
                        return (
                            <div key={key} className="card" style={{ textAlign: 'center' }}>
                                <Icon size={22} style={{ color: BAND_COLOR(score?.band), margin: '0 auto var(--space-2)' }} />
                                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: BAND_COLOR(score?.band) }}>
                                    {score?.band ?? '—'}
                                </div>
                                <div className="text-xs font-medium" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
                                {score?.evidence?.length > 0 && (
                                    <div className="text-xs text-muted" style={{ fontStyle: 'italic' }}>
                                        "{score.evidence[0]?.substring(0, 80)}..."
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Fluency Metrics */}
                {Object.keys(metrics).length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <BarChart3 size={18} /> Fluency Metrics
                        </h3>
                        <div className="grid grid-4" style={{ gap: 'var(--space-4)' }}>
                            {[
                                { label: 'Est. WPM', value: metrics.estimatedWPM || '—', desc: 'Words per minute' },
                                { label: 'Filler Rate', value: metrics.fillerWordRate != null ? `${(metrics.fillerWordRate * 100).toFixed(1)}%` : '—', desc: 'Filler word frequency' },
                                { label: 'Self-Corrections', value: metrics.selfCorrections ?? '—', desc: 'Times you corrected yourself' },
                                { label: 'Cohesive Devices', value: metrics.cohesiveDeviceCount ?? '—', desc: 'Linking words used' },
                            ].map((m, i) => (
                                <div key={i} style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{m.value}</div>
                                    <div className="text-xs font-medium">{m.label}</div>
                                    <div className="text-xs text-muted">{m.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Strengths & Improvements */}
                <div className="grid grid-2" style={{ gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    {report.strengths?.length > 0 && (
                        <div className="card">
                            <h4 className="card-title" style={{ marginBottom: 'var(--space-3)', color: '#16A34A' }}>
                                <CheckCircle size={16} /> Strengths
                            </h4>
                            <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {report.strengths.map((s, i) => (
                                    <li key={i} className="text-sm">{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {report.improvements?.length > 0 && (
                        <div className="card">
                            <h4 className="card-title" style={{ marginBottom: 'var(--space-3)', color: '#D97706' }}>
                                <AlertCircle size={16} /> Areas to Improve
                            </h4>
                            <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {report.improvements.map((s, i) => (
                                    <li key={i} className="text-sm">{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Audio Playback */}
                {recordings && Object.keys(recordings.partRecordings || {}).length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <Play size={18} /> Playback Your Recording
                        </h3>
                        <div className="flex gap-3">
                            {['part1', 'part2', 'part3'].map(part => {
                                const hasRecording = recordings.partRecordings?.[part];
                                return (
                                    <button key={part}
                                        className={`btn ${playingPart === part ? 'btn-primary' : 'btn-outline'} btn-sm`}
                                        onClick={() => playPartRecording(part)}
                                        disabled={!hasRecording}
                                    >
                                        {playingPart === part ? <Pause size={14} /> : <Play size={14} />}
                                        {part.replace('part', 'Part ')}
                                    </button>
                                );
                            })}
                        </div>
                        <audio ref={audioRef} style={{ display: 'none' }} />
                    </div>
                )}

                {/* 7-Day Practice Plan */}
                {plan.length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <Calendar size={18} /> 7-Day Practice Plan
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {plan.map((day, i) => (
                                <div key={i} style={{
                                    display: 'flex', gap: 'var(--space-3)',
                                    padding: 'var(--space-3)', background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%',
                                        background: 'var(--color-primary)', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, fontSize: 'var(--text-sm)', flexShrink: 0,
                                    }}>
                                        {day.day || i + 1}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-sm">{day.focus}</div>
                                        <div className="text-xs text-muted">{day.activity}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 justify-center">
                    <button className="btn btn-primary" onClick={() => {
                        setStep('start');
                        setScoreReport(null);
                        setRecordings(null);
                        setTranscript([]);
                    }}>
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
