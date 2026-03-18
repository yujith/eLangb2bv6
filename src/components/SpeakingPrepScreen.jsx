import { useEffect } from 'react';
import { Clock, BookOpen } from 'lucide-react';

export default function SpeakingPrepScreen({ 
    timeLeft, 
    cueCardText, 
    notes, 
    onNotesChange,
    onClose 
}) {
    useEffect(() => {
        if (timeLeft <= 0) {
            onClose?.();
        }
    }, [timeLeft, onClose]);

    const formatTime = (secs) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease-in-out',
        }}>
            <div style={{
                background: '#fff',
                borderRadius: 'var(--radius-lg)',
                maxWidth: '800px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: 'var(--shadow-xl)',
                animation: 'slideUp 0.3s ease-out',
            }}>
                {/* Header with Timer */}
                <div style={{
                    padding: 'var(--space-6)',
                    borderBottom: '1px solid var(--color-neutral-200)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <BookOpen size={20} style={{ color: 'var(--color-primary)' }} />
                        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, margin: 0 }}>
                            Part 2: Long Turn
                        </h2>
                    </div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: '8px 16px',
                        background: timeLeft <= 10 ? '#FEE2E2' : '#FFF7ED',
                        borderRadius: 'var(--radius-md)',
                    }}>
                        <Clock size={18} style={{ color: timeLeft <= 10 ? '#DC2626' : '#D97706' }} />
                        <span style={{
                            fontSize: 'var(--text-2xl)',
                            fontWeight: 700,
                            color: timeLeft <= 10 ? '#DC2626' : '#D97706',
                        }}>
                            {formatTime(timeLeft)}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div style={{ padding: 'var(--space-6)' }}>
                    {/* Cue Card */}
                    <div style={{ marginBottom: 'var(--space-6)' }}>
                        <label style={{
                            display: 'block',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: 'var(--color-neutral-700)',
                            marginBottom: 'var(--space-3)',
                        }}>
                            📝 Your Topic:
                        </label>
                        <div style={{
                            padding: 'var(--space-4)',
                            background: 'var(--color-neutral-50)',
                            borderRadius: 'var(--radius-md)',
                            border: '2px solid var(--color-neutral-200)',
                            fontSize: 'var(--text-base)',
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {cueCardText || 'Loading cue card...'}
                        </div>
                    </div>

                    {/* Notes Area */}
                    <div>
                        <label style={{
                            display: 'block',
                            fontSize: 'var(--text-sm)',
                            fontWeight: 600,
                            color: 'var(--color-neutral-700)',
                            marginBottom: 'var(--space-3)',
                        }}>
                            ✍️ Your Notes:
                        </label>
                        <textarea
                            className="form-input"
                            rows={8}
                            placeholder="Write your notes here to organize your thoughts..."
                            value={notes}
                            onChange={(e) => onNotesChange?.(e.target.value)}
                            style={{
                                fontSize: 'var(--text-base)',
                                lineHeight: 1.6,
                                resize: 'vertical',
                            }}
                            autoFocus
                        />
                    </div>

                    {/* Tip */}
                    <div style={{
                        marginTop: 'var(--space-4)',
                        padding: 'var(--space-3)',
                        background: '#EEF2FF',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-sm)',
                        color: '#4338CA',
                        display: 'flex',
                        gap: 'var(--space-2)',
                    }}>
                        <span>💡</span>
                        <span>
                            <strong>Tip:</strong> Organize your thoughts. You'll have 2 minutes to speak after preparation time ends.
                        </span>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { 
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to { 
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
