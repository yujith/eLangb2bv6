import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createRealtimeSession } from '../../lib/realtimeSpeaking';
import { evaluateTranscript, saveSpeakingSession } from '../../lib/speakingScorer';
import { generateCueCardForTopic } from '../../lib/aiService';
import { buildFallbackCueCard, createSpeakingSessionPlan } from '../../lib/speakingInstructions';
import SpeakingPrepScreen from '../../components/SpeakingPrepScreen';
import {
    Mic, MicOff, Play, Pause, Award, Clock, ChevronRight,
    AlertCircle, RefreshCw, CheckCircle, Volume2, Star, Calendar,
    BarChart3, BookOpen, Zap
} from 'lucide-react';

const BAND_COLOR = (band) => {
    if (!band) return '#9CA3AF';
    if (band >= 7.5) return '#16A34A';
    if (band >= 6.5) return '#2563EB';
    if (band >= 5.5) return '#D97706';
    return '#DC2626';
};

export default function SpeakingSimulatorBeta() {
    const { profile, organization } = useAuth();
    const [step, setStep] = useState('start'); // start | connecting | test | scoring | report
    const [stage, setStage] = useState('part1');
    const [transcript, setTranscript] = useState([]);
    const [error, setError] = useState('');
    const [agentSpeaking, setAgentSpeaking] = useState(false);
    const [stageNotice, setStageNotice] = useState('Examiner is preparing your test...');
    const [scoreReport, setScoreReport] = useState(null);
    const [startedAt, setStartedAt] = useState(null);

    // Part 2 prep
    const [showPrepScreen, setShowPrepScreen] = useState(false);
    const [cueCardText, setCueCardText] = useState('');
    const [prepTimeLeft, setPrepTimeLeft] = useState(60);
    const [speakTimeLeft, setSpeakTimeLeft] = useState(120);
    const [notes, setNotes] = useState('');
    const prepTimerRef = useRef(null);
    const speakTimerRef = useRef(null);

    // Stage badges (auto-fade)
    const [showStageBadge, setShowStageBadge] = useState(false);
    const [stageBadgeText, setStageBadgeText] = useState('');
    const badgeTimerRef = useRef(null);

    // Audio playback
    const examinerWaveHeights = [24, 34, 28, 40, 30];

    // Session ref
    const sessionRef = useRef(null);
    const transcriptRef = useRef([]);
    const sessionPlanRef = useRef(null);

    // Premium check
    const isPremium = organization?.is_premium === true;

    const getTiming = useCallback((key, fallback) => {
        const value = sessionPlanRef.current?.timing?.[key];
        return typeof value === 'number' ? value : fallback;
    }, []);

    const showBadge = (text) => {
        setStageBadgeText(text);
        setShowStageBadge(true);
        clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = setTimeout(() => {
            setShowStageBadge(false);
        }, 20000); // 20 seconds
    };

    const handleStageChange = useCallback(async (newStage) => {
        setStage(newStage);

        if (newStage === 'part1') {
            showBadge('Part 1: Introduction');
            setStageNotice('Answer naturally and wait for one question at a time.');
        }

        if (newStage === 'part2_prep') {
            const plannedCueCard = sessionPlanRef.current?.cueCardText;
            const prepSeconds = getTiming('part2PrepSeconds', 60);
            setCueCardText(plannedCueCard || buildFallbackCueCard(sessionPlanRef.current?.part2Topic));
            setStageNotice('Read the cue card carefully and make quick notes before you start speaking.');

            clearInterval(prepTimerRef.current);
            setShowPrepScreen(true);
            setPrepTimeLeft(prepSeconds);
            prepTimerRef.current = setInterval(() => {
                setPrepTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(prepTimerRef.current);
                        setShowPrepScreen(false);
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
            setShowPrepScreen(false);
            setSpeakTimeLeft(getTiming('part2SpeakSeconds', 120));
            setStageNotice('Speak continuously and naturally. You will only be prompted if you sound completely finished.');
            clearInterval(speakTimerRef.current);
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
            setStageNotice('Listen for one short follow-up question at a time, then answer fully.');
        }

        if (newStage === 'part3') {
            clearInterval(prepTimerRef.current);
            clearInterval(speakTimerRef.current);
            showBadge('Part 3: Discussion');
            setStageNotice('Expect broader discussion questions. Take a moment to think, then answer clearly.');
        }

        if (newStage === 'finished') {
            clearInterval(prepTimerRef.current);
            clearInterval(speakTimerRef.current);
            setStageNotice('Your speaking test is complete. Preparing your report...');
        }
    }, [getTiming]);

    const handleTranscriptUpdate = useCallback((entry) => {
        transcriptRef.current = [...transcriptRef.current, entry];
        setTranscript(prev => [...prev, entry]);
    }, []);

    const handleSessionEnd = useCallback(async () => {
        // Get recordings
        const recs = sessionRef.current?.getRecordings();

        // Start scoring
        setStep('scoring');

        try {
            const fullTranscript = transcriptRef.current;
            const report = await evaluateTranscript(fullTranscript);
            setScoreReport(report);

            // Save to database with prep notes
            await saveSpeakingSession({
                studentId: profile.id,
                organizationId: organization?.id,
                transcript: fullTranscript,
                scoreReport: report,
                recordings: recs,
                startedAt: startedAt,
                prepNotes: notes, // Include prep notes
            });
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
    }, [profile, organization, startedAt, notes]);

    const startTest = async () => {
        setError('');
        setStep('connecting');
        setTranscript([]);
        transcriptRef.current = [];
        sessionPlanRef.current = null;
        setStage('part1');
        setNotes('');
        setCueCardText('');
        setScoreReport(null);
        setStageNotice('Examiner is preparing your test...');
        setStartedAt(new Date().toISOString());

        try {
            const draftPlan = createSpeakingSessionPlan();
            const normalizedTopic = draftPlan.part2Topic.replace(/^Describe\s+/i, '').trim();
            const cueTopic = normalizedTopic || draftPlan.part2Topic;
            const { cueCardText: generatedCueCard } = await generateCueCardForTopic(cueTopic);
            sessionPlanRef.current = createSpeakingSessionPlan({
                part1Topics: draftPlan.part1Topics,
                part2Topic: draftPlan.part2Topic,
                part3Themes: draftPlan.part3Themes,
                cueCardText: generatedCueCard,
            });
            setCueCardText(sessionPlanRef.current.cueCardText);
        } catch (err) {
            console.error('Failed to prepare session plan:', err);
            sessionPlanRef.current = createSpeakingSessionPlan();
            setCueCardText(sessionPlanRef.current.cueCardText);
        }

        let errorFired = false;
        const session = createRealtimeSession({
            onStageChange: handleStageChange,
            onTranscriptUpdate: handleTranscriptUpdate,
            onError: (err) => {
                if (errorFired) return;
                errorFired = true;
                console.error('[SpeakingTest Beta] Error:', err.message);
                setError(err.message);
                setStep('start');
            },
            onSessionEnd: handleSessionEnd,
            onAgentSpeaking: setAgentSpeaking,
            sessionConfig: sessionPlanRef.current,
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
            clearTimeout(badgeTimerRef.current);
            sessionRef.current?.disconnect();
        };
    }, []);

    const formatTime = (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

    // ==================== START SCREEN ====================
    if (step === 'start') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">IELTS Speaking Test (Beta)</h1>
                <p className="page-subtitle">
                    Enhanced conversational experience with AI examiner. Natural flow with dedicated Part 2 prep screen.
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
                    <h3 style={{ marginBottom: 'var(--space-5)' }}>What's New in Beta</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                        {[
                            { icon: Mic, title: 'Natural Conversation Flow', desc: 'Seamless transitions between parts - no jarring stage indicators.' },
                            { icon: BookOpen, title: 'Enhanced Part 2 Prep', desc: 'Full-screen prep interface with visible cue card and large notes area.' },
                            { icon: Clock, title: 'Smart Timers', desc: 'Clear countdown for prep time, subtle timer during speaking.' },
                            { icon: Award, title: 'Notes in Report', desc: 'Your Part 2 preparation notes are saved and included in your score report.' },
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
                        <Mic size={20} /> Start Speaking Test (Beta)
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
                <p className="text-muted">Setting up your microphone, cue card, and examiner session</p>
            </div>
        );
    }

    // ==================== TEST IN PROGRESS ====================
    if (step === 'test') {
        return (
            <div className="animate-fade-in">
                {/* Stage Badge (auto-fades) */}
                {showStageBadge && (
                    <div style={{
                        position: 'fixed',
                        top: '80px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 100,
                        animation: 'fadeIn 0.3s ease-in-out',
                    }}>
                        <div style={{
                            padding: '8px 16px',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            boxShadow: 'var(--shadow-lg)',
                        }}>
                            {stageBadgeText}
                        </div>
                    </div>
                )}

                {/* Part 2 Prep Screen Overlay */}
                {showPrepScreen && (
                    <SpeakingPrepScreen
                        timeLeft={prepTimeLeft}
                        cueCardText={cueCardText}
                        notes={notes}
                        onNotesChange={setNotes}
                        onClose={() => setShowPrepScreen(false)}
                    />
                )}

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

                        <div style={{
                            padding: 'var(--space-3)',
                            background: '#EEF2FF',
                            borderRadius: 'var(--radius-md)',
                            marginBottom: 'var(--space-4)',
                            color: '#3730A3',
                            fontSize: 'var(--text-sm)',
                            lineHeight: 1.5,
                        }}>
                            {stageNotice}
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
                                    {examinerWaveHeights.map((barHeight, i) => (
                                        <div key={i} style={{
                                            width: 4, borderRadius: 2,
                                            background: 'var(--color-primary)',
                                            animation: `soundwave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                                            height: `${barHeight}px`,
                                        }} />
                                    ))}
                                </div>
                            ) : (
                                <Mic size={24} style={{ color: 'var(--color-neutral-300)' }} />
                            )}
                        </div>

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

                <style>{`
                    @keyframes soundwave {
                        from { height: 8px; }
                        to { height: 40px; }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                        to { opacity: 1; transform: translateX(-50%) translateY(0); }
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
        const plan = report.practicePlan || [];

        const subScoreEntries = [
            { key: 'fluencyCoherence', label: 'Fluency & Coherence', icon: Zap },
            { key: 'lexicalResource', label: 'Lexical Resource', icon: BookOpen },
            { key: 'grammaticalRange', label: 'Grammatical Range', icon: BarChart3 },
            { key: 'pronunciation', label: 'Pronunciation', icon: Volume2 },
        ];

        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Speaking Test Report</h1>
                <p className="page-subtitle">Your detailed IELTS Speaking performance analysis</p>

                {/* Overall Band Score */}
                <div className="card" style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-2)' }}>
                        Overall Band Score
                    </div>
                    <div style={{
                        fontSize: '4rem', fontWeight: 700,
                        color: BAND_COLOR(report.overallBand),
                        lineHeight: 1,
                    }}>
                        {report.overallBand?.toFixed(1) || 'N/A'}
                    </div>
                    {report.error && (
                        <div style={{ marginTop: 'var(--space-3)', color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>
                            <AlertCircle size={16} style={{ display: 'inline', marginRight: 4 }} />
                            {report.error}
                        </div>
                    )}
                </div>

                {/* Sub-scores */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    {subScoreEntries.map((entry) => {
                        const score = sub[entry.key];
                        return (
                            <div key={entry.key} className="card">
                                <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-3)' }}>
                                    <entry.icon size={18} style={{ color: 'var(--color-primary)' }} />
                                    <h4 className="text-sm font-semibold">{entry.label}</h4>
                                </div>
                                <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: BAND_COLOR(score?.band) }}>
                                    {score?.band?.toFixed(1) || 'N/A'}
                                </div>
                                {score?.justification && (
                                    <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                                        {score.justification}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Part 2 Preparation Notes */}
                {notes && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
                            <BookOpen size={18} /> Part 2 Preparation Notes
                        </h3>
                        <div style={{
                            padding: 'var(--space-3)',
                            background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-sm)',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.6,
                        }}>
                            {notes}
                        </div>
                    </div>
                )}

                {/* Strengths & Improvements */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)', color: '#16A34A' }}>
                            <CheckCircle size={18} /> Strengths
                        </h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {(report.strengths || []).map((s, i) => (
                                <li key={i} style={{ padding: '8px 0', borderBottom: i < report.strengths.length - 1 ? '1px solid var(--color-neutral-200)' : 'none' }}>
                                    <span style={{ color: '#16A34A', marginRight: 8 }}>✓</span>
                                    {s}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="card">
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)', color: '#D97706' }}>
                            <AlertCircle size={18} /> Areas for Improvement
                        </h3>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {(report.improvements || []).map((imp, i) => (
                                <li key={i} style={{ padding: '8px 0', borderBottom: i < report.improvements.length - 1 ? '1px solid var(--color-neutral-200)' : 'none' }}>
                                    <span style={{ color: '#D97706', marginRight: 8 }}>→</span>
                                    {imp}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* 7-Day Practice Plan */}
                {plan.length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
                            <Calendar size={18} /> 7-Day Practice Plan
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {plan.map((day, i) => (
                                <div key={i} style={{
                                    padding: 'var(--space-3)',
                                    background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                    borderLeft: '4px solid var(--color-primary)',
                                }}>
                                    <div className="flex items-center gap-2" style={{ marginBottom: 'var(--space-2)' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>Day {day.day}</span>
                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>• {day.focus}</span>
                                    </div>
                                    <p className="text-sm">{day.activity}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn-primary" onClick={() => window.location.reload()}>
                        <RefreshCw size={18} /> Take Another Test
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
