/**
 * Audio Engine – Handles TTS audio generation with hash-based caching.
 * Biggest cost saver: audio is generated ONCE and reused forever.
 */

import { supabase } from './supabase';
import { generateTTSAudio, parseSpeakerMetaLines, extractListeningScriptBody } from './aiService';
import { normalizeListeningRealismSettings } from './listeningRealism';

const LISTENING_VOICES = {
    examiner_female: 'EXAVITQu4vr4xnSDxMaL',
    examiner_male: 'ErXwobaYiN019PkySvjV',
    passage_female_primary: '21m00Tcm4TlvDq8ikWAM',
    passage_female_secondary: 'AZnzlk1XvdvUeBnXmlld',
    passage_male_primary: 'TxGEqnHWrfWFTfGW9XjX',
    passage_male_secondary: 'VR6AewLTigWG4xSOukaG',
};

const VOICE_STYLE_PRESETS = {
    warm_bright: { stability: 0.42, similarity_boost: 0.78, style: 0.58, use_speaker_boost: true },
    calm_clear: { stability: 0.58, similarity_boost: 0.76, style: 0.35, use_speaker_boost: true },
    helpful_confident: { stability: 0.48, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true },
    energetic_friendly: { stability: 0.38, similarity_boost: 0.81, style: 0.64, use_speaker_boost: true },
    serious_focused: { stability: 0.63, similarity_boost: 0.74, style: 0.28, use_speaker_boost: true },
    thoughtful_measured: { stability: 0.61, similarity_boost: 0.77, style: 0.26, use_speaker_boost: true },
    default: { stability: 0.52, similarity_boost: 0.78, style: 0.4, use_speaker_boost: true },
};

function getVoiceMetadataMap(scriptText = '') {
    const metadata = parseSpeakerMetaLines(scriptText);
    return new Map(metadata.map(item => [item.label, item]));
}

function isExaminerLikeSpeaker(label = '') {
    const normalized = label.toLowerCase();
    return normalized.includes('narrator')
        || normalized.includes('examiner')
        || normalized.includes('instructions')
        || normalized.includes('test voice')
        || normalized.includes('speaker');
}

function inferGenderFromLabel(label = '') {
    const normalized = label.toLowerCase();
    if (normalized.includes('(female)')) return 'female';
    if (normalized.includes('(male)')) return 'male';
    return 'unknown';
}

function inferLifeStageBucket(age = '') {
    const normalized = String(age || '').toLowerCase();
    if (normalized.includes('teen') || normalized.includes('young')) return 'young';
    if (normalized.includes('student')) return 'young';
    if (normalized.includes('senior') || normalized.includes('older') || normalized.includes('retired')) return 'senior';
    return 'adult';
}

export function parseListeningScript(scriptText = '') {
    const lines = extractListeningScriptBody(scriptText)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    const segments = [];
    let current = null;
    const metadataMap = getVoiceMetadataMap(scriptText);

    for (const line of lines) {
        const match = line.match(/^([^:]+):\s*(.+)$/);
        if (match) {
            if (current?.text) {
                segments.push({
                    ...current,
                    text: current.text.trim(),
                });
            }
            const speakerLabel = match[1].trim();
            const persona = metadataMap.get(speakerLabel) || {};
            current = {
                speakerLabel,
                speakerName: speakerLabel.replace(/\s*\((female|male)\)\s*/i, '').trim(),
                gender: persona.gender || inferGenderFromLabel(speakerLabel),
                age: persona.age || 'adult',
                role: persona.role || 'speaker',
                accent: persona.accent || 'neutral_international',
                energy: persona.energy || 'calm_clear',
                emotion: persona.emotion || 'default',
                pace: persona.pace || 'steady_clear',
                text: match[2].trim(),
            };
        } else if (current) {
            current.text += ` ${line}`;
        } else {
            current = {
                speakerLabel: 'NARRATOR',
                speakerName: 'NARRATOR',
                gender: 'unknown',
                age: 'adult',
                role: 'speaker',
                accent: 'neutral_international',
                energy: 'calm_clear',
                emotion: 'default',
                pace: 'steady_clear',
                text: line,
            };
        }
    }

    if (current?.text) {
        segments.push({
            ...current,
            text: current.text.trim(),
        });
    }

    return segments.filter(segment => segment.text);
}

export function buildSpokenAudioText(scriptText = '') {
    const segments = parseListeningScript(scriptText);
    if (segments.length > 0) {
        return segments.map(segment => segment.text).join(' ').trim();
    }

    return extractListeningScriptBody(scriptText)
        .split('\n')
        .map(line => line.replace(/^[^:]{2,80}:\s*/, '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
}

function getVoiceIdForPersona(segment, index) {
    const persona = segment || {};
    const role = String(persona.role || '').toLowerCase();
    const gender = String(persona.gender || 'unknown').toLowerCase();
    const ageBucket = inferLifeStageBucket(persona.age);

    if (isExaminerLikeSpeaker(persona.speakerLabel || persona.label || '') || role.includes('examiner') || role.includes('lecturer') || role.includes('narrator') || role.includes('officer')) {
        return gender === 'male'
            ? LISTENING_VOICES.examiner_male
            : LISTENING_VOICES.examiner_female;
    }

    if (gender === 'female') {
        if (ageBucket === 'young') return LISTENING_VOICES.passage_female_secondary;
        return index % 2 === 0 ? LISTENING_VOICES.passage_female_primary : LISTENING_VOICES.passage_female_secondary;
    }

    if (gender === 'male') {
        if (ageBucket === 'young') return LISTENING_VOICES.passage_male_secondary;
        return index % 2 === 0 ? LISTENING_VOICES.passage_male_primary : LISTENING_VOICES.passage_male_secondary;
    }

    return index % 2 === 0 ? LISTENING_VOICES.passage_female_primary : LISTENING_VOICES.passage_male_primary;
}

function getVoiceSettingsForPersona(segment, realismSettings) {
    const persona = segment || {};
    const normalizedSettings = normalizeListeningRealismSettings(realismSettings);
    const emotionKey = String(persona.emotion || '').toLowerCase();
    const energyKey = String(persona.energy || '').toLowerCase();
    const voiceStyle = VOICE_STYLE_PRESETS[emotionKey] || VOICE_STYLE_PRESETS[energyKey] || VOICE_STYLE_PRESETS.default;
    let styleBoost = 0;
    if (normalizedSettings.emotionalExpressiveness === 'medium') styleBoost = 0.08;
    if (normalizedSettings.emotionalExpressiveness === 'high') styleBoost = 0.16;
    let stabilityOffset = 0;
    if (normalizedSettings.realismMode === 'immersive') stabilityOffset = -0.03;
    if (normalizedSettings.realismMode === 'cinematic') stabilityOffset = -0.06;
    return {
        stability: Math.max(0.25, Math.min(0.8, voiceStyle.stability + stabilityOffset)),
        similarity_boost: voiceStyle.similarity_boost,
        style: Math.max(0, Math.min(1, (voiceStyle.style || 0) + styleBoost)),
        use_speaker_boost: voiceStyle.use_speaker_boost,
    };
}

export function assignVoicesToSegments(scriptText = '', realismSettings = {}) {
    const segments = parseListeningScript(scriptText);
    const speakerVoiceMap = new Map();

    return segments.map((segment, index) => {
        const key = segment.speakerLabel;
        if (!speakerVoiceMap.has(key)) {
            speakerVoiceMap.set(key, {
                voiceId: getVoiceIdForPersona(segment, index),
                voiceSettings: getVoiceSettingsForPersona(segment, realismSettings),
            });
        }

        const assigned = speakerVoiceMap.get(key);
        return {
            ...segment,
            voiceId: assigned.voiceId,
            voiceSettings: assigned.voiceSettings,
        };
    });
}

/**
 * Check if audio already exists for this exact script+voice+speed combination.
 * If yes → return cached URL (no TTS cost)
 * If no → generate via TTS, store in Supabase Storage, cache forever
 */
export async function getOrCreateAudio({
    scriptText,
    contentItemId,
    voiceId = 'pNInz6obpgDQGcFmaJgB', // Default ElevenLabs voice (Adam)
    speed = 1.0,
    settings = {},
    organizationId = null,
}) {
    const normalizedSettings = normalizeListeningRealismSettings(settings);
    const cleanScriptText = extractListeningScriptBody(scriptText);
    const spokenAudioText = buildSpokenAudioText(scriptText);
    const assignedSegments = assignVoicesToSegments(scriptText, normalizedSettings);
    const uniqueSpeakers = new Set(assignedSegments.map(segment => segment.speakerLabel)).size;
    const primaryVoiceId = assignedSegments[0]?.voiceId || voiceId;
    const primaryVoiceSettings = assignedSegments[0]?.voiceSettings || getVoiceSettingsForPersona({}, normalizedSettings);

    if (assignedSegments.length > 1 && uniqueSpeakers > 1) {
        const estimatedDuration = Math.round((cleanScriptText.split(/\s+/).length / 150) * 60 / speed);
        return {
            audioUrl: null,
            duration: estimatedDuration,
            wasReused: false,
            useSegmentedAudio: true,
            audioSegments: assignedSegments,
        };
    }

    // Step 1: Generate deterministic hash
    const audioHash = await generateAudioHash(spokenAudioText, primaryVoiceId, speed, { ...normalizedSettings, ...primaryVoiceSettings });

    // Step 2: Check if audio already exists in Supabase Storage
    const { data: existing } = await supabase
        .from('global_listening_audio')
        .select('*')
        .eq('audio_hash', audioHash)
        .maybeSingle();

    if (existing) {
        // Use signed URL instead of public URL (works even if bucket isn't public)
        const filePath = `listening/${audioHash}.mp3`;
        try {
            const { data: signedData, error: signedErr } = await supabase.storage
                .from('audio')
                .createSignedUrl(filePath, 3600);

            if (!signedErr && signedData?.signedUrl) {
                // Log as cache hit
                await supabase.from('ai_usage_log').insert({
                    organization_id: organizationId,
                    module: 'listening',
                    action: 'tts_generation',
                    tokens_used: 0,
                    cost_estimate: 0,
                    was_cache_hit: true,
                });

                console.log('[AudioEngine] Cache hit, using signed URL');
                return {
                    audioUrl: signedData.signedUrl,
                    duration: existing.duration_seconds,
                    wasReused: true,
                };
            } else {
                console.warn('[AudioEngine] Signed URL failed for cached entry, regenerating:', signedErr);
                await supabase.from('global_listening_audio').delete().eq('id', existing.id);
            }
        } catch (err) {
            console.warn('[AudioEngine] Cache retrieval failed, regenerating:', err.message);
            try {
                await supabase.from('global_listening_audio').delete().eq('id', existing.id);
            } catch (_) {
            }
        }
    }

    // Step 3: Generate new audio via ElevenLabs (with browser TTS fallback)
    try {
        console.log('[AudioEngine] Generating new audio via ElevenLabs...');
        const audioBlob = await generateTTSAudio(spokenAudioText, primaryVoiceId, speed, primaryVoiceSettings);

        // If browser TTS fallback was used, return special marker
        if (audioBlob === '__browser_tts__') {
            return {
                audioUrl: null,
                duration: Math.round((spokenAudioText.split(/\s+/).length / 150) * 60 / speed),
                wasReused: false,
                useBrowserTTS: true,
            };
        }

        console.log('[AudioEngine] ElevenLabs returned blob:', audioBlob.type, audioBlob.size, 'bytes');

        // Create a local blob URL for immediate playback (most reliable)
        const blobUrl = URL.createObjectURL(audioBlob);

        // Step 4: Upload to Supabase Storage in background (for caching)
        const fileName = `listening/${audioHash}.mp3`;
        const wordCount = spokenAudioText.split(/\s+/).length;
        const estimatedDuration = Math.round((wordCount / 150) * 60 / speed);

        // Fire-and-forget: upload & cache metadata in background
        (async () => {
            try {
                const { error: uploadError } = await supabase.storage
                    .from('audio')
                    .upload(fileName, audioBlob, {
                        contentType: 'audio/mpeg',
                        upsert: true,
                    });

                if (uploadError) {
                    console.warn('[AudioEngine] Background upload error (non-fatal):', uploadError);
                    return;
                }

                // Cache audio metadata
                await supabase
                    .from('global_listening_audio')
                    .insert({
                        content_item_id: contentItemId,
                        audio_url: fileName, // Store file path; signed URL generated on retrieval
                        voice_id: primaryVoiceId,
                        speed,
                        settings: { ...normalizedSettings, ...primaryVoiceSettings },
                        audio_hash: audioHash,
                        duration_seconds: estimatedDuration,
                        file_size_bytes: audioBlob.size,
                    })
                    .select()
                    .single();

                console.log('[AudioEngine] Audio cached to Supabase Storage');
            } catch (bgErr) {
                console.warn('[AudioEngine] Background caching failed (non-fatal):', bgErr);
            }

            // Log TTS generation cost
            const charCount = spokenAudioText.length;
            const ttsCost = (charCount / 1000) * 0.30;
            try {
                await supabase.from('ai_usage_log').insert({
                    organization_id: organizationId,
                    module: 'listening',
                    action: 'tts_generation',
                    tokens_used: charCount,
                    cost_estimate: ttsCost,
                    was_cache_hit: false,
                });
            } catch (_) {
            }
        })();

        // Return blob URL immediately for playback
        return {
            audioUrl: blobUrl,
            duration: estimatedDuration,
            wasReused: false,
        };
    } catch (error) {
        console.error('[AudioEngine] TTS generation failed:', error);
        // Final fallback: use browser TTS
        return {
            audioUrl: null,
            duration: Math.round((spokenAudioText.split(/\s+/).length / 150) * 60 / speed),
            wasReused: false,
            useBrowserTTS: true,
        };
    }
}

// ========================================
// Get Existing Audio for Content Item
// ========================================

export async function getAudioForContent(contentItemId) {
    const { data } = await supabase
        .from('global_listening_audio')
        .select('*')
        .eq('content_item_id', contentItemId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    return data;
}

// ========================================
// Audio Playback URL with Signed Access
// ========================================

export async function getSignedAudioUrl(filePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage
        .from('audio')
        .createSignedUrl(filePath, expiresIn);

    if (error) {
        console.error('Error creating signed URL:', error);
        return null;
    }

    return data.signedUrl;
}
