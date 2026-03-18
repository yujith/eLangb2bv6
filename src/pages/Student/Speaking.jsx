import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getOrCreateSpeakingQuestions } from '../../lib/contentEngine';
import { supabase } from '../../lib/supabase';
import {
    Mic, MicOff, Play, Pause, Clock, ChevronRight, ChevronLeft,
    AlertCircle, RefreshCw, Upload, CheckCircle, Award
} from 'lucide-react';

const TOPICS_PART1 = [
    'Hobbies', 'Work', 'Family', 'Daily Routine', 'Food',
    'Weather', 'Sports', 'Music', 'Reading', 'Hometown',
];
const TOPICS_PART2 = [
    'A Person You Admire', 'A Place You Visited', 'An Important Event',
    'A Memorable Journey', 'A Skill You Want to Learn', 'A Book or Film',
    'A Piece of Technology', 'A Time You Helped Someone', 'Your Favourite Season', 'A Local Celebration',
];
const TOPICS_PART3 = [
    'Technology & Society', 'Education Systems', 'Environment', 'Globalization',
    'Work & Career', 'Culture & Identity', 'Media & Communication', 'Family Values',
    'Health & Lifestyle', 'Tourism & Travel',
];

const PART_INFO = [
    {
        part: 1, label: 'Part 1 — Introduction',
        desc: 'General questions about familiar topics such as work, study, home, or hobbies.',
        timing: '4–5 minutes', questions: '4–5 short questions', prepTime: null,
    },
    {
        part: 2, label: 'Part 2 — Long Turn',
        desc: 'Speak for 1–2 minutes on a given cue card topic after 1 minute of preparation.',
        timing: '3–4 minutes', questions: '1 cue card + follow-up', prepTime: '1 minute to prepare',
    },
    {
        part: 3, label: 'Part 3 — Discussion',
        desc: 'Two-way discussion with deeper questions related to the Part 2 topic. Tests analytical and abstract thinking.',
        timing: '4–5 minutes', questions: '4–5 abstract questions', prepTime: null,
    },
];

export default function SpeakingModule() {
    const { profile, organization, hasTeachers } = useAuth();
    const [step, setStep] = useState('setup');
    const [config, setConfig] = useState({ ieltsType: 'academic', part: 1, topic: '' });
    const [questionSet, setQuestionSet] = useState(null);
    const [currentQ, setCurrentQ] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [recordings, setRecordings] = useState({});
    const [timeLeft, setTimeLeft] = useState(0);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    const partTimeLimits = { 1: 60, 2: 120, 3: 60 };

    const startTest = async () => {
        setStep('loading');
        setError('');

        try {
            const topicPool = config.part === 1 ? TOPICS_PART1 : config.part === 2 ? TOPICS_PART2 : TOPICS_PART3;
            const result = await getOrCreateSpeakingQuestions({
                part: config.part,
                ieltsType: config.ieltsType,
                topic: config.topic || topicPool[Math.floor(Math.random() * topicPool.length)],
                organizationId: organization?.id,
                studentId: profile?.id,
            });

            const body = result.contentItem?.body;
            const parsed = typeof body === 'string' ? JSON.parse(body) : body;
            setQuestionSet(parsed);
            setCurrentQ(0);
            setRecordings({});
            setStep('test');
        } catch (err) {
            console.error('Error:', err);
            setError(err.message || 'Failed to generate speaking questions.');
            setStep('setup');
        }
    };

    const startRecording = async () => {
        try {
            // Check if mediaDevices is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Audio recording is not supported in your browser. Please use a modern browser like Chrome, Firefox, or Edge.');
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setRecordings(prev => ({ ...prev, [currentQ]: { blob, url } }));
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setTimeLeft(partTimeLimits[config.part] || 60);

            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        stopRecording();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err) {
            setError('Microphone access denied. Please allow microphone access to use speaking practice.');
        }
    };

    const stopRecording = () => {
        clearInterval(timerRef.current);
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const submitRecordings = async () => {
        setSubmitted(true);

        try {
            // Create attempt
            const { data: attempt } = await supabase.from('attempts').insert({
                student_id: profile.id,
                module: 'speaking',
                status: 'completed',
                completed_at: new Date().toISOString(),
            }).select().single();

            // Upload recordings
            if (attempt) {
                for (const [index, recording] of Object.entries(recordings)) {
                    const fileName = `${profile.id}/${attempt.id}_q${index}.webm`;
                    await supabase.storage
                        .from('recordings')
                        .upload(fileName, recording.blob, { contentType: 'audio/webm' });

                    const { data: { publicUrl } } = supabase.storage
                        .from('recordings')
                        .getPublicUrl(fileName);

                    await supabase.from('speaking_submissions').insert({
                        attempt_id: attempt.id,
                        student_id: profile.id,
                        audio_url: publicUrl,
                        status: 'submitted',
                    });
                }
            }
        } catch (err) {
            console.error('Upload error:', err);
        }

        setStep('submitted');
    };

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const questions = questionSet?.questions || [];
    const cueCard = questionSet?.cueCard;

    // ========== SETUP ==========
    if (step === 'setup') {
        return (
            <div className="animate-fade-in">
                <h1 className="page-title">Speaking Practice</h1>
                <p className="page-subtitle">Record your answers to IELTS speaking questions.{hasTeachers ? ' A teacher will review and grade.' : ' AI will assist with grading.'}</p>

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
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'academic', topic: '' }))}>Academic</button>
                            <button className={`tab ${config.ieltsType === 'general' ? 'active' : ''}`}
                                onClick={() => setConfig(c => ({ ...c, ieltsType: 'general', topic: '' }))}>General Training</button>
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                            The Speaking module is identical for both Academic and General Training.
                        </p>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Speaking Part</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {PART_INFO.map(p => (
                                <div key={p.part}
                                    onClick={() => setConfig(c => ({ ...c, part: p.part, topic: '' }))}
                                    style={{
                                        padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        border: config.part === p.part ? '2px solid var(--color-primary)' : '2px solid var(--color-neutral-200)',
                                        background: config.part === p.part ? 'var(--color-primary-light, #EEF2FF)' : 'var(--color-neutral-50)',
                                    }}>
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-sm">{p.label}</span>
                                        <span className="text-xs text-muted">{p.timing}</span>
                                    </div>
                                    <div className="text-xs text-muted" style={{ marginTop: 2 }}>{p.desc}</div>
                                    {p.prepTime && (
                                        <div className="text-xs" style={{ marginTop: 4, color: '#D97706', fontWeight: 500 }}>
                                            ⏱ {p.prepTime}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                        <label className="form-label">Topic (optional)</label>
                        <select className="form-select" value={config.topic}
                            onChange={(e) => setConfig(c => ({ ...c, topic: e.target.value }))}>
                            <option value="">Random Topic</option>
                            {(config.part === 1 ? TOPICS_PART1 : config.part === 2 ? TOPICS_PART2 : TOPICS_PART3).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                            {config.part === 1 && 'Familiar everyday topics — introductory and conversational.'}
                            {config.part === 2 && 'Specific subjects for the cue card — you will have 1 minute to prepare.'}
                            {config.part === 3 && 'Abstract societal themes — requires analytical and opinion-based responses.'}
                        </p>
                    </div>

                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={startTest}>
                        <Mic size={18} /> Start Speaking Practice
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
                <h3 style={{ marginTop: 'var(--space-6)' }}>Preparing speaking questions...</h3>
            </div>
        );
    }

    // ========== TEST ==========
    if (step === 'test') {
        const question = questions[currentQ];

        return (
            <div className="animate-fade-in">
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)',
                }}>
                    <span className="font-semibold">Speaking Part {config.part}</span>
                    <span className="text-sm text-muted">
                        {Object.keys(recordings).length}/{questions.length} recorded
                    </span>
                </div>

                {/* Cue Card for Part 2 */}
                {config.part === 2 && cueCard && (
                    <div className="card" style={{
                        marginBottom: 'var(--space-4)',
                        borderLeft: '4px solid var(--color-primary)',
                        background: '#FFFDF7',
                    }}>
                        <h4 className="font-semibold" style={{ marginBottom: 'var(--space-3)' }}>
                            📋 Cue Card
                        </h4>
                        <p className="font-medium" style={{ marginBottom: 'var(--space-3)' }}>{cueCard.topic}</p>
                        <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {cueCard.bulletPoints?.map((bp, i) => (
                                <li key={i} className="text-sm">{bp}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Current Question */}
                <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginBottom: 'var(--space-4)',
                    }}>
                        <h4>Question {currentQ + 1} of {questions.length}</h4>
                    </div>

                    <p className="font-medium" style={{
                        fontSize: 'var(--text-lg)', lineHeight: 1.6, marginBottom: 'var(--space-6)',
                        padding: 'var(--space-4)', background: 'var(--color-neutral-50)',
                        borderRadius: 'var(--radius-md)',
                    }}>
                        {question?.question}
                    </p>

                    {/* Recording Controls */}
                    <div style={{ textAlign: 'center' }}>
                        {isRecording && (
                            <div style={{ marginBottom: 'var(--space-4)' }}>
                                <div className="flex items-center justify-center gap-2" style={{
                                    color: 'var(--color-error)', fontWeight: 600, fontSize: 'var(--text-lg)',
                                }}>
                                    <div style={{
                                        width: 12, height: 12, borderRadius: '50%',
                                        background: 'var(--color-error)',
                                        animation: 'pulse 1.5s infinite',
                                    }} />
                                    Recording... {formatTime(timeLeft)}
                                </div>
                            </div>
                        )}

                        {recordings[currentQ] ? (
                            <div style={{ marginBottom: 'var(--space-4)' }}>
                                <div className="flex items-center justify-center gap-2" style={{ color: '#22C55E', marginBottom: 'var(--space-3)' }}>
                                    <CheckCircle size={18} /> Recorded
                                </div>
                                <audio controls src={recordings[currentQ].url} style={{ width: '100%', maxWidth: '400px' }} />
                            </div>
                        ) : null}

                        <div className="flex gap-3 justify-center">
                            {!isRecording && !recordings[currentQ] && (
                                <button className="btn btn-primary" onClick={startRecording}>
                                    <Mic size={18} /> Start Recording
                                </button>
                            )}
                            {isRecording && (
                                <button className="btn btn-outline" style={{ color: 'var(--color-error)', borderColor: 'var(--color-error)' }}
                                    onClick={stopRecording}>
                                    <MicOff size={18} /> Stop
                                </button>
                            )}
                            {recordings[currentQ] && !isRecording && (
                                <button className="btn btn-outline btn-sm" onClick={startRecording}>
                                    <RefreshCw size={14} /> Re-record
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <button className="btn btn-outline btn-sm" disabled={currentQ === 0}
                        onClick={() => setCurrentQ(c => c - 1)}>
                        <ChevronLeft size={16} /> Previous
                    </button>

                    {currentQ < questions.length - 1 ? (
                        <button className="btn btn-primary btn-sm"
                            onClick={() => setCurrentQ(c => c + 1)}>
                            Next <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button className="btn btn-primary btn-sm" onClick={submitRecordings}
                            disabled={Object.keys(recordings).length === 0}>
                            <Upload size={16} /> Submit for Review
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ========== SUBMITTED ==========
    if (step === 'submitted') {
        return (
            <div className="animate-fade-in" style={{ textAlign: 'center', padding: 'var(--space-16) 0' }}>
                <div style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto var(--space-6)',
                }}>
                    <CheckCircle size={40} style={{ color: '#22C55E' }} />
                </div>
                <h2>Submitted for Review!</h2>
                <p className="text-muted" style={{ maxWidth: '400px', margin: 'var(--space-3) auto var(--space-8)' }}>
                    Your recordings have been saved.{hasTeachers ? ' A teacher will listen and assign band scores soon.' : ' Your submission is ready for review.'}
                </p>
                <div className="flex gap-3 justify-center">
                    <button className="btn btn-primary" onClick={() => { setStep('setup'); setSubmitted(false); }}>
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
