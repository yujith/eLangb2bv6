/**
 * Rate Limiter – Enforces daily API call limits per user and per organization.
 * Queries ai_usage_log for today's count and compares against org limits.
 */

import { supabase } from './supabase';

/**
 * Check if a user/org is within their daily API rate limit.
 * @param {string} userId - The user's profile ID
 * @param {string} orgId - The organization ID
 * @returns {{ allowed: boolean, userRemaining: number, orgRemaining: number, userLimit: number, orgLimit: number }}
 */
export async function checkRateLimit(userId, orgId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Fetch org limits
    const { data: org } = await supabase
        .from('organizations')
        .select('daily_api_limit_per_user, daily_api_limit_org, is_premium')
        .eq('id', orgId)
        .single();

    // Premium orgs get 5x limits; defaults if columns don't exist yet
    const isPremium = org?.is_premium || false;
    const multiplier = isPremium ? 5 : 1;
    const userLimit = (org?.daily_api_limit_per_user || 50) * multiplier;
    const orgLimit = (org?.daily_api_limit_org || 500) * multiplier;

    // Count today's API calls for this user
    const { count: userCount, error: userErr } = await supabase
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayISO)
        .eq('organization_id', orgId)
        .filter('created_at', 'gte', todayISO);

    // For user-specific count we need a different approach since ai_usage_log
    // doesn't have a user_id column — we'll count via content_usage_log instead
    // or simply use the org-level count. For per-user, we track via content_usage_log.
    const { count: userCallCount } = await supabase
        .from('content_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', userId)
        .gte('used_at', todayISO);

    // Org-level count from ai_usage_log
    const { count: orgCallCount } = await supabase
        .from('ai_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .gte('created_at', todayISO);

    const actualUserCount = userCallCount || 0;
    const actualOrgCount = orgCallCount || 0;

    const userRemaining = Math.max(0, userLimit - actualUserCount);
    const orgRemaining = Math.max(0, orgLimit - actualOrgCount);
    const allowed = userRemaining > 0 && orgRemaining > 0;

    return {
        allowed,
        userRemaining,
        orgRemaining,
        userLimit,
        orgLimit,
        userCount: actualUserCount,
        orgCount: actualOrgCount,
        isPremium,
    };
}

/**
 * Throw a user-friendly error if rate limit exceeded.
 */
export async function enforceRateLimit(userId, orgId) {
    const result = await checkRateLimit(userId, orgId);
    if (!result.allowed) {
        if (result.userRemaining <= 0) {
            throw new Error(
                `Daily API limit reached (${result.userLimit} calls/day). Your limit resets at midnight. ` +
                `Contact your organization admin for higher limits.`
            );
        }
        if (result.orgRemaining <= 0) {
            throw new Error(
                `Your organization has reached its daily API limit (${result.orgLimit} calls/day). ` +
                `Please try again tomorrow or contact your admin.`
            );
        }
    }
    return result;
}
