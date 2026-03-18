import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    CreditCard, DollarSign, Building2, Users, TrendingUp, AlertCircle,
    FileText, Send, CheckCircle, Clock, Settings, Plus, Search,
    Pause, Play, Receipt, Calendar, BarChart3, Eye, Ban, RefreshCw,
    Zap, ShieldAlert
} from 'lucide-react';
import * as billing from '../../lib/billingService';
import * as stripeClient from '../../lib/stripeClient';

const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'organizations', label: 'Org Billing', icon: Building2 },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
];

const STATUS_COLORS = {
    draft: { bg: '#F3F4F6', color: '#6B7280' },
    sent: { bg: '#DBEAFE', color: '#2563EB' },
    paid: { bg: '#DCFCE7', color: '#16A34A' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
    cancelled: { bg: '#F3F4F6', color: '#9CA3AF' },
    void: { bg: '#F3F4F6', color: '#9CA3AF' },
    active: { bg: '#DCFCE7', color: '#16A34A' },
    on_hold: { bg: '#FEF3C7', color: '#D97706' },
    suspended: { bg: '#FEE2E2', color: '#DC2626' },
};

const fmt = (n, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n || 0);
};

export default function Billing() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Data
    const [metrics, setMetrics] = useState(null);
    const [orgs, setOrgs] = useState([]);
    const [orgBillingMap, setOrgBillingMap] = useState({});
    const [invoices, setInvoices] = useState([]);
    const [billingConfig, setBillingConfig] = useState(null);

    // Modals
    const [showOrgBillingModal, setShowOrgBillingModal] = useState(false);
    const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // Forms
    const [orgBillingForm, setOrgBillingForm] = useState({});
    const [invoiceForm, setInvoiceForm] = useState({ organizationId: '', licenseCount: '', notes: '' });
    const [paymentForm, setPaymentForm] = useState({ method: 'manual', reference: '', notes: '' });
    const [settingsForm, setSettingsForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [invoiceFilter, setInvoiceFilter] = useState('all');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [metricsData, orgsData, orgBillingData, invoicesData, configData] = await Promise.allSettled([
                billing.getFinancialMetrics(),
                billing.getOrgsWithBilling(),
                billing.getAllOrgBillingSettings(),
                billing.getInvoices(),
                billing.getBillingConfig(),
            ]);

            if (metricsData.status === 'fulfilled') setMetrics(metricsData.value);
            if (orgsData.status === 'fulfilled') setOrgs(orgsData.value);
            if (orgBillingData.status === 'fulfilled') {
                const map = {};
                (orgBillingData.value || []).forEach(s => { map[s.organization_id] = s; });
                setOrgBillingMap(map);
            }
            if (invoicesData.status === 'fulfilled') setInvoices(invoicesData.value);
            if (configData.status === 'fulfilled') {
                setBillingConfig(configData.value);
                setSettingsForm(configData.value || {});
            }

            // Check for tables not yet created
            const anyError = [metricsData, orgsData, invoicesData, configData].find(r => r.status === 'rejected');
            if (anyError) {
                console.warn('Billing table may not exist yet:', anyError.reason?.message);
                if (anyError.reason?.message?.includes('does not exist')) {
                    setError('Billing tables not found. Please run the migration: supabase/migrations/003_billing_schema.sql');
                }
            }
        } catch (err) {
            console.error('Error loading billing data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const showMsg = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

    // ==================== HANDLERS ====================

    const handleSaveOrgBilling = async () => {
        setSaving(true); setError('');
        try {
            await billing.upsertOrgBillingSettings({
                organization_id: selectedOrg.id,
                custom_license_cost: orgBillingForm.custom_license_cost || null,
                billing_frequency: orgBillingForm.billing_frequency || 'monthly',
                credit_period_days: parseInt(orgBillingForm.credit_period_days) || 30,
                auto_disable_enabled: orgBillingForm.auto_disable_enabled !== false,
                auto_generate_invoice: orgBillingForm.auto_generate_invoice || false,
                grace_period_days: parseInt(orgBillingForm.grace_period_days) || 7,
                discount_percent: parseFloat(orgBillingForm.discount_percent) || 0,
                billing_contact_email: orgBillingForm.billing_contact_email || '',
                billing_start_date: orgBillingForm.billing_start_date || null,
                next_billing_date: orgBillingForm.next_billing_date || null,
                notes: orgBillingForm.notes || '',
            });
            showMsg(`Billing settings saved for ${selectedOrg.name}`);
            setShowOrgBillingModal(false);
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleToggleOrgStatus = async (org, newStatus) => {
        try {
            await billing.updateOrgBillingStatus(org.id, newStatus);
            showMsg(`${org.name} is now ${newStatus.replace('_', ' ')}`);
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleGenerateInvoice = async () => {
        setSaving(true); setError('');
        try {
            const orgId = invoiceForm.organizationId;
            if (!orgId) throw new Error('Please select an organization');
            await billing.generateInvoiceForOrg(orgId, {
                licenseCount: parseInt(invoiceForm.licenseCount) || undefined,
                notes: invoiceForm.notes || undefined,
                createdBy: profile?.id,
            });
            showMsg('Invoice created successfully');
            setShowCreateInvoiceModal(false);
            setInvoiceForm({ organizationId: '', licenseCount: '', notes: '' });
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleSendInvoice = async (inv) => {
        try {
            await billing.markInvoiceSent(inv.id);
            showMsg(`Invoice ${inv.invoice_number} marked as sent`);
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleSendViaStripe = async (inv) => {
        setSaving(true); setError('');
        try {
            const result = await stripeClient.createStripeInvoice(inv.id);
            showMsg(`Invoice ${inv.invoice_number} sent via Stripe`);
            if (result.hostedUrl) {
                window.open(result.hostedUrl, '_blank');
            }
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleRecordPayment = async () => {
        setSaving(true); setError('');
        try {
            await billing.markInvoicePaid(selectedInvoice.id, {
                method: paymentForm.method,
                reference: paymentForm.reference,
                notes: paymentForm.notes,
                recordedBy: profile?.id,
            });
            showMsg(`Payment recorded for ${selectedInvoice.invoice_number}`);
            setShowPaymentModal(false);
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleCancelInvoice = async (inv) => {
        if (!confirm(`Cancel invoice ${inv.invoice_number}?`)) return;
        try {
            await billing.cancelInvoice(inv.id);
            showMsg(`Invoice ${inv.invoice_number} cancelled`);
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleSaveSettings = async () => {
        setSaving(true); setError('');
        try {
            await billing.updateBillingConfig({
                id: billingConfig.id,
                default_license_cost: parseFloat(settingsForm.default_license_cost) || 15,
                currency: settingsForm.currency || 'USD',
                default_billing_frequency: settingsForm.default_billing_frequency || 'monthly',
                default_credit_period_days: parseInt(settingsForm.default_credit_period_days) || 30,
                default_grace_period_days: parseInt(settingsForm.default_grace_period_days) || 7,
                auto_disable_enabled: settingsForm.auto_disable_enabled !== false,
                invoice_prefix: settingsForm.invoice_prefix || 'INV',
                tax_rate: parseFloat(settingsForm.tax_rate) || 0,
                company_name: settingsForm.company_name || '',
                company_email: settingsForm.company_email || '',
                company_address: settingsForm.company_address || '',
            });
            showMsg('Billing settings saved');
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleCheckOverdue = async () => {
        try {
            const results = await billing.checkAndDisableOverdueOrgs();
            const disabled = results.filter(r => r.action === 'put_on_hold');
            const inGrace = results.filter(r => r.action === 'in_grace_period');
            let msg = '';
            if (disabled.length > 0) msg += `${disabled.length} org(s) put on hold. `;
            if (inGrace.length > 0) msg += `${inGrace.length} org(s) in grace period. `;
            if (!msg) msg = 'No overdue organizations found.';
            showMsg(msg);
            loadData();
        } catch (err) { setError(err.message); }
    };

    const handleAutoGenerateInvoices = async () => {
        setSaving(true); setError('');
        try {
            const results = await billing.autoGenerateInvoices(profile?.id);
            const generated = results.filter(r => r.action === 'generated');
            const errors = results.filter(r => r.action === 'error');
            let msg = '';
            if (generated.length > 0) msg += `${generated.length} invoice(s) auto-generated. `;
            if (errors.length > 0) msg += `${errors.length} failed. `;
            if (!msg) msg = 'No orgs due for auto-invoicing today.';
            showMsg(msg);
            loadData();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    // ==================== RENDER: DASHBOARD ====================
    const renderDashboard = () => {
        const m = metrics || {};
        const currency = m.currency || 'USD';
        return (
            <div>
                <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
                    {[
                        { icon: DollarSign, label: 'Total Revenue', value: fmt(m.totalRevenue, currency), color: 'green' },
                        { icon: TrendingUp, label: 'Est. MRR', value: fmt(m.estimatedMRR, currency), color: 'blue' },
                        { icon: Clock, label: 'Outstanding', value: fmt(m.outstanding, currency), color: 'cyan' },
                        { icon: AlertCircle, label: 'Overdue', value: fmt(m.overdue, currency), color: 'red' },
                    ].map((s, i) => (
                        <div key={i} className="stat-card">
                            <div className={`stat-icon ${s.color}`}><s.icon size={22} /></div>
                            <div className="stat-value">{s.value}</div>
                            <div className="stat-label">{s.label}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-4" style={{ marginBottom: 'var(--space-6)' }}>
                    {[
                        { icon: Building2, label: 'Active Orgs', value: `${m.activeOrgs || 0} / ${m.totalOrgs || 0}`, color: 'blue' },
                        { icon: Users, label: 'Licensed Students', value: m.totalLicensedStudents || 0, color: 'green' },
                        { icon: Receipt, label: 'This Month', value: fmt(m.monthlyRevenue, currency), color: 'cyan' },
                        { icon: CheckCircle, label: 'Collection Rate', value: `${m.collectionRate || 0}%`, color: m.collectionRate >= 80 ? 'green' : 'red' },
                    ].map((s, i) => (
                        <div key={i} className="stat-card">
                            <div className={`stat-icon ${s.color}`}><s.icon size={22} /></div>
                            <div className="stat-value">{s.value}</div>
                            <div className="stat-label">{s.label}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-2" style={{ gap: 'var(--space-6)' }}>
                    {/* Invoice Pipeline */}
                    <div className="card">
                        <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Invoice Pipeline</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {['draft', 'sent', 'paid', 'overdue'].map(status => {
                                const count = m.invoicesByStatus?.[status] || 0;
                                const sc = STATUS_COLORS[status];
                                return (
                                    <div key={status} className="flex justify-between items-center" style={{
                                        padding: 'var(--space-3) var(--space-4)', background: sc.bg,
                                        borderRadius: 'var(--radius-md)',
                                    }}>
                                        <span className="font-medium text-sm" style={{ color: sc.color, textTransform: 'capitalize' }}>{status}</span>
                                        <span className="font-semibold" style={{ color: sc.color }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="card">
                        <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Quick Actions</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <button className="btn btn-primary" style={{ width: '100%' }}
                                onClick={() => { setInvoiceForm({ organizationId: '', licenseCount: '', notes: '' }); setShowCreateInvoiceModal(true); }}>
                                <Plus size={16} /> Generate New Invoice
                            </button>
                            <button className="btn btn-outline" style={{ width: '100%' }} disabled={saving} onClick={handleAutoGenerateInvoices}>
                                <Zap size={16} /> Run Auto-Invoice Generation
                            </button>
                            <button className="btn btn-outline" style={{ width: '100%' }} onClick={handleCheckOverdue}>
                                <RefreshCw size={16} /> Check Overdue & Auto-Disable
                            </button>
                            <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => setActiveTab('settings')}>
                                <Settings size={16} /> Configure Billing Defaults
                            </button>
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-sm)' }}>
                            <strong>Stripe Integration:</strong> To send invoices via Stripe, configure your Stripe keys in Settings. Invoices can be sent as Stripe hosted invoice links.
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ==================== RENDER: ORGANIZATIONS ====================
    const renderOrganizations = () => {
        const filtered = orgs.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()));
        return (
            <div>
                <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)' }}>
                    <div className="search-box" style={{ flex: 1, maxWidth: 360 }}>
                        <Search size={18} />
                        <input type="text" placeholder="Search organizations..." value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state"><Building2 size={48} /><h3>No organizations</h3></div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Organization</th>
                                    <th>Status</th>
                                    <th>Licenses</th>
                                    <th>Unit Cost</th>
                                    <th>Frequency</th>
                                    <th>Credit Period</th>
                                    <th>Auto</th>
                                    <th style={{ width: 150 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(org => {
                                    const bs = orgBillingMap[org.id] || {};
                                    const students = org.profiles?.filter(p => p.role === 'student') || [];
                                    const licensed = students.filter(p => p.license_active).length;
                                    const unitCost = bs.custom_license_cost ?? billingConfig?.default_license_cost ?? 15;
                                    const sc = STATUS_COLORS[org.billing_status || 'active'];
                                    return (
                                        <tr key={org.id}>
                                            <td>
                                                <div className="font-medium">{org.name}</div>
                                                <div className="text-xs text-muted">{students.length} students</div>
                                            </td>
                                            <td>
                                                <span className="badge" style={{ background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                                                    {(org.billing_status || 'active').replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="font-medium">{licensed}</span>
                                                <span className="text-muted text-xs"> / {org.license_quota}</span>
                                            </td>
                                            <td className="font-medium">{fmt(unitCost)}</td>
                                            <td className="text-sm" style={{ textTransform: 'capitalize' }}>{bs.billing_frequency || billingConfig?.default_billing_frequency || 'monthly'}</td>
                                            <td className="text-sm">{bs.credit_period_days ?? billingConfig?.default_credit_period_days ?? 30} days</td>
                                            <td>
                                                {bs.auto_generate_invoice && (
                                                    <span className="badge" style={{ background: '#EEF2FF', color: '#4F46E5', fontSize: '10px' }}>
                                                        <Zap size={10} /> Auto-Invoice
                                                    </span>
                                                )}
                                                {bs.auto_charge_enabled && (
                                                    <span className="badge" style={{ background: '#F0FDF4', color: '#16A34A', fontSize: '10px', marginLeft: bs.auto_generate_invoice ? 4 : 0 }}>
                                                        Auto-Pay
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex gap-1">
                                                    <button className="btn btn-icon btn-ghost btn-sm" title="Configure billing"
                                                        onClick={() => {
                                                            setSelectedOrg(org);
                                                            setOrgBillingForm({
                                                                custom_license_cost: bs.custom_license_cost || '',
                                                                billing_frequency: bs.billing_frequency || billingConfig?.default_billing_frequency || 'monthly',
                                                                credit_period_days: bs.credit_period_days ?? billingConfig?.default_credit_period_days ?? 30,
                                                                auto_disable_enabled: bs.auto_disable_enabled !== false,
                                                                auto_generate_invoice: bs.auto_generate_invoice || false,
                                                                grace_period_days: bs.grace_period_days ?? billingConfig?.default_grace_period_days ?? 7,
                                                                billing_start_date: bs.billing_start_date || '',
                                                                next_billing_date: bs.next_billing_date || '',
                                                                discount_percent: bs.discount_percent || 0,
                                                                billing_contact_email: bs.billing_contact_email || org.billing_email || '',
                                                                notes: bs.notes || '',
                                                            });
                                                            setError('');
                                                            setShowOrgBillingModal(true);
                                                        }}>
                                                        <Settings size={15} />
                                                    </button>
                                                    <button className="btn btn-icon btn-ghost btn-sm" title="Generate invoice"
                                                        style={{ color: 'var(--color-accent-cyan)' }}
                                                        onClick={() => {
                                                            setInvoiceForm({ organizationId: org.id, licenseCount: licensed.toString(), notes: '' });
                                                            setError('');
                                                            setShowCreateInvoiceModal(true);
                                                        }}>
                                                        <FileText size={15} />
                                                    </button>
                                                    {(org.billing_status === 'active' || !org.billing_status) ? (
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Put on hold"
                                                            style={{ color: '#D97706' }}
                                                            onClick={() => handleToggleOrgStatus(org, 'on_hold')}>
                                                            <Pause size={15} />
                                                        </button>
                                                    ) : (
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Reactivate"
                                                            style={{ color: '#16A34A' }}
                                                            onClick={() => handleToggleOrgStatus(org, 'active')}>
                                                            <Play size={15} />
                                                        </button>
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
        );
    };

    // ==================== RENDER: INVOICES ====================
    const renderInvoices = () => {
        const filtered = invoices.filter(inv => {
            if (invoiceFilter !== 'all' && inv.status !== invoiceFilter) return false;
            if (searchQuery && !inv.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase())
                && !inv.organizations?.name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            return true;
        });

        return (
            <div>
                <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-4)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div className="flex gap-2 items-center">
                        <div className="search-box" style={{ maxWidth: 280 }}>
                            <Search size={18} />
                            <input type="text" placeholder="Search invoices..." value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)} />
                        </div>
                        <select className="form-select" style={{ width: 'auto', minWidth: 140 }} value={invoiceFilter}
                            onChange={e => setInvoiceFilter(e.target.value)}>
                            <option value="all">All Status</option>
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                    <button className="btn btn-primary" onClick={() => {
                        setInvoiceForm({ organizationId: '', licenseCount: '', notes: '' }); setError(''); setShowCreateInvoiceModal(true);
                    }}><Plus size={16} /> New Invoice</button>
                </div>

                {filtered.length === 0 ? (
                    <div className="empty-state"><FileText size={48} /><h3>No invoices</h3><p>Generate your first invoice from the Organizations tab.</p></div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Invoice #</th>
                                    <th>Organization</th>
                                    <th>Amount</th>
                                    <th>Licenses</th>
                                    <th>Period</th>
                                    <th>Due Date</th>
                                    <th>Status</th>
                                    <th style={{ width: 140 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(inv => {
                                    const sc = STATUS_COLORS[inv.status];
                                    const isOverdue = inv.status === 'sent' && new Date(inv.due_date) < new Date();
                                    return (
                                        <tr key={inv.id}>
                                            <td className="font-medium">{inv.invoice_number}</td>
                                            <td>{inv.organizations?.name || '—'}</td>
                                            <td className="font-semibold">{fmt(inv.amount, inv.currency)}</td>
                                            <td className="text-sm">{inv.license_count} × {fmt(inv.license_unit_cost)}</td>
                                            <td className="text-xs text-muted">
                                                {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                                            </td>
                                            <td className="text-sm" style={{ color: isOverdue ? '#DC2626' : undefined }}>
                                                {new Date(inv.due_date).toLocaleDateString()}
                                                {isOverdue && <span className="text-xs" style={{ color: '#DC2626' }}> (past due)</span>}
                                            </td>
                                            <td>
                                                <span className="badge" style={{ background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex gap-1">
                                                    {inv.status === 'draft' && (<>
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Mark as sent"
                                                            style={{ color: '#2563EB' }} onClick={() => handleSendInvoice(inv)}>
                                                            <Send size={15} />
                                                        </button>
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Send via Stripe"
                                                            style={{ color: '#6366F1' }} disabled={saving}
                                                            onClick={() => handleSendViaStripe(inv)}>
                                                            <CreditCard size={15} />
                                                        </button>
                                                    </>)}
                                                    {['sent', 'overdue'].includes(inv.status) && (
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Record payment"
                                                            style={{ color: '#16A34A' }}
                                                            onClick={() => {
                                                                setSelectedInvoice(inv);
                                                                setPaymentForm({ method: 'manual', reference: '', notes: '' });
                                                                setError('');
                                                                setShowPaymentModal(true);
                                                            }}>
                                                            <DollarSign size={15} />
                                                        </button>
                                                    )}
                                                    {['draft', 'sent'].includes(inv.status) && (
                                                        <button className="btn btn-icon btn-ghost btn-sm" title="Cancel"
                                                            style={{ color: '#DC2626' }} onClick={() => handleCancelInvoice(inv)}>
                                                            <Ban size={15} />
                                                        </button>
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
        );
    };

    // ==================== RENDER: SETTINGS ====================
    const renderSettings = () => (
        <div style={{ maxWidth: 640 }}>
            <div className="card">
                <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>Global Billing Defaults</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                    <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label className="form-label">Default License Cost</label>
                            <input type="number" className="form-input" step="0.01" min="0"
                                value={settingsForm.default_license_cost ?? ''} onChange={e => setSettingsForm(f => ({ ...f, default_license_cost: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Currency</label>
                            <select className="form-select" value={settingsForm.currency || 'USD'}
                                onChange={e => setSettingsForm(f => ({ ...f, currency: e.target.value }))}>
                                <option value="USD">USD</option><option value="AUD">AUD</option>
                                <option value="GBP">GBP</option><option value="EUR">EUR</option>
                                <option value="LKR">LKR</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label className="form-label">Default Billing Frequency</label>
                            <select className="form-select" value={settingsForm.default_billing_frequency || 'monthly'}
                                onChange={e => setSettingsForm(f => ({ ...f, default_billing_frequency: e.target.value }))}>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Default Credit Period (days)</label>
                            <input type="number" className="form-input" min="0" value={settingsForm.default_credit_period_days ?? ''}
                                onChange={e => setSettingsForm(f => ({ ...f, default_credit_period_days: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label className="form-label">Invoice Prefix</label>
                            <input className="form-input" value={settingsForm.invoice_prefix || ''}
                                onChange={e => setSettingsForm(f => ({ ...f, invoice_prefix: e.target.value }))} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Tax Rate (%)</label>
                            <input type="number" className="form-input" step="0.01" min="0"
                                value={settingsForm.tax_rate ?? ''} onChange={e => setSettingsForm(f => ({ ...f, tax_rate: e.target.value }))} />
                        </div>
                    </div>
                    <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                        <div className="form-group">
                            <label className="form-label">Default Grace Period (days)</label>
                            <input type="number" className="form-input" min="0" value={settingsForm.default_grace_period_days ?? ''}
                                onChange={e => setSettingsForm(f => ({ ...f, default_grace_period_days: e.target.value }))} />
                            <p className="text-xs text-muted" style={{ marginTop: 4 }}>Days after due date before org is disabled</p>
                        </div>
                        <div></div>
                    </div>
                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <input type="checkbox" id="autoDisable" checked={settingsForm.auto_disable_enabled !== false}
                            onChange={e => setSettingsForm(f => ({ ...f, auto_disable_enabled: e.target.checked }))} />
                        <label htmlFor="autoDisable" className="form-label" style={{ margin: 0 }}>
                            Auto-disable organizations when overdue past grace period
                        </label>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: 'var(--space-6)' }}>
                <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>Company Details (on invoices)</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div className="form-group">
                        <label className="form-label">Company Name</label>
                        <input className="form-input" value={settingsForm.company_name || ''}
                            onChange={e => setSettingsForm(f => ({ ...f, company_name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Company Email</label>
                        <input type="email" className="form-input" value={settingsForm.company_email || ''}
                            onChange={e => setSettingsForm(f => ({ ...f, company_email: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Company Address</label>
                        <textarea className="form-input" rows={3} value={settingsForm.company_address || ''}
                            onChange={e => setSettingsForm(f => ({ ...f, company_address: e.target.value }))} />
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 'var(--space-6)' }}>
                <button className="btn btn-primary" disabled={saving} onClick={handleSaveSettings}>
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );

    // ==================== MAIN RENDER ====================
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
                <div className="spinner spinner-lg" style={{ margin: '0 auto' }}></div>
                <p className="text-muted" style={{ marginTop: 'var(--space-4)' }}>Loading billing data...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-2)' }}>
                <div>
                    <h1 className="page-title">Billing & Revenue</h1>
                    <p className="page-subtitle">Manage licenses, invoices, and organization billing.</p>
                </div>
            </div>

            {/* Success/Error messages */}
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

            {/* Tabs */}
            <div className="tabs" style={{ marginBottom: 'var(--space-6)' }}>
                {TABS.map(tab => (
                    <button key={tab.id} className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'organizations' && renderOrganizations()}
            {activeTab === 'invoices' && renderInvoices()}
            {activeTab === 'settings' && renderSettings()}

            {/* ============ MODAL: Org Billing Config ============ */}
            {showOrgBillingModal && selectedOrg && (
                <div className="modal-overlay" onClick={() => setShowOrgBillingModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                        <div className="modal-header">
                            <h3 className="modal-title"><Settings size={18} /> Billing — {selectedOrg.name}</h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowOrgBillingModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label className="form-label">Custom License Cost (leave empty for default: {fmt(billingConfig?.default_license_cost || 15)})</label>
                                <input type="number" className="form-input" step="0.01" min="0" placeholder={`Default: ${billingConfig?.default_license_cost || 15}`}
                                    value={orgBillingForm.custom_license_cost || ''} onChange={e => setOrgBillingForm(f => ({ ...f, custom_license_cost: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Billing Start Date</label>
                                <input type="date" className="form-input" value={orgBillingForm.billing_start_date || ''}
                                    onChange={e => setOrgBillingForm(f => ({ ...f, billing_start_date: e.target.value }))} />
                                <p className="text-xs text-muted" style={{ marginTop: 4 }}>Date from which billing begins for this organization. Invoices will not be generated before this date.</p>
                            </div>
                            <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Billing Frequency</label>
                                    <select className="form-select" value={orgBillingForm.billing_frequency || 'monthly'}
                                        onChange={e => setOrgBillingForm(f => ({ ...f, billing_frequency: e.target.value }))}>
                                        <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Credit Period (days)</label>
                                    <input type="number" className="form-input" min="0" value={orgBillingForm.credit_period_days ?? ''}
                                        onChange={e => setOrgBillingForm(f => ({ ...f, credit_period_days: e.target.value }))} />
                                </div>
                            </div>
                            <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                                <div className="form-group">
                                    <label className="form-label">Discount (%)</label>
                                    <input type="number" className="form-input" step="0.01" min="0" max="100" value={orgBillingForm.discount_percent || ''}
                                        onChange={e => setOrgBillingForm(f => ({ ...f, discount_percent: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Billing Contact Email</label>
                                    <input type="email" className="form-input" value={orgBillingForm.billing_contact_email || ''}
                                        onChange={e => setOrgBillingForm(f => ({ ...f, billing_contact_email: e.target.value }))} />
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <input type="checkbox" id="orgAutoGenInvoice" checked={orgBillingForm.auto_generate_invoice || false}
                                    onChange={e => setOrgBillingForm(f => ({ ...f, auto_generate_invoice: e.target.checked }))} />
                                <label htmlFor="orgAutoGenInvoice" className="form-label" style={{ margin: 0 }}>Auto-generate invoices on billing date</label>
                            </div>
                            {orgBillingForm.auto_generate_invoice && (
                                <div className="form-group">
                                    <label className="form-label">Next Billing Date</label>
                                    <input type="date" className="form-input" value={orgBillingForm.next_billing_date || ''}
                                        onChange={e => setOrgBillingForm(f => ({ ...f, next_billing_date: e.target.value }))} />
                                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>Invoice will auto-generate on or after this date</p>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Grace Period (days after due date)</label>
                                <input type="number" className="form-input" min="0" value={orgBillingForm.grace_period_days ?? ''}
                                    onChange={e => setOrgBillingForm(f => ({ ...f, grace_period_days: e.target.value }))} />
                                <p className="text-xs text-muted" style={{ marginTop: 4 }}>Org will be reminded during grace period, then disabled after it expires</p>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                <input type="checkbox" id="orgAutoDisable" checked={orgBillingForm.auto_disable_enabled !== false}
                                    onChange={e => setOrgBillingForm(f => ({ ...f, auto_disable_enabled: e.target.checked }))} />
                                <label htmlFor="orgAutoDisable" className="form-label" style={{ margin: 0 }}>Auto-disable when overdue past grace period</label>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" rows={2} value={orgBillingForm.notes || ''}
                                    onChange={e => setOrgBillingForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowOrgBillingModal(false)}>Cancel</button>
                            <button className="btn btn-primary" disabled={saving} onClick={handleSaveOrgBilling}>
                                {saving ? 'Saving...' : 'Save Billing Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ MODAL: Create Invoice ============ */}
            {showCreateInvoiceModal && (
                <div className="modal-overlay" onClick={() => setShowCreateInvoiceModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3 className="modal-title"><FileText size={18} /> Generate Invoice</h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowCreateInvoiceModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div className="form-group">
                                <label className="form-label">Organization *</label>
                                <select className="form-select" value={invoiceForm.organizationId}
                                    onChange={e => {
                                        const org = orgs.find(o => o.id === e.target.value);
                                        const licensed = org?.profiles?.filter(p => p.role === 'student' && p.license_active).length || 0;
                                        setInvoiceForm(f => ({ ...f, organizationId: e.target.value, licenseCount: licensed.toString() }));
                                    }}>
                                    <option value="">Select organization...</option>
                                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">License Count (override)</label>
                                <input type="number" className="form-input" min="0" value={invoiceForm.licenseCount}
                                    onChange={e => setInvoiceForm(f => ({ ...f, licenseCount: e.target.value }))} />
                                <p className="text-xs text-muted" style={{ marginTop: 4 }}>Leave empty to use current active student count</p>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" rows={2} value={invoiceForm.notes}
                                    onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                            {invoiceForm.organizationId && (
                                <div style={{ padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--color-neutral-600)' }}>
                                    Invoice will use the org's billing settings (or defaults). Cost, frequency, credit period, and tax will be calculated automatically.
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowCreateInvoiceModal(false)}>Cancel</button>
                            <button className="btn btn-primary" disabled={saving || !invoiceForm.organizationId} onClick={handleGenerateInvoice}>
                                {saving ? 'Generating...' : 'Generate Invoice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ MODAL: Record Payment ============ */}
            {showPaymentModal && selectedInvoice && (
                <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title"><DollarSign size={18} /> Record Payment</h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowPaymentModal(false)}>✕</button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            <div style={{ padding: 'var(--space-3)', background: '#F0FDF4', borderRadius: 'var(--radius-md)', borderLeft: '3px solid #16A34A' }}>
                                <div className="text-sm font-medium">{selectedInvoice.invoice_number}</div>
                                <div className="text-xs text-muted">{selectedInvoice.organizations?.name}</div>
                                <div className="font-semibold" style={{ marginTop: 4 }}>{fmt(selectedInvoice.amount, selectedInvoice.currency)}</div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Payment Method</label>
                                <select className="form-select" value={paymentForm.method}
                                    onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))}>
                                    <option value="manual">Manual / Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="stripe">Stripe</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Reference Number</label>
                                <input className="form-input" placeholder="e.g. TXN-12345" value={paymentForm.reference}
                                    onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Notes</label>
                                <textarea className="form-input" rows={2} value={paymentForm.notes}
                                    onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>Cancel</button>
                            <button className="btn btn-primary" disabled={saving} onClick={handleRecordPayment}>
                                {saving ? 'Recording...' : 'Record Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
