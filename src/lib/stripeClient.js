/**
 * Stripe Client – Frontend wrapper for Stripe Edge Function calls.
 * Calls the Supabase Edge Function `stripe-billing` for server-side operations.
 */

import { supabase } from './supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-billing`;

async function callStripeFunction(action, params = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action, ...params }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Stripe operation failed');
    return data;
}

// Create or retrieve Stripe Customer for an org
export async function createCustomer(organizationId) {
    return callStripeFunction('create-customer', { organizationId });
}

// Create Setup Intent for saving a card
export async function createSetupIntent(organizationId) {
    return callStripeFunction('create-setup-intent', { organizationId });
}

// List saved payment methods for an org
export async function listPaymentMethods(organizationId) {
    return callStripeFunction('list-payment-methods', { organizationId });
}

// Set a payment method as default
export async function setDefaultPaymentMethod(organizationId, paymentMethodId) {
    return callStripeFunction('set-default-payment-method', { organizationId, paymentMethodId });
}

// Remove a saved card
export async function detachPaymentMethod(organizationId, paymentMethodId) {
    return callStripeFunction('detach-payment-method', { organizationId, paymentMethodId });
}

// Create and send a Stripe invoice (SuperAdmin)
export async function createStripeInvoice(invoiceId) {
    return callStripeFunction('create-stripe-invoice', { invoiceId });
}

// Pay an invoice using the org's saved payment method
export async function payInvoice(invoiceId) {
    return callStripeFunction('pay-invoice', { invoiceId });
}
