import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import * as stripeClient from '../../lib/stripeClient';
import * as billingService from '../../lib/billingService';
import {
    CreditCard, DollarSign, FileText, Clock, CheckCircle, AlertCircle,
    Plus, Trash2, Star, Send, Eye, Ban, Receipt, Zap, ShieldAlert, ToggleLeft, ToggleRight
} from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const STATUS_COLORS = {
    draft: { bg: '#F3F4F6', color: '#6B7280' },
    sent: { bg: '#DBEAFE', color: '#2563EB' },
    paid: { bg: '#DCFCE7', color: '#16A34A' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
    cancelled: { bg: '#F3F4F6', color: '#9CA3AF' },
};

const fmt = (n, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);

// ========== Card Form (inside Stripe Elements) ==========
function AddCardForm({ organizationId, onSuccess, onCancel }) {
    const stripe = useStripe();
    const elements = useElements();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setSaving(true);
        setError('');

        try {
            // Get setup intent from backend
            const { clientSecret } = await stripeClient.createSetupIntent(organizationId);

            const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(clientSecret, {
                payment_method: { card: elements.getElement(CardElement) },
            });

            if (stripeError) throw new Error(stripeError.message);

            if (setupIntent.status === 'succeeded') {
                // Set as default payment method
                await stripeClient.setDefaultPaymentMethod(organizationId, setupIntent.payment_method);
                onSuccess();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)' }}>
                <CardElement options={{
                    style: {
                        base: {
                            fontSize: '15px',
                            color: '#1F2937',
                            '::placeholder': { color: '#9CA3AF' },
                        },
                    },
                }} />
            </div>
            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                    <AlertCircle size={14} /> {error}
                </div>
            )}
            <div className="flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={saving || !stripe}>
                    {saving ? 'Saving...' : 'Save Card'}
                </button>
                <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

// ========== Main Org Admin Billing Page ==========
export default function OrgAdminBilling() {
    const { organization, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [invoices, setInvoices] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [billingSettings, setBillingSettings] = useState(null);
    const [showAddCard, setShowAddCard] = useState(false);
    const [payingInvoiceId, setPayingInvoiceId] = useState(null);
    const [togglingAutoCharge, setTogglingAutoCharge] = useState(false);

    const orgId = organization?.id;

    const loadData = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setError('');
        try {
            // Load invoices
            const { data: invData } = await supabase
                .from('invoices')
                .select('*')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false });
            setInvoices(invData || []);

            // Load billing settings
            const { data: bs } = await supabase
                .from('org_billing_settings')
                .select('*')
                .eq('organization_id', orgId)
                .maybeSingle();
            setBillingSettings(bs);

            // Load payment methods via Stripe
            try {
                const { paymentMethods: pms } = await stripeClient.listPaymentMethods(orgId);
                setPaymentMethods(pms || []);
            } catch {
                // Edge function might not be deployed yet
                setPaymentMethods([]);
            }
        } catch (err) {
            console.error('Error loading billing:', err);
            if (err.message?.includes('does not exist')) {
                setError('Billing is not yet configured. Please contact your administrator.');
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { loadData(); }, [loadData]);

    const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

    const handleRemoveCard = async (pmId) => {
        if (!confirm('Remove this card?')) return;
        try {
            await stripeClient.detachPaymentMethod(orgId, pmId);
            showMsg('Card removed');
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleSetDefault = async (pmId) => {
        try {
            await stripeClient.setDefaultPaymentMethod(orgId, pmId);
            showMsg('Default payment method updated');
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleToggleAutoCharge = async () => {
        setTogglingAutoCharge(true);
        setError('');
        try {
            const newVal = !billingSettings?.auto_charge_enabled;
            await billingService.updateOrgAutoCharge(orgId, newVal);
            showMsg(newVal ? 'Auto-pay enabled. Your default card will be charged automatically on due dates.' : 'Auto-pay disabled. You will need to pay invoices manually.');
            loadData();
        } catch (err) {
            setError(err.message);
        } finally {
            setTogglingAutoCharge(false);
        }
    };

    const handlePayInvoice = async (inv) => {
        if (paymentMethods.length === 0) {
            setError('Please add a payment method before paying.');
            return;
        }

        // If invoice has a Stripe hosted URL, open it
        if (inv.stripe_invoice_url) {
            window.open(inv.stripe_invoice_url, '_blank');
            return;
        }

        // Otherwise pay via our edge function
        setPayingInvoiceId(inv.id);
        setError('');
        try {
            const result = await stripeClient.payInvoice(inv.id);
            if (result.paid) {
                showMsg(`Invoice ${inv.invoice_number} paid successfully!`);
                loadData();
            } else {
                setError('Payment is processing. Please check back shortly.');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setPayingInvoiceId(null);
        }
    };

    // Stats
    const totalOwed = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
    const overdueCount = invoices.filter(i => i.status === 'overdue').length;

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <p className="text-muted" style={{ marginTop: 'var(--space-4)' }}>Loading billing...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Billing & Payments</h1>
            <p className="page-subtitle">View invoices and manage your payment methods.</p>

            {success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#F0FDF4', color: '#16A34A', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                    <CheckCircle size={16} /> {success}
                </div>
            )}
            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: '#FEF2F2', color: '#DC2626', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-3" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="stat-card">
                    <div className="stat-icon cyan"><DollarSign size={22} /></div>
                    <div className="stat-value">{fmt(totalOwed)}</div>
                    <div className="stat-label">Outstanding Balance</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><CheckCircle size={22} /></div>
                    <div className="stat-value">{fmt(totalPaid)}</div>
                    <div className="stat-label">Total Paid</div>
                </div>
                <div className="stat-card">
                    <div className={`stat-icon ${overdueCount > 0 ? 'red' : 'green'}`}><Clock size={22} /></div>
                    <div className="stat-value">{overdueCount}</div>
                    <div className="stat-label">Overdue Invoices</div>
                </div>
            </div>

            {/* Auto-Pay Toggle */}
            <div className="card" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) var(--space-6)' }}>
                <div>
                    <div className="flex items-center gap-2">
                        <Zap size={18} style={{ color: billingSettings?.auto_charge_enabled ? '#16A34A' : 'var(--color-neutral-400)' }} />
                        <span className="font-medium">Automatic Payments</span>
                        {billingSettings?.auto_charge_enabled ? (
                            <span className="badge badge-success" style={{ fontSize: '10px' }}>Enabled</span>
                        ) : (
                            <span className="badge" style={{ background: '#F3F4F6', color: '#6B7280', fontSize: '10px' }}>Disabled</span>
                        )}
                    </div>
                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                        {billingSettings?.auto_charge_enabled
                            ? 'Your default card will be automatically charged when invoices are due.'
                            : 'You will need to manually pay each invoice. Enable to allow automatic charging on due dates.'}
                    </p>
                </div>
                <button
                    className={`btn btn-sm ${billingSettings?.auto_charge_enabled ? 'btn-outline' : 'btn-primary'}`}
                    disabled={togglingAutoCharge || paymentMethods.length === 0}
                    onClick={handleToggleAutoCharge}
                    title={paymentMethods.length === 0 ? 'Add a payment method first' : ''}
                >
                    {togglingAutoCharge ? '...' : billingSettings?.auto_charge_enabled ? (<><ToggleRight size={16} /> Disable</>) : (<><ToggleLeft size={16} /> Enable</>)}
                </button>
            </div>

            <div className="grid grid-2" style={{ gap: 'var(--space-6)', marginBottom: 'var(--space-6)', alignItems: 'start' }}>
                {/* Payment Methods */}
                <div className="card">
                    <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)' }}>
                        <h4 className="card-title" style={{ margin: 0 }}>Payment Methods</h4>
                        {!showAddCard && (
                            <button className="btn btn-sm btn-outline" onClick={() => setShowAddCard(true)}>
                                <Plus size={14} /> Add Card
                            </button>
                        )}
                    </div>

                    {showAddCard && (
                        <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)' }}>
                            <div className="text-sm font-medium" style={{ marginBottom: 'var(--space-3)' }}>Add a new card</div>
                            <Elements stripe={stripePromise}>
                                <AddCardForm
                                    organizationId={orgId}
                                    onSuccess={() => { setShowAddCard(false); showMsg('Card saved!'); loadData(); }}
                                    onCancel={() => setShowAddCard(false)}
                                />
                            </Elements>
                        </div>
                    )}

                    {paymentMethods.length === 0 && !showAddCard ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-neutral-400)' }}>
                            <CreditCard size={32} style={{ margin: '0 auto var(--space-2)' }} />
                            <p className="text-sm text-muted">No payment methods on file</p>
                            <button className="btn btn-sm btn-primary" style={{ marginTop: 'var(--space-3)' }} onClick={() => setShowAddCard(true)}>
                                <Plus size={14} /> Add Card
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {paymentMethods.map(pm => (
                                <div key={pm.id} className="flex justify-between items-center" style={{
                                    padding: 'var(--space-3) var(--space-4)',
                                    background: pm.isDefault ? '#F0FDF4' : 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                    border: pm.isDefault ? '1px solid #BBF7D0' : '1px solid transparent',
                                }}>
                                    <div className="flex items-center gap-3">
                                        <CreditCard size={20} style={{ color: 'var(--color-neutral-500)' }} />
                                        <div>
                                            <div className="text-sm font-medium" style={{ textTransform: 'capitalize' }}>
                                                {pm.brand} •••• {pm.last4}
                                                {pm.isDefault && <span className="badge badge-success" style={{ marginLeft: 8, fontSize: '10px' }}>Default</span>}
                                            </div>
                                            <div className="text-xs text-muted">Exp {pm.expMonth}/{pm.expYear}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        {!pm.isDefault && (
                                            <button className="btn btn-icon btn-ghost btn-sm" title="Set as default"
                                                onClick={() => handleSetDefault(pm.id)}>
                                                <Star size={14} />
                                            </button>
                                        )}
                                        <button className="btn btn-icon btn-ghost btn-sm" title="Remove"
                                            style={{ color: 'var(--color-error)' }}
                                            onClick={() => handleRemoveCard(pm.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Billing Info */}
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Billing Details</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {[
                            { label: 'Billing Frequency', value: (billingSettings?.billing_frequency || 'monthly').replace(/^./, c => c.toUpperCase()) },
                            { label: 'License Cost', value: billingSettings?.custom_license_cost ? fmt(billingSettings.custom_license_cost) : 'Standard rate' },
                            { label: 'Credit Period', value: `${billingSettings?.credit_period_days ?? 30} days` },
                            { label: 'Grace Period', value: `${billingSettings?.grace_period_days ?? 7} days after due date` },
                            { label: 'Next Billing Date', value: billingSettings?.next_billing_date ? new Date(billingSettings.next_billing_date).toLocaleDateString() : 'Not set' },
                            { label: 'Auto-Invoicing', value: billingSettings?.auto_generate_invoice ? 'Enabled by admin' : 'Manual' },
                        ].map((item, i) => (
                            <div key={i} className="flex justify-between" style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--color-neutral-100)' }}>
                                <span className="text-sm text-muted">{item.label}</span>
                                <span className="text-sm font-medium">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Invoices */}
            <div className="card">
                <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Invoices</h4>
                {invoices.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-neutral-400)' }}>
                        <FileText size={32} style={{ margin: '0 auto var(--space-2)' }} />
                        <p className="text-sm text-muted">No invoices yet</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Amount</th>
                                    <th>Licenses</th>
                                    <th>Period</th>
                                    <th>Due Date</th>
                                    <th>Status</th>
                                    <th style={{ width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(inv => {
                                    const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
                                    const canPay = ['sent', 'overdue'].includes(inv.status);
                                    const isPaying = payingInvoiceId === inv.id;
                                    const isOverdue = inv.status === 'overdue' || (inv.status === 'sent' && new Date(inv.due_date) < new Date());
                                    const graceDays = billingSettings?.grace_period_days ?? 7;
                                    const graceEnd = new Date(inv.due_date);
                                    graceEnd.setDate(graceEnd.getDate() + graceDays);
                                    const inGracePeriod = isOverdue && new Date() <= graceEnd;
                                    const daysUntilDisable = inGracePeriod ? Math.ceil((graceEnd - new Date()) / (1000 * 60 * 60 * 24)) : 0;
                                    return (
                                        <tr key={inv.id}>
                                            <td className="font-medium">{inv.invoice_number}</td>
                                            <td className="font-semibold">{fmt(inv.amount, inv.currency)}</td>
                                            <td className="text-sm">{inv.license_count} × {fmt(inv.license_unit_cost)}</td>
                                            <td className="text-xs text-muted">
                                                {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                                            </td>
                                            <td className="text-sm">
                                                {new Date(inv.due_date).toLocaleDateString()}
                                                {inGracePeriod && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                                        <ShieldAlert size={12} style={{ color: '#D97706' }} />
                                                        <span className="text-xs" style={{ color: '#D97706' }}>{daysUntilDisable}d grace left</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                <span className="badge" style={{ background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex gap-1">
                                                    {canPay && (
                                                        <button className="btn btn-sm btn-primary" disabled={isPaying}
                                                            onClick={() => handlePayInvoice(inv)} style={{ fontSize: '12px', padding: '4px 10px' }}>
                                                            {isPaying ? '...' : <><DollarSign size={13} /> Pay Now</>}
                                                        </button>
                                                    )}
                                                    {inv.stripe_invoice_url && (
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="View Stripe invoice"
                                                            onClick={() => window.open(inv.stripe_invoice_url, '_blank')}>
                                                            <Eye size={14} />
                                                        </button>
                                                    )}
                                                    {inv.status === 'paid' && (
                                                        <span className="text-xs text-muted" style={{ padding: '4px 8px' }}>
                                                            Paid {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString() : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
