import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Building2, Users, Plus, Search, Edit2, Trash2,
    Shield, AlertCircle, UserPlus, CheckCircle, Mail
} from 'lucide-react';

export default function Organizations() {
    const [organizations, setOrganizations] = useState([]);
    const [orgAdmins, setOrgAdmins] = useState({}); // { orgId: [admin profiles] }
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [editingOrg, setEditingOrg] = useState(null);
    const [targetOrg, setTargetOrg] = useState(null); // org we're adding admin to
    const [searchQuery, setSearchQuery] = useState('');
    const [formData, setFormData] = useState({
        name: '', slug: '', license_quota: 50, content_source_mode: 'hybrid',
        daily_api_limit_per_user: 50, daily_api_limit_org: 500, is_premium: false, org_type: 'educational',
    });
    const [adminForm, setAdminForm] = useState({
        full_name: '', email: '', password: '',
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchOrganizations();
    }, []);

    const fetchOrganizations = async () => {
        setLoading(true);
        const { data: orgs } = await supabase
            .from('organizations')
            .select('*')
            .order('created_at', { ascending: false });

        if (orgs) {
            setOrganizations(orgs);

            // Fetch org admins for all organizations
            const { data: admins } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'org_admin')
                .in('organization_id', orgs.map(o => o.id));

            if (admins) {
                const adminMap = {};
                admins.forEach(a => {
                    if (!adminMap[a.organization_id]) adminMap[a.organization_id] = [];
                    adminMap[a.organization_id].push(a);
                });
                setOrgAdmins(adminMap);
            }
        }
        setLoading(false);
    };

    // Org CRUD
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            const slug = formData.slug ||
                formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

            if (editingOrg) {
                const { error } = await supabase
                    .from('organizations')
                    .update({ ...formData, slug })
                    .eq('id', editingOrg.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('organizations')
                    .insert([{ ...formData, slug, active_licenses: 0 }]);
                if (error) throw error;
            }

            setShowModal(false);
            setEditingOrg(null);
            setFormData({ name: '', slug: '', license_quota: 50, content_source_mode: 'hybrid', daily_api_limit_per_user: 50, daily_api_limit_org: 500, is_premium: false, org_type: 'educational' });
            fetchOrganizations();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (org) => {
        setEditingOrg(org);
        setFormData({
            name: org.name, slug: org.slug,
            license_quota: org.license_quota,
            content_source_mode: org.content_source_mode || 'hybrid',
            daily_api_limit_per_user: org.daily_api_limit_per_user ?? 50,
            daily_api_limit_org: org.daily_api_limit_org ?? 500,
            is_premium: org.is_premium || false,
            org_type: org.org_type || 'educational',
        });
        setError('');
        setShowModal(true);
    };

    const handleDelete = async (org) => {
        if (!confirm(`Delete "${org.name}"? This will also remove all users in this org.`)) return;
        const { error } = await supabase.from('organizations').delete().eq('id', org.id);
        if (!error) fetchOrganizations();
    };

    // Org Admin creation
    const openAdminModal = (org) => {
        setTargetOrg(org);
        setAdminForm({ full_name: '', email: '', password: '' });
        setError('');
        setSuccess('');
        setShowAdminModal(true);
    };

    const handleCreateAdmin = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const { createUserAccount } = await import('../../lib/adminUserManager');

            await createUserAccount({
                email: adminForm.email,
                password: adminForm.password,
                fullName: adminForm.full_name,
                role: 'org_admin',
                organizationId: targetOrg.id,
            });

            setSuccess(`Org Admin "${adminForm.full_name}" created! They can now log in at the login page.`);
            setAdminForm({ full_name: '', email: '', password: '' });
            fetchOrganizations();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredOrgs = organizations.filter(org =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.slug.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 className="page-title">Organizations</h1>
                    <p className="text-muted">Manage institutions and their admins</p>
                </div>
                <button className="btn btn-primary" onClick={() => {
                    setEditingOrg(null);
                    setFormData({ name: '', slug: '', license_quota: 50, content_source_mode: 'hybrid', daily_api_limit_per_user: 50, daily_api_limit_org: 500, is_premium: false, org_type: 'educational' });
                    setError('');
                    setShowModal(true);
                }}>
                    <Plus size={18} /> Add Organization
                </button>
            </div>

            {/* Search */}
            <div className="search-box" style={{ marginBottom: 'var(--space-6)' }}>
                <Search size={18} />
                <input type="text" placeholder="Search organizations..."
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex justify-center" style={{ padding: 'var(--space-16)' }}>
                    <div className="spinner spinner-lg"></div>
                </div>
            ) : filteredOrgs.length === 0 ? (
                <div className="empty-state">
                    <Building2 size={64} />
                    <h3>No organizations yet</h3>
                    <p>Add your first organization to get started.</p>
                    <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}
                        onClick={() => setShowModal(true)}>
                        <Plus size={18} /> Add Organization
                    </button>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Organization</th>
                                <th>Org Admin</th>
                                <th>Licenses</th>
                                <th>Org Type</th>
                                <th>Content Mode</th>
                                <th>Created</th>
                                <th style={{ width: 120 }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrgs.map((org) => {
                                const admins = orgAdmins[org.id] || [];
                                return (
                                    <tr key={org.id}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="avatar" style={{
                                                    background: org.primary_color ? `${org.primary_color}15` : undefined,
                                                    color: org.primary_color || undefined,
                                                }}>
                                                    {org.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <span className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                                                        {org.name}
                                                    </span>
                                                    <div>
                                                        <code style={{
                                                            fontSize: 'var(--text-xs)', background: 'var(--color-neutral-100)',
                                                            padding: '1px 5px', borderRadius: '3px',
                                                        }}>{org.slug}</code>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {admins.length > 0 ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {admins.map(admin => (
                                                        <div key={admin.id} className="flex items-center gap-2">
                                                            <div className="avatar" style={{
                                                                width: 24, height: 24, fontSize: '10px',
                                                                background: '#E8F5E9', color: '#2E7D32',
                                                            }}>
                                                                {(admin.full_name || '?').substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium">{admin.full_name}</div>
                                                                <div className="text-xs text-muted">{admin.email}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="badge badge-warning" style={{ cursor: 'pointer' }}
                                                    onClick={() => openAdminModal(org)}>
                                                    <UserPlus size={12} /> No admin
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`badge ${(org.active_licenses || 0) >= org.license_quota ? 'badge-error' : 'badge-success'}`}>
                                                {org.active_licenses || 0} / {org.license_quota}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${org.org_type === 'corporate' ? 'badge-info' : org.org_type === 'hybrid' ? 'badge-warning' : org.org_type === 'teacher_only' ? 'badge-primary' : 'badge-success'}`} style={{ textTransform: 'capitalize' }}>
                                                {org.org_type === 'teacher_only' ? 'Teacher Only' : (org.org_type || 'educational')}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                                                {org.content_source_mode || 'hybrid'}
                                            </span>
                                        </td>
                                        <td className="text-sm">{new Date(org.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <div className="flex gap-1">
                                                <button className="btn btn-icon btn-ghost btn-sm" title="Add Org Admin"
                                                    onClick={() => openAdminModal(org)}
                                                    style={{ color: 'var(--color-accent-cyan)' }}>
                                                    <UserPlus size={15} />
                                                </button>
                                                <button className="btn btn-icon btn-ghost btn-sm" title="Edit"
                                                    onClick={() => handleEdit(org)}>
                                                    <Edit2 size={15} />
                                                </button>
                                                <button className="btn btn-icon btn-ghost btn-sm" title="Delete"
                                                    onClick={() => handleDelete(org)}
                                                    style={{ color: 'var(--color-error)' }}>
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create/Edit Org Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingOrg ? 'Edit Organization' : 'New Organization'}</h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                                {error && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '12px', background: '#FEF2F2',
                                        color: '#DC2626', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                                    }}>
                                        <AlertCircle size={16} /> {error}
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Organization Name *</label>
                                    <input className="form-input" value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. British Council Sydney" required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Slug</label>
                                    <input className="form-input" value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                        placeholder="auto-generated from name" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">License Quota</label>
                                    <input type="number" className="form-input" value={formData.license_quota}
                                        onChange={(e) => setFormData({ ...formData, license_quota: parseInt(e.target.value) || 0 })}
                                        min="1" />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Organization Type</label>
                                    <select className="form-select" value={formData.org_type}
                                        onChange={(e) => setFormData({ ...formData, org_type: e.target.value })}>
                                        <option value="educational">Educational Institution (Teachers + Students)</option>
                                        <option value="corporate">Corporate / Self-Study (Students Only)</option>
                                        <option value="teacher_only">Teacher Only (Teachers manage & grade, no student self-study)</option>
                                        <option value="hybrid">Hybrid (Flexible – All features available)</option>
                                    </select>
                                    <p className="text-xs text-muted" style={{ marginTop: 4 }}>
                                        Educational: full teacher + student functionality. Corporate: students only, no teacher grading. Teacher Only: teachers manage and grade, no student self-study. Hybrid: all features available.
                                    </p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Content Source Mode</label>
                                    <select className="form-select" value={formData.content_source_mode}
                                        onChange={(e) => setFormData({ ...formData, content_source_mode: e.target.value })}>
                                        <option value="hybrid">Hybrid (Global + Custom)</option>
                                        <option value="global_only">Global Only</option>
                                        <option value="org_only">Organization Only</option>
                                    </select>
                                </div>

                                <div className="grid grid-2" style={{ gap: 'var(--space-4)' }}>
                                    <div className="form-group">
                                        <label className="form-label">Daily API Limit / User</label>
                                        <input type="number" className="form-input" min="1" value={formData.daily_api_limit_per_user}
                                            onChange={(e) => setFormData({ ...formData, daily_api_limit_per_user: parseInt(e.target.value) || 50 })} />
                                        <p className="text-xs text-muted" style={{ marginTop: 4 }}>Max AI generations per user per day</p>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Daily API Limit / Org</label>
                                        <input type="number" className="form-input" min="1" value={formData.daily_api_limit_org}
                                            onChange={(e) => setFormData({ ...formData, daily_api_limit_org: parseInt(e.target.value) || 500 })} />
                                        <p className="text-xs text-muted" style={{ marginTop: 4 }}>Max AI generations for entire org per day</p>
                                    </div>
                                </div>

                                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <input type="checkbox" id="isPremium" checked={formData.is_premium || false}
                                        onChange={(e) => setFormData({ ...formData, is_premium: e.target.checked })} />
                                    <label htmlFor="isPremium" className="form-label" style={{ margin: 0 }}>Premium Organization</label>
                                    <span className="text-xs text-muted">(5x API limits, access to Speaking Simulator)</span>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Saving...' : (editingOrg ? 'Update' : 'Create')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Org Admin Modal */}
            {showAdminModal && targetOrg && (
                <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                <Shield size={18} style={{ color: 'var(--color-primary)' }} /> Add Org Admin
                            </h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowAdminModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleCreateAdmin}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                                {/* Org Info Banner */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                    padding: 'var(--space-3) var(--space-4)',
                                    background: 'var(--color-neutral-50)',
                                    borderRadius: 'var(--radius-md)',
                                    borderLeft: `3px solid ${targetOrg.primary_color || 'var(--color-primary)'}`,
                                }}>
                                    <Building2 size={18} style={{ color: targetOrg.primary_color || 'var(--color-primary)' }} />
                                    <div>
                                        <div className="font-semibold text-sm">{targetOrg.name}</div>
                                        <div className="text-xs text-muted">This admin will manage this organization</div>
                                    </div>
                                </div>

                                {error && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '12px', background: '#FEF2F2',
                                        color: '#DC2626', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                                    }}>
                                        <AlertCircle size={16} /> {error}
                                    </div>
                                )}

                                {success && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '12px', background: '#F0FDF4',
                                        color: '#16A34A', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                                    }}>
                                        <CheckCircle size={16} /> {success}
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input className="form-input" value={adminForm.full_name}
                                        onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })}
                                        placeholder="e.g. John Smith" required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Email *</label>
                                    <input type="email" className="form-input" value={adminForm.email}
                                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                                        placeholder="admin@organization.com" required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Password *</label>
                                    <input type="password" className="form-input" value={adminForm.password}
                                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                                        placeholder="Minimum 8 characters" required minLength={8} />
                                    <p className="text-xs text-muted" style={{ marginTop: '4px' }}>
                                        Share these credentials with the org admin. They can log in immediately.
                                    </p>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowAdminModal(false)}>
                                    {success ? 'Done' : 'Cancel'}
                                </button>
                                {!success && (
                                    <button type="submit" className="btn btn-primary" disabled={saving}>
                                        {saving ? 'Creating...' : <><UserPlus size={16} /> Create Org Admin</>}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
