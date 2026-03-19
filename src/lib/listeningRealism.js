export const DEFAULT_LISTENING_REALISM_SETTINGS = {
    realismMode: 'immersive',
    accentProfile: 'mixed_english',
    ageRealism: 'strong',
    emotionalExpressiveness: 'high',
    voiceVariety: 'high',
};

export const LISTENING_REALISM_OPTIONS = {
    realismMode: [
        { value: 'balanced', label: 'Balanced' },
        { value: 'immersive', label: 'Immersive' },
        { value: 'cinematic', label: 'Cinematic' },
    ],
    accentProfile: [
        { value: 'mixed_english', label: 'Mixed English' },
        { value: 'british_leaning', label: 'British-leaning' },
        { value: 'australian_leaning', label: 'Australian-leaning' },
        { value: 'north_american_leaning', label: 'North American-leaning' },
        { value: 'neutral_international', label: 'Neutral international' },
    ],
    ageRealism: [
        { value: 'moderate', label: 'Moderate' },
        { value: 'strong', label: 'Strong' },
        { value: 'strict', label: 'Strict' },
    ],
    emotionalExpressiveness: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
    ],
    voiceVariety: [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
        { value: 'max', label: 'Maximum' },
    ],
};

export function normalizeListeningRealismSettings(settings = {}) {
    return {
        ...DEFAULT_LISTENING_REALISM_SETTINGS,
        ...(settings && typeof settings === 'object' ? settings : {}),
    };
}

export function getListeningRealismProfileKey(settings = {}) {
    const normalized = normalizeListeningRealismSettings(settings);
    return [
        normalized.realismMode,
        normalized.accentProfile,
        normalized.ageRealism,
        normalized.emotionalExpressiveness,
        normalized.voiceVariety,
    ].join('__');
}
