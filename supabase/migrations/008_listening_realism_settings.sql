-- ================================================================
-- eLanguage Center – Listening Realism Defaults
-- Adds organization-level defaults for listening generation realism.
-- ================================================================

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS listening_realism_settings JSONB DEFAULT '{
  "realismMode": "immersive",
  "accentProfile": "mixed_english",
  "ageRealism": "strong",
  "emotionalExpressiveness": "high",
  "voiceVariety": "high"
}'::jsonb;
