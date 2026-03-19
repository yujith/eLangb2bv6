import { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    DEFAULT_LISTENING_REALISM_SETTINGS,
    LISTENING_REALISM_OPTIONS,
    normalizeListeningRealismSettings,
} from '../../lib/listeningRealism';
import { Headphones, Save, Check, Sparkles } from 'lucide-react';

function SettingSelect({ label, value, options, onChange, helper }) {
    return (
        <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label">{label}</label>
            <select className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            {helper ? (
                <p className="text-xs text-muted" style={{ marginTop: '4px' }}>{helper}</p>
            ) : null}
        </div>
    );
}

export default function ListeningSettings() {
    const { organization, refreshOrganization } = useAuth();
    const initialSettings = useMemo(
        () => normalizeListeningRealismSettings(organization?.listening_realism_settings || DEFAULT_LISTENING_REALISM_SETTINGS),
        [organization]
    );
    const [settings, setSettings] = useState(initialSettings);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const updateSetting = (key, value) => {
        setSettings((current) => ({ ...current, [key]: value }));
    };

    const handleSave = async () => {
        if (!organization?.id) return;
        setSaving(true);
        setSaved(false);
        setError('');
        try {
            const { error: updateError } = await supabase
                .from('organizations')
                .update({ listening_realism_settings: settings })
                .eq('id', organization.id);

            if (updateError) {
                throw updateError;
            }

            await refreshOrganization();
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Listening settings save error:', err);
            setError(err.message || 'Failed to save listening settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Listening Realism</h1>
            <p className="page-subtitle">Set the default listening voice realism profile for your entire organization.</p>

            {error ? (
                <div style={{
                    padding: '12px 16px',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-5)',
                    fontSize: 'var(--text-sm)',
                }}>
                    {error}
                </div>
            ) : null}

            <div className="grid grid-2">
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>
                        <Headphones size={18} /> Default Voice Experience
                    </h4>

                    <SettingSelect
                        label="Realism Mode"
                        value={settings.realismMode}
                        options={LISTENING_REALISM_OPTIONS.realismMode}
                        onChange={(value) => updateSetting('realismMode', value)}
                        helper="Controls how strongly scripts are optimized for vivid, human-like delivery."
                    />

                    <SettingSelect
                        label="Accent Profile"
                        value={settings.accentProfile}
                        options={LISTENING_REALISM_OPTIONS.accentProfile}
                        onChange={(value) => updateSetting('accentProfile', value)}
                        helper="Guides OpenAI persona creation and voice casting toward a preferred English accent mix."
                    />

                    <SettingSelect
                        label="Age Realism"
                        value={settings.ageRealism}
                        options={LISTENING_REALISM_OPTIONS.ageRealism}
                        onChange={(value) => updateSetting('ageRealism', value)}
                        helper="Makes student, adult, and older speaker roles sound more age-appropriate."
                    />

                    <SettingSelect
                        label="Emotional Expressiveness"
                        value={settings.emotionalExpressiveness}
                        options={LISTENING_REALISM_OPTIONS.emotionalExpressiveness}
                        onChange={(value) => updateSetting('emotionalExpressiveness', value)}
                        helper="Adjusts how much mood, warmth, energy, and feeling come through in the voices."
                    />

                    <SettingSelect
                        label="Voice Variety"
                        value={settings.voiceVariety}
                        options={LISTENING_REALISM_OPTIONS.voiceVariety}
                        onChange={(value) => updateSetting('voiceVariety', value)}
                        helper="Increases persona distinction across speakers so conversations feel less repetitive."
                    />

                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saved ? <><Check size={18} /> Saved!</> : saving ? 'Saving...' : <><Save size={18} /> Save Listening Defaults</>}
                    </button>
                </div>

                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>
                        <Sparkles size={18} /> What these defaults affect
                    </h4>

                    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' }}>
                            <div className="font-medium" style={{ marginBottom: '6px' }}>Script quality</div>
                            <div className="text-sm text-muted">OpenAI now generates richer speaker personas, more believable contexts, and cleaner dialogue designed for text-to-speech.</div>
                        </div>

                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' }}>
                            <div className="font-medium" style={{ marginBottom: '6px' }}>Voice casting</div>
                            <div className="text-sm text-muted">ElevenLabs voices are selected using speaker role, age, gender, emotional tone, and pacing instead of simple male/female labels.</div>
                        </div>

                        <div style={{ padding: 'var(--space-4)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' }}>
                            <div className="font-medium" style={{ marginBottom: '6px' }}>Reliability</div>
                            <div className="text-sm text-muted">Scripts are validated before audio generation to avoid awkward formatting, broken turns, and TTS-unfriendly output.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
