// Supabase Edge Function: stripe-billing
// Handles all Stripe server-side operations
// Deploy: supabase functions deploy stripe-billing --no-verify-jwt

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('No authorization header')

        // Verify the user via Supabase
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) throw new Error('Unauthorized')

        // Get user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, role, organization_id')
            .eq('id', user.id)
            .single()

        if (!profile) throw new Error('Profile not found')

        const { action, ...params } = await req.json()

        let result: any

        switch (action) {
            // ========== Create or get Stripe Customer for an Org ==========
            case 'create-customer': {
                const { organizationId } = params
                if (profile.role !== 'super_admin' && profile.organization_id !== organizationId) {
                    throw new Error('Access denied')
                }

                // Check if customer already exists
                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id')
                    .eq('organization_id', organizationId)
                    .maybeSingle()

                if (orgBilling?.stripe_customer_id) {
                    const customer = await stripe.customers.retrieve(orgBilling.stripe_customer_id)
                    result = { customerId: customer.id }
                    break
                }

                // Get org details
                const { data: org } = await supabase
                    .from('organizations')
                    .select('name, billing_email')
                    .eq('id', organizationId)
                    .single()

                const customer = await stripe.customers.create({
                    name: org?.name || 'Unknown Organization',
                    email: org?.billing_email || undefined,
                    metadata: { organization_id: organizationId },
                })

                // Save Stripe customer ID
                await supabase
                    .from('org_billing_settings')
                    .upsert({
                        organization_id: organizationId,
                        stripe_customer_id: customer.id,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'organization_id' })

                result = { customerId: customer.id }
                break
            }

            // ========== Create Setup Intent (for saving cards) ==========
            case 'create-setup-intent': {
                const { organizationId } = params
                if (profile.role !== 'super_admin' && profile.organization_id !== organizationId) {
                    throw new Error('Access denied')
                }

                // Ensure customer exists
                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id')
                    .eq('organization_id', organizationId)
                    .maybeSingle()

                let customerId = orgBilling?.stripe_customer_id

                if (!customerId) {
                    // Auto-create customer
                    const { data: org } = await supabase
                        .from('organizations')
                        .select('name, billing_email')
                        .eq('id', organizationId)
                        .single()

                    const customer = await stripe.customers.create({
                        name: org?.name || 'Unknown Organization',
                        email: org?.billing_email || undefined,
                        metadata: { organization_id: organizationId },
                    })
                    customerId = customer.id

                    await supabase
                        .from('org_billing_settings')
                        .upsert({
                            organization_id: organizationId,
                            stripe_customer_id: customerId,
                            updated_at: new Date().toISOString(),
                        }, { onConflict: 'organization_id' })
                }

                const setupIntent = await stripe.setupIntents.create({
                    customer: customerId,
                    payment_method_types: ['card'],
                    metadata: { organization_id: organizationId },
                })

                result = { clientSecret: setupIntent.client_secret, customerId }
                break
            }

            // ========== List Payment Methods ==========
            case 'list-payment-methods': {
                const { organizationId } = params
                if (profile.role !== 'super_admin' && profile.organization_id !== organizationId) {
                    throw new Error('Access denied')
                }

                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id')
                    .eq('organization_id', organizationId)
                    .maybeSingle()

                if (!orgBilling?.stripe_customer_id) {
                    result = { paymentMethods: [] }
                    break
                }

                const paymentMethods = await stripe.paymentMethods.list({
                    customer: orgBilling.stripe_customer_id,
                    type: 'card',
                })

                // Get default payment method
                const customer = await stripe.customers.retrieve(orgBilling.stripe_customer_id) as Stripe.Customer
                const defaultPm = customer.invoice_settings?.default_payment_method

                result = {
                    paymentMethods: paymentMethods.data.map(pm => ({
                        id: pm.id,
                        brand: pm.card?.brand,
                        last4: pm.card?.last4,
                        expMonth: pm.card?.exp_month,
                        expYear: pm.card?.exp_year,
                        isDefault: pm.id === defaultPm,
                    })),
                }
                break
            }

            // ========== Set Default Payment Method ==========
            case 'set-default-payment-method': {
                const { organizationId, paymentMethodId } = params
                if (profile.role !== 'super_admin' && profile.organization_id !== organizationId) {
                    throw new Error('Access denied')
                }

                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id')
                    .eq('organization_id', organizationId)
                    .maybeSingle()

                if (!orgBilling?.stripe_customer_id) throw new Error('No Stripe customer found')

                await stripe.customers.update(orgBilling.stripe_customer_id, {
                    invoice_settings: { default_payment_method: paymentMethodId },
                })

                result = { success: true }
                break
            }

            // ========== Detach Payment Method ==========
            case 'detach-payment-method': {
                const { organizationId, paymentMethodId } = params
                if (profile.role !== 'super_admin' && profile.organization_id !== organizationId) {
                    throw new Error('Access denied')
                }

                await stripe.paymentMethods.detach(paymentMethodId)
                result = { success: true }
                break
            }

            // ========== Create & Send Stripe Invoice ==========
            case 'create-stripe-invoice': {
                if (profile.role !== 'super_admin') throw new Error('Only super admins can create Stripe invoices')

                const { invoiceId } = params

                // Get our invoice
                const { data: inv } = await supabase
                    .from('invoices')
                    .select('*, organizations(name, billing_email)')
                    .eq('id', invoiceId)
                    .single()

                if (!inv) throw new Error('Invoice not found')

                // Get org Stripe customer + auto_charge preference
                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id, auto_charge_enabled')
                    .eq('organization_id', inv.organization_id)
                    .maybeSingle()

                if (!orgBilling?.stripe_customer_id) {
                    throw new Error('Organization has no Stripe customer. Please set up payment methods first.')
                }

                // Use charge_automatically only if org admin opted in, otherwise send_invoice
                const autoCharge = orgBilling.auto_charge_enabled === true
                const collectionMethod = autoCharge ? 'charge_automatically' : 'send_invoice'

                // Create Stripe invoice (set currency explicitly to match invoice items)
                const invoiceParams: any = {
                    customer: orgBilling.stripe_customer_id,
                    currency: (inv.currency || 'usd').toLowerCase(),
                    collection_method: collectionMethod,
                    auto_advance: true,
                    metadata: {
                        elang_invoice_id: inv.id,
                        organization_id: inv.organization_id,
                    },
                }

                // due_date is only valid for send_invoice collection method
                if (!autoCharge) {
                    invoiceParams.due_date = Math.floor(new Date(inv.due_date).getTime() / 1000)
                }

                const stripeInvoice = await stripe.invoices.create(invoiceParams)

                // Add line item
                await stripe.invoiceItems.create({
                    customer: orgBilling.stripe_customer_id,
                    invoice: stripeInvoice.id,
                    amount: Math.round(parseFloat(inv.amount) * 100), // cents
                    currency: (inv.currency || 'usd').toLowerCase(),
                    description: `${inv.license_count} licenses × ${inv.license_unit_cost}/license (${inv.period_start} to ${inv.period_end})`,
                })

                // Finalize and send
                const finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id)

                // Update our invoice with Stripe references
                await supabase
                    .from('invoices')
                    .update({
                        stripe_invoice_id: finalizedInvoice.id,
                        stripe_invoice_url: finalizedInvoice.hosted_invoice_url,
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', invoiceId)

                result = {
                    stripeInvoiceId: finalizedInvoice.id,
                    hostedUrl: finalizedInvoice.hosted_invoice_url,
                    pdfUrl: finalizedInvoice.invoice_pdf,
                }
                break
            }

            // ========== Pay Invoice Now (org admin self-service) ==========
            case 'pay-invoice': {
                const { invoiceId } = params

                // Get our invoice
                const { data: inv } = await supabase
                    .from('invoices')
                    .select('*')
                    .eq('id', invoiceId)
                    .single()

                if (!inv) throw new Error('Invoice not found')

                // Org admins can only pay their own invoices
                if (profile.role !== 'super_admin' && profile.organization_id !== inv.organization_id) {
                    throw new Error('Access denied')
                }

                // If invoice already has a Stripe invoice, pay it
                if (inv.stripe_invoice_id) {
                    const paidInvoice = await stripe.invoices.pay(inv.stripe_invoice_id)

                    if (paidInvoice.status === 'paid') {
                        await supabase.from('invoices').update({
                            status: 'paid',
                            paid_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        }).eq('id', invoiceId)

                        await supabase.from('payments').insert({
                            invoice_id: invoiceId,
                            organization_id: inv.organization_id,
                            amount: inv.amount,
                            payment_method: 'stripe',
                            stripe_payment_id: paidInvoice.payment_intent as string,
                            recorded_by: profile.id,
                        })

                        await supabase.from('organizations').update({
                            last_payment_date: new Date().toISOString(),
                            billing_status: 'active',
                        }).eq('id', inv.organization_id)
                    }

                    result = { status: paidInvoice.status, paid: paidInvoice.status === 'paid' }
                    break
                }

                // No Stripe invoice yet — create one and pay immediately
                const { data: orgBilling } = await supabase
                    .from('org_billing_settings')
                    .select('stripe_customer_id')
                    .eq('organization_id', inv.organization_id)
                    .maybeSingle()

                if (!orgBilling?.stripe_customer_id) {
                    throw new Error('No payment method on file. Please add a card first.')
                }

                const stripeInv = await stripe.invoices.create({
                    customer: orgBilling.stripe_customer_id,
                    collection_method: 'charge_automatically',
                    auto_advance: true,
                    metadata: { elang_invoice_id: inv.id, organization_id: inv.organization_id },
                })

                await stripe.invoiceItems.create({
                    customer: orgBilling.stripe_customer_id,
                    invoice: stripeInv.id,
                    amount: Math.round(parseFloat(inv.amount) * 100),
                    currency: (inv.currency || 'usd').toLowerCase(),
                    description: `${inv.license_count} licenses × ${inv.license_unit_cost}/license`,
                })

                const finalized = await stripe.invoices.finalizeInvoice(stripeInv.id)
                const paid = await stripe.invoices.pay(finalized.id)

                await supabase.from('invoices').update({
                    stripe_invoice_id: paid.id,
                    stripe_invoice_url: paid.hosted_invoice_url,
                    status: paid.status === 'paid' ? 'paid' : 'sent',
                    paid_at: paid.status === 'paid' ? new Date().toISOString() : null,
                    sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }).eq('id', invoiceId)

                if (paid.status === 'paid') {
                    await supabase.from('payments').insert({
                        invoice_id: invoiceId,
                        organization_id: inv.organization_id,
                        amount: inv.amount,
                        payment_method: 'stripe',
                        stripe_payment_id: paid.payment_intent as string,
                        recorded_by: profile.id,
                    })

                    await supabase.from('organizations').update({
                        last_payment_date: new Date().toISOString(),
                        billing_status: 'active',
                    }).eq('id', inv.organization_id)
                }

                result = { status: paid.status, paid: paid.status === 'paid' }
                break
            }

            default:
                throw new Error(`Unknown action: ${action}`)
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (err) {
        console.error('stripe-billing error:', err)
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
