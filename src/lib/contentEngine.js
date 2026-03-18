/**
 * Content Engine – Implements the Reuse-First Strategy.
 * Search global library → reuse if found → generate if not → store for future reuse.
 */

import { supabase } from './supabase';
import * as ai from './aiService';
import { enforceRateLimit } from './rateLimiter';

// ========================================
// Content Hash Generation
// ========================================

async function generateContentHash(text) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        console.warn('crypto.subtle not available, using fallback hash:', error);
        // Simple fallback hash for non-secure contexts
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }
}

// ========================================
// Usage Tracking
// ========================================

async function logContentUsage(contentItemId, organizationId, studentId) {
    await supabase.from('content_usage_log').insert({
        content_item_id: contentItemId,
        organization_id: organizationId,
        student_id: studentId,
    });

    // Increment usage count
    try {
        const { error: rpcError } = await supabase.rpc('increment_usage_count', { item_id: contentItemId });
        if (rpcError) {
            // Fallback: fetch current count and increment manually
            const { data: item } = await supabase
                .from('global_content_items')
                .select('usage_count')
                .eq('id', contentItemId)
                .single();
            await supabase
                .from('global_content_items')
                .update({
                    usage_count: (item?.usage_count || 0) + 1,
                    last_used_at: new Date().toISOString(),
                })
                .eq('id', contentItemId);
        }
    } catch {
        // Non-critical — ignore usage count errors
    }
}

async function logAIUsage(organizationId, module, action, tokensUsed, wasCacheHit = false) {
    // Rough cost estimate: GPT-4o-mini ~$0.15/1M input + $0.60/1M output
    const costEstimate = (tokensUsed / 1000000) * 0.375;

    await supabase.from('ai_usage_log').insert({
        organization_id: organizationId,
        module,
        action,
        tokens_used: tokensUsed,
        cost_estimate: costEstimate,
        was_cache_hit: wasCacheHit,
    });
}

// ========================================
// Reuse-First Content Retrieval
// ========================================

/**
 * Search for existing content that matches the requested parameters.
 * If found, reuse it. If not, generate new content via AI.
 */
export async function getOrCreateReadingContent({
    topic,
    difficulty = 'band_6_7',
    ieltsType = 'academic',
    passage = 1,
    questionTypes = ['mcq', 'tfng', 'fill_blank'],
    organizationId = null,
    studentId = null,
}) {
    const passageTag = `passage_${passage}`;

    // Step 1: Search for existing content matching passage type
    let query = supabase
        .from('global_content_items')
        .select('*, global_question_sets(*)')
        .eq('module', 'reading')
        .eq('content_type', 'reading_passage')
        .eq('status', 'active')
        .eq('difficulty', difficulty)
        .eq('ielts_type', ieltsType)
        .contains('topic_tags', [passageTag]);

    // Try topic match
    if (topic) {
        query = query.contains('topic_tags', [topic.toLowerCase()]);
    }

    const { data: existing } = await query.limit(5);

    // Step 2: If found, pick one randomly and reuse
    if (existing && existing.length > 0) {
        const picked = existing[Math.floor(Math.random() * existing.length)];

        await logContentUsage(picked.id, organizationId, studentId);
        await logAIUsage(organizationId, 'reading', 'content_generation', 0, true);

        return {
            contentItem: picked,
            questionSet: picked.global_question_sets?.[0] || null,
            wasReused: true,
        };
    }

    // Step 3: Generate new content via AI
    if (organizationId && studentId) await enforceRateLimit(studentId, organizationId);
    const { passage: passageText, tokensUsed: passageTokens } = await ai.generateReadingPassage(
        topic || 'general knowledge',
        difficulty,
        ieltsType,
        passage
    );

    const { questions, tokensUsed: questionTokens } = await ai.generateReadingQuestions(
        passageText,
        questionTypes,
        13
    );

    const totalTokens = passageTokens + questionTokens;
    const contentHash = await generateContentHash(passageText);

    // Step 4: Store in global library
    const { data: newContent, error: contentError } = await supabase
        .from('global_content_items')
        .insert({
            content_type: 'reading_passage',
            module: 'reading',
            ielts_type: ieltsType,
            difficulty,
            title: passageText.split('\n')[0]?.replace(/^#\s*/, '').substring(0, 100) || 'Reading Passage',
            body: passageText,
            topic_tags: [passageTag, ...(topic ? [topic.toLowerCase()] : [])],
            question_types: questionTypes,
            created_by: 'ai',
            status: 'active',
            usage_count: 1,
            last_used_at: new Date().toISOString(),
            content_hash: contentHash,
        })
        .select()
        .single();

    if (contentError) {
        console.error('Error storing content:', contentError);
        // Still return the generated content even if storage fails
        return {
            contentItem: { body: passage, title: 'Reading Passage' },
            questionSet: { questions, answer_key: questions.map(q => q.correctAnswer) },
            wasReused: false,
        };
    }

    // Store question set
    const { data: newQuestionSet } = await supabase
        .from('global_question_sets')
        .insert({
            content_item_id: newContent.id,
            questions,
            answer_key: questions.map(q => ({ index: q.index, answer: q.correctAnswer })),
            explanations: questions.map(q => ({ index: q.index, explanation: q.explanation })),
            question_format: questionTypes.join(','),
        })
        .select()
        .single();

    // Log usage
    await logContentUsage(newContent.id, organizationId, studentId);
    await logAIUsage(organizationId, 'reading', 'content_generation', totalTokens, false);

    return {
        contentItem: newContent,
        questionSet: newQuestionSet,
        wasReused: false,
    };
}

/**
 * Get or create listening content with audio.
 */
export async function getOrCreateListeningContent({
    topic,
    difficulty = 'band_6_7',
    section = 1,
    ieltsType = 'academic',
    organizationId = null,
    studentId = null,
}) {
    // Search for existing listening content matching section and ielts_type
    const { data: existing } = await supabase
        .from('global_content_items')
        .select('*, global_question_sets(*), global_listening_audio(*)')
        .eq('module', 'listening')
        .eq('content_type', 'listening_script')
        .eq('status', 'active')
        .eq('difficulty', difficulty)
        .in('ielts_type', [ieltsType, 'both'])
        .contains('topic_tags', [`section_${section}`])
        .limit(5);

    if (existing && existing.length > 0) {
        const picked = existing[Math.floor(Math.random() * existing.length)];
        await logContentUsage(picked.id, organizationId, studentId);
        await logAIUsage(organizationId, 'listening', 'content_generation', 0, true);

        return {
            contentItem: picked,
            questionSet: picked.global_question_sets?.[0] || null,
            audio: picked.global_listening_audio?.[0] || null,
            wasReused: true,
        };
    }

    // Generate new
    if (organizationId && studentId) await enforceRateLimit(studentId, organizationId);
    const { script, tokensUsed: scriptTokens } = await ai.generateListeningScript(
        topic || 'daily life',
        difficulty,
        section
    );

    const { questions, tokensUsed: questionTokens } = await ai.generateListeningQuestions(script, 10);
    const contentHash = await generateContentHash(script);

    const { data: newContent } = await supabase
        .from('global_content_items')
        .insert({
            content_type: 'listening_script',
            module: 'listening',
            ielts_type: ieltsType,
            difficulty,
            title: `Listening Section ${section} - ${topic || 'General'}`,
            body: script,
            topic_tags: [topic ? topic.toLowerCase() : 'general', `section_${section}`],
            question_types: ['fill_blank', 'mcq', 'matching'],
            created_by: 'ai',
            status: 'active',
            usage_count: 1,
            content_hash: contentHash,
        })
        .select()
        .single();

    if (newContent) {
        await supabase.from('global_question_sets').insert({
            content_item_id: newContent.id,
            questions,
            answer_key: questions.map(q => ({ index: q.index, answer: q.correctAnswer })),
            explanations: questions.map(q => ({ index: q.index, explanation: q.explanation })),
            question_format: 'mixed',
        });

        await logContentUsage(newContent.id, organizationId, studentId);
    }

    await logAIUsage(organizationId, 'listening', 'content_generation', scriptTokens + questionTokens, false);

    return {
        contentItem: newContent || { body: script },
        questionSet: { questions },
        audio: null, // Audio generated separately via audioEngine
        wasReused: false,
    };
}

/**
 * Get or create a writing prompt.
 */
export async function getOrCreateWritingPrompt({
    taskType = 2,
    ieltsType = 'academic',
    topic,
    task1Subtype = null,
    organizationId = null,
    studentId = null,
}) {
    // Academic Task 1: always generate fresh to ensure variety in chart types and data
    const alwaysFresh = (taskType === 1 && ieltsType === 'academic');

    if (!alwaysFresh) {
        const requiredTags = [`task_${taskType}`];
        const { data: existing } = await supabase
            .from('global_content_items')
            .select('*')
            .eq('module', 'writing')
            .eq('content_type', 'writing_prompt')
            .eq('status', 'active')
            .eq('ielts_type', ieltsType)
            .contains('question_types', requiredTags)
            .limit(10);

        if (existing && existing.length > 0) {
            const picked = existing[Math.floor(Math.random() * existing.length)];
            await logContentUsage(picked.id, organizationId, studentId);
            await logAIUsage(organizationId, 'writing', 'content_generation', 0, true);
            return { contentItem: picked, wasReused: true };
        }
    }

    // Generate new
    if (organizationId && studentId) await enforceRateLimit(studentId, organizationId);
    const { prompt, isStructured, tokensUsed } = await ai.generateWritingPrompt(taskType, ieltsType, topic || 'society', task1Subtype);
    const contentHash = await generateContentHash(prompt);

    const qTypes = [`task_${taskType}`];
    if (task1Subtype) qTypes.push(task1Subtype);
    if (isStructured) qTypes.push('structured_visual');

    const { data: newContent, error: insertError } = await supabase
        .from('global_content_items')
        .insert({
            content_type: 'writing_prompt',
            module: 'writing',
            ielts_type: ieltsType,
            difficulty: 'band_6_7',
            title: `Writing Task ${taskType}${task1Subtype ? ` (${task1Subtype})` : ''} - ${topic || 'General'}`,
            body: prompt,
            topic_tags: topic ? [topic.toLowerCase()] : [],
            question_types: qTypes,
            created_by: 'ai',
            status: 'active',
            usage_count: 1,
            content_hash: contentHash,
        })
        .select()
        .single();

    if (insertError) {
        console.error('[ContentEngine] Error storing writing prompt:', insertError);
    }

    if (newContent) {
        await logContentUsage(newContent.id, organizationId, studentId);
    }
    await logAIUsage(organizationId, 'writing', 'content_generation', tokensUsed, false);

    return { contentItem: newContent || { body: prompt, title: `Writing Task ${taskType}` }, wasReused: false };
}

/**
 * Get or create speaking questions.
 */
export async function getOrCreateSpeakingQuestions({
    part = 1,
    ieltsType = 'academic',
    topic,
    organizationId = null,
    studentId = null,
}) {
    const { data: existing } = await supabase
        .from('global_content_items')
        .select('*')
        .eq('module', 'speaking')
        .eq('content_type', 'speaking_question_set')
        .eq('status', 'active')
        .contains('question_types', [`part_${part}`])
        .limit(10);

    if (existing && existing.length > 0) {
        const picked = existing[Math.floor(Math.random() * existing.length)];
        await logContentUsage(picked.id, organizationId, studentId);
        return { contentItem: picked, wasReused: true };
    }

    if (organizationId && studentId) await enforceRateLimit(studentId, organizationId);
    const { questionSet, tokensUsed } = await ai.generateSpeakingQuestions(part, topic || 'everyday life');
    const contentHash = await generateContentHash(JSON.stringify(questionSet));

    const { data: newContent } = await supabase
        .from('global_content_items')
        .insert({
            content_type: 'speaking_question_set',
            module: 'speaking',
            ielts_type: ieltsType,
            difficulty: 'band_6_7',
            title: `Speaking Part ${part} - ${topic || 'General'}`,
            body: JSON.stringify(questionSet),
            topic_tags: topic ? [topic.toLowerCase()] : [],
            question_types: [`part_${part}`],
            created_by: 'ai',
            status: 'active',
            usage_count: 1,
            content_hash: contentHash,
        })
        .select()
        .single();

    if (newContent) {
        await logContentUsage(newContent.id, organizationId, studentId);
    }
    await logAIUsage(organizationId, 'speaking', 'content_generation', tokensUsed, false);

    return { contentItem: newContent || { body: JSON.stringify(questionSet) }, wasReused: false };
}
