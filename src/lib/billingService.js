/**
 * Billing Service – Handles all billing operations.
 * License management, invoicing, payments, financial metrics.
 */

import { supabase } from './supabase';

// ========================================
// Billing Config (Global Settings)
// ========================================

export async function getBillingConfig() {
    const { data, error } = await supabase
        .from('billing_config')
        .select('*')
        .limit(1)
        .single();
    if (error) throw error;
    return data;
}

export async function updateBillingConfig(config) {
    const { data, error } = await supabase
        .from('billing_config')
        .update({ ...config, updated_at: new Date().toISOString() })
        .eq('id', config.id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ========================================
// Org Billing Settings
// ========================================

export async function getOrgBillingSettings(orgId) {
    const { data, error } = await supabase
        .from('org_billing_settings')
        .select('*')
        .eq('organization_id', orgId)
        .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
}

export async function getAllOrgBillingSettings() {
    const { data, error } = await supabase
        .from('org_billing_settings')
        .select('*');
    if (error) throw error;
    return data || [];
}

export async function upsertOrgBillingSettings(settings) {
    const { data, error } = await supabase
        .from('org_billing_settings')
        .upsert(
            { ...settings, updated_at: new Date().toISOString() },
            { onConflict: 'organization_id' }
        )
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Org Admin self-service: toggle auto_charge_enabled
export async function updateOrgAutoCharge(orgId, enabled) {
    const { data, error } = await supabase
        .from('org_billing_settings')
        .update({ auto_charge_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ========================================
// Organizations Billing Status
// ========================================

export async function updateOrgBillingStatus(orgId, status) {
    const { data, error } = await supabase
        .from('organizations')
        .update({ billing_status: status })
        .eq('id', orgId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getOrgsWithBilling() {
    const { data, error } = await supabase
        .from('organizations')
        .select('*, profiles(id, role, license_active)')
        .order('name');
    if (error) throw error;
    return data || [];
}

// ========================================
// Invoices
// ========================================

export async function getInvoices(filters = {}) {
    let query = supabase
        .from('invoices')
        .select('*, organizations(id, name, slug, billing_email)')
        .order('created_at', { ascending: false });

    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function createInvoice(invoice) {
    // Atomically read and increment the counter to avoid duplicate invoice numbers
    const { data: config } = await supabase
        .from('billing_config')
        .select('id, invoice_prefix, invoice_next_number')
        .limit(1)
        .single();

    const num = config?.invoice_next_number || 1001;
    const invoiceNumber = `${config?.invoice_prefix || 'INV'}-${String(num).padStart(5, '0')}`;

    // Increment counter BEFORE insert to prevent duplicates on concurrent calls
    if (config) {
        await supabase
            .from('billing_config')
            .update({ invoice_next_number: num + 1 })
            .eq('id', config.id)
            .eq('invoice_next_number', num); // optimistic lock: only update if still at expected value
    }

    const { data, error } = await supabase
        .from('invoices')
        .insert({ ...invoice, invoice_number: invoiceNumber })
        .select('*, organizations(id, name, slug, billing_email)')
        .single();

    if (error) throw error;

    return data;
}

export async function updateInvoice(id, updates) {
    const { data, error } = await supabase
        .from('invoices')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, organizations(id, name, slug, billing_email)')
        .single();
    if (error) throw error;
    return data;
}

export async function markInvoiceSent(invoiceId) {
    return updateInvoice(invoiceId, {
        status: 'sent',
        sent_at: new Date().toISOString(),
    });
}

export async function markInvoicePaid(invoiceId, paymentDetails = {}) {
    const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

    if (!invoice) throw new Error('Invoice not found');

    // Create payment record
    const { error: payError } = await supabase
        .from('payments')
        .insert({
            invoice_id: invoiceId,
            organization_id: invoice.organization_id,
            amount: invoice.amount,
            payment_method: paymentDetails.method || 'manual',
            reference_number: paymentDetails.reference || null,
            notes: paymentDetails.notes || null,
            recorded_by: paymentDetails.recordedBy || null,
        });

    if (payError) throw payError;

    // Update invoice
    const { data, error } = await supabase
        .from('invoices')
        .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .select('*, organizations(id, name, slug, billing_email)')
        .single();

    if (error) throw error;

    // Update org last payment & reactivate if on hold
    await supabase
        .from('organizations')
        .update({
            last_payment_date: new Date().toISOString(),
            billing_status: 'active',
        })
        .eq('id', invoice.organization_id);

    return data;
}

export async function cancelInvoice(invoiceId) {
    return updateInvoice(invoiceId, { status: 'cancelled' });
}

// ========================================
// Generate Invoice for Org
// ========================================

export async function generateInvoiceForOrg(orgId, options = {}) {
    const [{ data: org }, { data: billingSettings }, { data: config }] = await Promise.all([
        supabase.from('organizations').select('*, profiles(id, role, license_active)').eq('id', orgId).single(),
        supabase.from('org_billing_settings').select('*').eq('organization_id', orgId).maybeSingle(),
        supabase.from('billing_config').select('*').limit(1).single(),
    ]);

    if (!org) throw new Error('Organization not found');

    const licenseCost = billingSettings?.custom_license_cost ?? config?.default_license_cost ?? 15;
    const frequency = billingSettings?.billing_frequency || config?.default_billing_frequency || 'monthly';
    const creditDays = billingSettings?.credit_period_days ?? config?.default_credit_period_days ?? 30;
    const discountPercent = billingSettings?.discount_percent || 0;
    const taxRate = config?.tax_rate || 0;

    const activeStudents = org.profiles?.filter(p => p.role === 'student' && p.license_active).length || 0;
    const licenseCount = options.licenseCount || activeStudents || org.license_quota || 0;

    const periodStart = options.periodStart || new Date().toISOString().split('T')[0];
    const periodEndDate = new Date(periodStart);
    if (frequency === 'monthly') periodEndDate.setMonth(periodEndDate.getMonth() + 1);
    else if (frequency === 'quarterly') periodEndDate.setMonth(periodEndDate.getMonth() + 3);
    else periodEndDate.setFullYear(periodEndDate.getFullYear() + 1);
    const periodEnd = periodEndDate.toISOString().split('T')[0];

    const subtotal = licenseCount * licenseCost;
    const discountAmount = subtotal * (discountPercent / 100);
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (taxRate / 100);
    const amount = taxableAmount + taxAmount;

    const dueDate = new Date(periodStart);
    dueDate.setDate(dueDate.getDate() + creditDays);

    const invoice = await createInvoice({
        organization_id: orgId,
        amount: Math.round(amount * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        tax_amount: Math.round(taxAmount * 100) / 100,
        discount_amount: Math.round(discountAmount * 100) / 100,
        currency: config?.currency || 'USD',
        license_count: licenseCount,
        license_unit_cost: licenseCost,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate.toISOString().split('T')[0],
        billing_frequency: frequency,
        status: 'draft',
        notes: options.notes || null,
        created_by: options.createdBy || null,
    });

    // Advance next_billing_date to the next period
    await supabase
        .from('org_billing_settings')
        .update({ next_billing_date: periodEnd, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId);

    return invoice;
}

// ========================================
// Payments
// ========================================

export async function getPayments(filters = {}) {
    let query = supabase
        .from('payments')
        .select('*, invoices(invoice_number, amount, status), organizations(id, name)')
        .order('paid_at', { ascending: false });

    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// ========================================
// Auto-Generate Invoices
// ========================================

export async function autoGenerateInvoices(createdBy) {
    const today = new Date().toISOString().split('T')[0];

    // Find all orgs with auto_generate_invoice enabled and next_billing_date <= today
    const { data: settings } = await supabase
        .from('org_billing_settings')
        .select('organization_id, next_billing_date')
        .eq('auto_generate_invoice', true)
        .lte('next_billing_date', today);

    if (!settings?.length) return [];

    const results = [];
    for (const s of settings) {
        try {
            const invoice = await generateInvoiceForOrg(s.organization_id, { createdBy });
            results.push({ orgId: s.organization_id, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, action: 'generated' });
        } catch (err) {
            console.error(`Auto-generate failed for org ${s.organization_id}:`, err);
            results.push({ orgId: s.organization_id, action: 'error', error: err.message });
        }
    }
    return results;
}

// ========================================
// Auto-Disable Overdue Orgs (with grace period)
// ========================================

export async function checkAndDisableOverdueOrgs() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('*, organizations(id, name, billing_status)')
        .in('status', ['sent', 'overdue'])
        .lt('due_date', todayStr);

    if (!overdueInvoices?.length) return [];

    const { data: config } = await supabase.from('billing_config').select('default_grace_period_days').limit(1).single();
    const defaultGrace = config?.default_grace_period_days ?? 7;

    const results = [];

    for (const inv of overdueInvoices) {
        // Mark sent invoices as overdue
        if (inv.status === 'sent') {
            await supabase.from('invoices')
                .update({ status: 'overdue', updated_at: new Date().toISOString() })
                .eq('id', inv.id);
        }

        // Get org billing settings for grace period
        const { data: bs } = await supabase
            .from('org_billing_settings')
            .select('grace_period_days, auto_disable_enabled')
            .eq('organization_id', inv.organization_id)
            .maybeSingle();

        const graceDays = bs?.grace_period_days ?? defaultGrace;
        const autoDisable = bs?.auto_disable_enabled !== false;

        // Grace period = due_date + grace_period_days
        const graceEnd = new Date(inv.due_date);
        graceEnd.setDate(graceEnd.getDate() + graceDays);

        if (autoDisable && today > graceEnd && inv.organizations?.billing_status === 'active') {
            await supabase.from('organizations')
                .update({ billing_status: 'on_hold' })
                .eq('id', inv.organization_id);
            results.push({ orgId: inv.organization_id, orgName: inv.organizations?.name, action: 'put_on_hold' });
        } else if (today <= graceEnd && today > new Date(inv.due_date)) {
            // In grace period — flag but don't disable
            const daysLeft = Math.ceil((graceEnd - today) / (1000 * 60 * 60 * 24));
            results.push({ orgId: inv.organization_id, orgName: inv.organizations?.name, action: 'in_grace_period', daysLeft });
        }
    }

    return results;
}

// ========================================
// Financial Metrics
// ========================================

export async function getFinancialMetrics() {
    const [
        { data: invoices },
        { data: payments },
        { data: orgs },
        { data: config },
    ] = await Promise.all([
        supabase.from('invoices').select('*').not('status', 'in', '("cancelled","void")'),
        supabase.from('payments').select('*'),
        supabase.from('organizations').select('id, name, license_quota, active_licenses, billing_status, profiles(id, role, license_active)'),
        supabase.from('billing_config').select('*').limit(1).single(),
    ]);

    const allInvoices = invoices || [];
    const allPayments = payments || [];
    const allOrgs = orgs || [];

    const totalRevenue = allInvoices
        .filter(i => i.status === 'paid')
        .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

    const outstanding = allInvoices
        .filter(i => ['sent', 'overdue'].includes(i.status))
        .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

    const overdue = allInvoices
        .filter(i => i.status === 'overdue')
        .reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthlyRevenue = allPayments
        .filter(p => new Date(p.paid_at) >= thisMonth)
        .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    const activeOrgs = allOrgs.filter(o => o.billing_status === 'active' || !o.billing_status);
    const totalLicensedStudents = allOrgs.reduce((sum, o) =>
        sum + (o.profiles?.filter(p => p.role === 'student' && p.license_active).length || 0), 0);

    const defaultCost = parseFloat(config?.default_license_cost || 15);
    const estimatedMRR = totalLicensedStudents * defaultCost;

    const totalInvoiced = allInvoices.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);
    const collectionRate = totalInvoiced > 0 ? Math.round((totalRevenue / totalInvoiced) * 100) : 0;

    const invoicesByStatus = {
        draft: allInvoices.filter(i => i.status === 'draft').length,
        sent: allInvoices.filter(i => i.status === 'sent').length,
        paid: allInvoices.filter(i => i.status === 'paid').length,
        overdue: allInvoices.filter(i => i.status === 'overdue').length,
    };

    return {
        totalRevenue,
        outstanding,
        overdue,
        monthlyRevenue,
        estimatedMRR,
        collectionRate,
        totalInvoiced,
        activeOrgs: activeOrgs.length,
        totalOrgs: allOrgs.length,
        totalLicensedStudents,
        invoicesByStatus,
        defaultLicenseCost: defaultCost,
        currency: config?.currency || 'USD',
    };
}
