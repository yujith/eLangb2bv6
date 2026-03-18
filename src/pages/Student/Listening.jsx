import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateListeningContent } from '../../lib/contentEngine';
import { getOrCreateAudio } from '../../lib/audioEngine';
import { generateTTSAudio } from '../../lib/aiService';
import { supabase } from '../../lib/supabase';
import {
    Headphones, Clock, Play, Pause, RotateCcw,
    CheckCircle, XCircle, AlertCircle, Award, BarChart3, RefreshCw, Volume2
} from 'lucide-react';

const TOPICS_ACADEMIC = [
    'University Life', 'Library', 'Accommodation', 'Campus Services', 'Academic Lecture',
    'Research', 'Environment', 'Technology', 'Health Services', 'Science',
];
const TOPICS_GENERAL = [
    'Travel', 'Shopping', 'Job Interview', 'Sports', 'Community Events',
    'Local Services', 'Entertainment', 'Daily Life', 'Transport', 'Housing',
];

function toDisplayText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(item => toDisplayText(item)).filter(Boolean).join(', ');
    if (typeof value === 'object') {
        if (typeof value.text === 'string') return value.text;
        if (typeof value.label === 'string') return value.label;
        if (typeof value.value === 'string') return value.value;
        try {
            return JSON.stringify(value);
        } catch (_) {
            return String(value);
        }
    }
    return String(value);
}

function normalizeListeningQuestions(rawQuestions = []) {
    return (Array.isArray(rawQuestions) ? rawQuestions : []).map((question, idx) => {
        const options = Array.isArray(question?.options)
            ? question.options.map(option => toDisplayText(option)).filter(Boolean)
            : null;

        return {
            ...question,
            index: typeof question?.index === 'number' ? question.index : idx,
            type: toDisplayText(question?.type),
            question: toDisplayText(question?.question),
            options,
            correctAnswer: toDisplayText(question?.correctAnswer),
            explanation: toDisplayText(question?.explanation),
        };
    });
}

const SECTION_INFO = [
    { label: 'Section 1', desc: 'Conversation between two people in a social or everyday context (e.g. booking, enquiry)', context: 'social' },
    { label: 'Section 2', desc: 'Monologue in a social or everyday context (e.g. speech about facilities, tour guide)', context: 'social' },
    { label: 'Section 3', desc: 'Conversation between up to four people in an educational or training context (e.g. seminar, tutorial)', context: 'academic' },
    { label: 'Section 4', desc: 'Academic monologue or lecture on a topic of general academic interest', context: 'academic' },
];

export default function ListeningModule() {
    const { profile, organization } = useAuth();
    const [step, setStep] = useState('setup');
    const [config, setConfig] = useState({ ieltsType: 'academic', difficulty: 'band_6_7', section: 1, topic: '' });
    const [content, setContent] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentQ, setCurrentQ] = useState(0);
    const [audioUrl, setAudioUrl] = useState(null);
    const [segmentedAudioUrls, setSegmentedAudioUrls] = useState([]);
    const [isSegmentedAudio, setIsSegmentedAudio] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    const [playsUsed, setPlaysUsed] = useState(0);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);
    const [attemptId, setAttemptId] = useState(null);
    const [script, setScript] = useState('');
    const [useBrowserTTS, setUseBrowserTTS] = useState(false);
    const [browserTTSProgress, setBrowserTTSProgress] = useState(0);
    const audioRef = useRef(null);
    const segmentedIndexRef = useRef(0);
    const segmentedDurationsRef = useRef([]);
    const browserTTSTimerRef = useRef(null);
    const browserTTSStartRef = useRef(null);
    const browserTTSDurationRef = useRef(null);
    const voicesLoadedRef = useRef(false);

    const MAX_PLAYS = 2; // IELTS only allows 2 plays

    // Preload voices (Chrome loads them asynchronously)
    useEffect(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    voicesLoadedRef.current = true;
                    console.log('[BrowserTTS] Voices loaded:', voices.length);
                }
            };
            loadVoices();
            window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
            return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
        }
    }, []);

    const resetTestState = () => {
        setContent(null);
        setQuestions([]);
        setAnswers({});
        setCurrentQ(0);
        setAudioUrl(null);
        segmentedAudioUrls.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        setSegmentedAudioUrls([]);
        setIsSegmentedAudio(false);
        segmentedIndexRef.current = 0;
        segmentedDurationsRef.current = [];
        setIsPlaying(false);
        setAudioProgress(0);
        setPlaysUsed(0);
        setResults(null);
        setAttemptId(null);
        setScript('');
        setUseBrowserTTS(false);
        setBrowserTTSProgress(0);
        if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    };

    const startTest = async () => {
        resetTestState();
        setStep('loading');
        setError('');

        try {
            const topicPool = config.ieltsType === 'academic' ? TOPICS_ACADEMIC : TOPICS_GENERAL;
            const result = await getOrCreateListeningContent({
                topic: config.topic || topicPool[Math.floor(Math.random() * topicPool.length)],
                difficulty: config.difficulty,
                section: config.section,
                ieltsType: config.ieltsType,
                organizationId: organization?.id,
                studentId: profile?.id,
            });

            setContent(result.contentItem);
            setScript(result.contentItem?.body || '');

            const qs = normalizeListeningQuestions(result.questionSet?.questions || []);
            setQuestions(qs);
            setAnswers({});

            // Try to get/generate audio
            if (result.contentItem?.body) {
                try {
                    const audioResult = await getOrCreateAudio({
                        scriptText: result.contentItem.body,
                        contentItemId: result.contentItem.id,
                        organizationId: organization?.id,
                    });
                    if (audioResult.useBrowserTTS) {
                        setUseBrowserTTS(true);
                        setAudioUrl(null);
                    } else if (audioResult.useSegmentedAudio && audioResult.audioSegments?.length) {
                        const generatedSegments = [];
                        for (const segment of audioResult.audioSegments) {
                            const segmentBlob = await generateTTSAudio(segment.text, segment.voiceId);
                            if (segmentBlob === '__browser_tts__') {
                                setUseBrowserTTS(true);
                                setAudioUrl(null);
                                generatedSegments.length = 0;
                                break;
                            }
                            generatedSegments.push(URL.createObjectURL(segmentBlob));
                        }
                        if (generatedSegments.length > 0) {
                            segmentedIndexRef.current = 0;
                            segmentedDurationsRef.current = audioResult.audioSegments.map(segment =>
                                Math.max((segment.text.split(/\s+/).length / 150) * 60, 2)
                            );
                            setSegmentedAudioUrls(generatedSegments);
                            setIsSegmentedAudio(true);
                            setAudioUrl(generatedSegments[0]);
                        }
                    } else {
                        setAudioUrl(audioResult.audioUrl);
                    }
                } catch (audioErr) {
                    console.warn('Audio generation unavailable:', audioErr);
                    // Continue without audio - student can read the script
                }
            }

            // Create attempt
            const { data: attempt } = await supabase.from('attempts').insert({
                student_id: profile.id,
                content_item_id: result.contentItem?.id,
                module: 'listening',
                status: 'in_progress',
            }).select().single();

            if (attempt) setAttemptId(attempt.id);

            setStep('test');
        } catch (err) {
            console.error('Error:', err);
            setError(err.message || 'Failed to generate listening test.');
            setStep('setup');
        }
    };

    // Browser TTS playback helpers
    const startBrowserTTSProgress = (durationSec) => {
        browserTTSStartRef.current = Date.now();
        browserTTSDurationRef.current = durationSec * 1000;
        if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
        browserTTSTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - browserTTSStartRef.current;
            const pct = Math.min((elapsed / browserTTSDurationRef.current) * 100, 100);
            setBrowserTTSProgress(pct);
            if (pct >= 100) clearInterval(browserTTSTimerRef.current);
        }, 200);
    };

    const playBrowserTTS = () => {
        if (!script || playsUsed >= MAX_PLAYS) return;
        console.log('[BrowserTTS] Playing, script length:', script.length, 'voices loaded:', voicesLoadedRef.current);
        window.speechSynthesis.cancel();

        // Chrome has a bug where speechSynthesis stops after ~15 seconds.
        // Workaround: break text into sentence chunks and queue them.
        const sentences = script.match(/[^.!?]+[.!?]+/g) || [script];
        const chunks = [];
        let current = '';
        for (const s of sentences) {
            if ((current + s).length > 200) {
                if (current) chunks.push(current.trim());
                current = s;
            } else {
                current += s;
            }
        }
        if (current.trim()) chunks.push(current.trim());

        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'))
            || voices.find(v => v.lang.startsWith('en-'));
        console.log('[BrowserTTS] Using voice:', englishVoice?.name || 'default', 'chunks:', chunks.length);

        const estimatedDuration = Math.max((script.split(/\s+/).length / 150) * 60, 30);
        startBrowserTTSProgress(estimatedDuration);

        chunks.forEach((chunk, i) => {
            const utterance = new SpeechSynthesisUtterance(chunk);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.lang = 'en-US';
            if (englishVoice) utterance.voice = englishVoice;

            if (i === chunks.length - 1) {
                // Last chunk: mark playback as complete
                utterance.onend = () => {
                    setIsPlaying(false);
                    setPlaysUsed(prev => prev + 1);
                    setBrowserTTSProgress(100);
                    if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
                };
            }
            utterance.onerror = (e) => {
                console.error('[BrowserTTS] Utterance error:', e);
                setIsPlaying(false);
                if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
            };

            window.speechSynthesis.speak(utterance);
        });

        setIsPlaying(true);
    };

    const pauseBrowserTTS = () => {
        window.speechSynthesis.pause();
        setIsPlaying(false);
        if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
    };

    const resumeBrowserTTS = () => {
        window.speechSynthesis.resume();
        setIsPlaying(true);
        // Resume progress timer
        if (browserTTSDurationRef.current) {
            const elapsed = (browserTTSProgress / 100) * browserTTSDurationRef.current;
            browserTTSStartRef.current = Date.now() - elapsed;
            browserTTSTimerRef.current = setInterval(() => {
                const totalElapsed = Date.now() - browserTTSStartRef.current;
                const pct = Math.min((totalElapsed / browserTTSDurationRef.current) * 100, 100);
                setBrowserTTSProgress(pct);
                if (pct >= 100) clearInterval(browserTTSTimerRef.current);
            }, 200);
        }
    };

    const fallbackToBrowserTTS = () => {
        console.warn('Audio element failed, switching to browser TTS fallback');
        segmentedAudioUrls.forEach(url => {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
        });
        setSegmentedAudioUrls([]);
        setIsSegmentedAudio(false);
        segmentedIndexRef.current = 0;
        segmentedDurationsRef.current = [];
        setUseBrowserTTS(true);
        setAudioUrl(null);
        setIsPlaying(false);
    };

    const toggleAudio = () => {
        if (useBrowserTTS) {
            if (isPlaying) {
                pauseBrowserTTS();
            } else {
                if (playsUsed >= MAX_PLAYS) return;
                if (window.speechSynthesis.paused) {
                    resumeBrowserTTS();
                } else {
                    playBrowserTTS();
                }
            }
            return;
        }
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            if (playsUsed >= MAX_PLAYS) return;
            audioRef.current.play().catch((err) => {
                console.error('Audio play failed:', err);
                fallbackToBrowserTTS();
            });
            setIsPlaying(true);
        }
    };

    const restartAudio = () => {
        if (playsUsed >= MAX_PLAYS) return;
        if (useBrowserTTS) {
            window.speechSynthesis.cancel();
            setBrowserTTSProgress(0);
            playBrowserTTS();
            return;
        }
        if (!audioRef.current) return;
        segmentedIndexRef.current = 0;
        if (isSegmentedAudio && segmentedAudioUrls.length > 0 && audioUrl !== segmentedAudioUrls[0]) {
            setAudioUrl(segmentedAudioUrls[0]);
            setAudioProgress(0);
            setIsPlaying(true);
            return;
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => {
            console.error('Audio restart failed:', err);
            fallbackToBrowserTTS();
        });
        setIsPlaying(true);
    };

    const handleAudioEnd = () => {
        if (isSegmentedAudio && segmentedAudioUrls.length > 0) {
            const nextIndex = segmentedIndexRef.current + 1;
            if (nextIndex < segmentedAudioUrls.length) {
                segmentedIndexRef.current = nextIndex;
                setAudioUrl(segmentedAudioUrls[nextIndex]);
                setIsPlaying(true);
                return;
            }
        }
        setIsPlaying(false);
        setPlaysUsed(prev => prev + 1);
    };

    // Cleanup browser TTS on unmount
    useEffect(() => {
        return () => {
            if (browserTTSTimerRef.current) clearInterval(browserTTSTimerRef.current);
            if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            segmentedAudioUrls.forEach(url => {
                if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
            });
        };
    }, [segmentedAudioUrls]);

    useEffect(() => {
        if (!isSegmentedAudio || !audioUrl || !audioRef.current || !isPlaying) return;
        audioRef.current.load();
        audioRef.current.play().catch((err) => {
            console.error('Segmented audio play failed:', err);
            fallbackToBrowserTTS();
        });
    }, [audioUrl, isSegmentedAudio, isPlaying]);

    const handleAnswer = (questionIndex, answer) => {
        setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    };

    const handleSubmit = async () => {
        let correct = 0;
        const scoredAnswers = questions.map((q, i) => {
            const studentAnswer = answers[q.index || i] || '';
            const isCorrect = studentAnswer.toLowerCase().trim() ===
                (q.correctAnswer || '').toLowerCase().trim();
            if (isCorrect) correct++;
            return {
                question: q.question, studentAnswer,
                correctAnswer: q.correctAnswer, isCorrect, explanation: q.explanation,
            };
        });

        const score = questions.length > 0 ? (correct / questions.length) * 100 : 0;
        const band = scoreToBand(score);

        setResults({ scoredAnswers, correct, total: questions.length, score, band });
        setStep('results');

        if (attemptId) {
            await supabase.from('attempts').update({
                score, band, completed_at: new Date().toISOString(), status: 'completed',
            }).eq('id', attemptId);

            await supabase.from('attempt_answers').insert(
                scoredAnswers.map((a, i) => ({
                    attempt_id: attemptId, question_index: i,
                    student_answer: a.studentAnswer, correct_answer: a.correctAnswer, is_correct: a.isCorrect,
                }))
            );
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
        return 4;
    };

    // ========== SETUP ==========
    if (step === 'setup') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Listening Practice</h1>
                <p className="page-subtitle">Listen to audio and answer comprehension questions.</p>

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
                    <h3 style={{ marginBottom: 'var(--space-6)' }}>Test Configuration</h3>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">IELTS Type</label>
                        <div className="tabs" style={{ border: 'none', margin: 0 }}>
                            <button className={`tab ${config.ieltsType === 'academic' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'academic', topic: '' }))}>
                                Academic
                            </button>
                            <button className={`tab ${config.ieltsType === 'general' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'general', topic: '' }))}>
                                General Training
                            </button>
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                            {config.ieltsType === 'academic'
                                ? 'Higher education or professional registration contexts.'
                                : 'Migration, secondary education, or work experience contexts.'}
                        </p>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Section</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                            {SECTION_INFO.map((s, i) => (
                                <div key={i}
                                    onClick={() => setConfig(c => ({ ...c, section: i + 1 }))}
                                    style={{
                                        padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        border: config.section === i + 1 ? '2px solid var(--color-primary)' : '2px solid var(--color-neutral-200)',
                                        background: config.section === i + 1 ? 'var(--color-primary-light, #EEF2FF)' : 'var(--color-neutral-50)',
                                    }}>
                                    <div className="font-medium text-sm">{s.label}</div>
                                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>{s.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Difficulty</label>
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

                    <div style={{ padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>
                        <strong>Question types:</strong> Multiple choice, matching, form completion, note completion, sentence completion, map labelling
                    </div>

                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={startTest}>
                        <Headphones size={18} /> Start Listening Test
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
                <h3 style={{ marginTop: 'var(--space-6)' }}>Preparing your listening test...</h3>
                <p className="text-muted">Generating audio and questions</p>
            </div>
        );
    }

    // ========== TEST ==========
    if (step === 'test') {
        return (
            <div className="animate-fade-in">
                {/* Audio Player */}
                <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                    <div className="flex items-center gap-4">
                        <Volume2 size={20} style={{ color: 'var(--color-primary)' }} />
                        <h4 style={{ flex: 1 }}>Audio Player</h4>
                        <span className="text-sm text-muted">Plays: {playsUsed}/{MAX_PLAYS}</span>
                    </div>

                    {audioUrl || useBrowserTTS ? (
                        <div style={{ marginTop: 'var(--space-3)' }}>
                            {audioUrl && (
                                <audio
                                    ref={audioRef}
                                    src={audioUrl}
                                    onEnded={handleAudioEnd}
                                    onError={(e) => {
                                        console.error('Audio element error:', e.target.error);
                                        fallbackToBrowserTTS();
                                    }}
                                    onTimeUpdate={() => {
                                        if (audioRef.current) {
                                            if (isSegmentedAudio && segmentedDurationsRef.current.length > 0) {
                                                const durations = segmentedDurationsRef.current;
                                                const completedDuration = durations
                                                    .slice(0, segmentedIndexRef.current)
                                                    .reduce((sum, value) => sum + value, 0);
                                                const currentSegmentDuration = audioRef.current.duration || durations[segmentedIndexRef.current] || 0;
                                                const totalDuration = durations.reduce((sum, value) => sum + value, 0);
                                                const overallProgress = totalDuration > 0
                                                    ? ((completedDuration + Math.min(audioRef.current.currentTime, currentSegmentDuration)) / totalDuration) * 100
                                                    : 0;
                                                setAudioProgress(Math.min(overallProgress, 100));
                                            } else {
                                                setAudioProgress(
                                                    (audioRef.current.currentTime / audioRef.current.duration) * 100
                                                );
                                            }
                                        }
                                    }}
                                />
                            )}
                            <div style={{
                                width: '100%', height: '6px', background: 'var(--color-neutral-200)',
                                borderRadius: '3px', marginBottom: 'var(--space-3)', overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${useBrowserTTS ? browserTTSProgress : audioProgress}%`, height: '100%',
                                    background: 'var(--color-primary)', transition: 'width 0.3s',
                                }} />
                            </div>
                            {useBrowserTTS && (
                                <p className="text-xs text-muted" style={{ marginBottom: 'var(--space-2)' }}>
                                    Using browser text-to-speech
                                </p>
                            )}
                            <div className="flex gap-2">
                                <button
                                    className={`btn btn-sm ${isPlaying ? 'btn-outline' : 'btn-primary'}`}
                                    onClick={toggleAudio}
                                    disabled={playsUsed >= MAX_PLAYS && !isPlaying}
                                >
                                    {isPlaying ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
                                </button>
                                <button className="btn btn-sm btn-outline" onClick={restartAudio}
                                    disabled={playsUsed >= MAX_PLAYS}>
                                    <RotateCcw size={14} /> Restart
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            marginTop: 'var(--space-3)', padding: 'var(--space-4)',
                            background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)',
                        }}>
                            <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-2)' }}>
                                Reading the script below. Answer the questions based on the content.
                            </p>
                            <div style={{
                                maxHeight: '200px', overflow: 'auto', fontSize: 'var(--text-sm)',
                                lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            }}>
                                {script}
                            </div>
                        </div>
                    )}
                </div>

                {/* Questions */}
                <div className="card">
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)',
                        borderBottom: '1px solid var(--color-neutral-100)',
                    }}>
                        <h4>Questions</h4>
                        <span className="text-sm text-muted">
                            {Object.keys(answers).length}/{questions.length} answered
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {questions.map((question, idx) => {
                            const answerKey = question.index || idx;
                            const isActive = idx === currentQ;
                            return (
                                <div
                                    key={idx}
                                    onClick={() => setCurrentQ(idx)}
                                    style={{
                                        padding: 'var(--space-4)',
                                        borderRadius: 'var(--radius-md)',
                                        border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--color-neutral-200)',
                                        background: isActive ? 'var(--color-primary-light, #EEF2FF)' : '#fff',
                                    }}
                                >
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)',
                                        marginBottom: 'var(--space-3)', alignItems: 'flex-start',
                                    }}>
                                        <p className="font-medium" style={{ lineHeight: 1.6, margin: 0 }}>
                                            {idx + 1}. {question.question}
                                        </p>
                                        <span className="text-xs text-muted">
                                            {answers[answerKey] ? 'Answered' : 'Pending'}
                                        </span>
                                    </div>

                                    {question.options && question.options.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                            {question.options.map((opt, optIndex) => (
                                                <button
                                                    key={optIndex}
                                                    onClick={() => handleAnswer(answerKey, opt)}
                                                    style={{
                                                        padding: 'var(--space-3) var(--space-4)',
                                                        border: `2px solid ${answers[answerKey] === opt ? 'var(--color-primary)' : 'var(--color-neutral-200)'}`,
                                                        borderRadius: 'var(--radius-md)',
                                                        background: answers[answerKey] === opt ? 'var(--color-primary-light)' : '#fff',
                                                        textAlign: 'left', cursor: 'pointer', fontSize: 'var(--text-sm)',
                                                    }}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <input
                                            className="form-input"
                                            placeholder="Type your answer..."
                                            value={answers[answerKey] || ''}
                                            onChange={(e) => handleAnswer(answerKey, e.target.value)}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div style={{
                        display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                        marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)',
                        borderTop: '1px solid var(--color-neutral-100)',
                    }}>
                        <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
                            Submit Answers
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ========== RESULTS ==========
    if (step === 'results' && results) {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Listening Results</h1>

                <div className="grid grid-3" style={{ marginBottom: 'var(--space-8)' }}>
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
                </div>

                <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
                    <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Answer Review</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {results.scoredAnswers.map((a, i) => (
                            <div key={i} style={{
                                display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                                padding: 'var(--space-3) var(--space-4)',
                                background: a.isCorrect ? '#F0FDF4' : '#FEF2F2',
                                borderRadius: 'var(--radius-md)', borderLeft: `3px solid ${a.isCorrect ? '#22C55E' : '#EF4444'}`,
                            }}>
                                <div style={{ marginTop: '2px' }}>
                                    {a.isCorrect ? <CheckCircle size={16} style={{ color: '#22C55E' }} /> : <XCircle size={16} style={{ color: '#EF4444' }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p className="font-medium text-sm" style={{ marginBottom: '4px' }}>Q{i + 1}: {a.question}</p>
                                    {!a.isCorrect && (
                                        <p className="text-sm">
                                            <span style={{ color: '#EF4444' }}>Your answer: {a.studentAnswer || '(empty)'}</span>
                                            <span className="text-muted"> → </span>
                                            <span style={{ color: '#22C55E', fontWeight: 600 }}>Correct: {a.correctAnswer}</span>
                                        </p>
                                    )}
                                    {a.explanation && <p className="text-xs text-muted" style={{ marginTop: '4px' }}>{a.explanation}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex gap-3">
                    <button className="btn btn-primary" onClick={() => { resetTestState(); setStep('setup'); }}>
                        <RefreshCw size={16} /> Take Another Test
                    </button>
                    <button className="btn btn-outline" onClick={() => window.history.back()}>Back to Dashboard</button>
                </div>
            </div>
        );
    }

    return null;
}
