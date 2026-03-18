import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
    Users, Plus, Search, Edit2, Trash2, AlertCircle, UserCheck,
    GraduationCap, ShieldCheck
} from 'lucide-react';

export default function OrgAdminUsers() {
    const { organization, hasTeachers } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [formData, setFormData] = useState({
        full_name: '',
        email: '',
        password: '',
        role: 'student',
        license_active: true,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (organization?.id) fetchUsers();
    }, [organization]);

    const fetchUsers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('organization_id', organization.id)
            .neq('role', 'super_admin')
            .order('created_at', { ascending: false });

        if (!error) setUsers(data || []);
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');

        try {
            const { createUserAccount } = await import('../../lib/adminUserManager');

            await createUserAccount({
                email: formData.email,
                password: formData.password,
                fullName: formData.full_name,
                role: formData.role,
                organizationId: organization.id,
            });

            setShowModal(false);
            setFormData({ full_name: '', email: '', password: '', role: 'student', license_active: true });
            fetchUsers();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (user) => {
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        const { error } = await supabase
            .from('profiles')
            .update({ status: newStatus })
            .eq('id', user.id);
        if (!error) fetchUsers();
    };

    const toggleLicense = async (user) => {
        const { error } = await supabase
            .from('profiles')
            .update({ license_active: !user.license_active })
            .eq('id', user.id);
        if (!error) fetchUsers();
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = filterRole === 'all' || u.role === filterRole;
        return matchesSearch && matchesRole;
    });

    const roleIcon = (role) => {
        switch (role) {
            case 'teacher': return <UserCheck size={14} />;
            case 'student': return <GraduationCap size={14} />;
            case 'org_admin': return <ShieldCheck size={14} />;
            default: return null;
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p className="text-muted">Manage teachers and students in your organization</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> Add User
                </button>
            </div>

            {/* Filters */}
            <div className="flex gap-4 items-center" style={{ marginBottom: 'var(--space-6)' }}>
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text" placeholder="Search users..."
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="tabs" style={{ border: 'none', margin: 0 }}>
                    {['all', 'student', ...(hasTeachers ? ['teacher'] : []), 'org_admin'].map((r) => (
                        <button
                            key={r}
                            className={`tab ${filterRole === r ? 'active' : ''}`}
                            onClick={() => setFilterRole(r)}
                            style={{ textTransform: 'capitalize' }}
                        >
                            {r === 'all' ? 'All' : r.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            {loading ? (
                <div className="flex justify-center" style={{ padding: 'var(--space-16)' }}>
                    <div className="spinner spinner-lg"></div>
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="empty-state">
                    <Users size={64} />
                    <h3>No users found</h3>
                    <p>Add your first user to this organization.</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>License</th>
                                <th>Status</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="avatar">{(user.full_name || '?').substring(0, 2).toUpperCase()}</div>
                                            <span className="font-medium" style={{ color: 'var(--color-neutral-900)' }}>
                                                {user.full_name}
                                            </span>
                                        </div>
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <span className={`badge ${user.role === 'teacher' ? 'badge-info' : user.role === 'org_admin' ? 'badge-primary' : 'badge-neutral'}`}>
                                            {roleIcon(user.role)} {user.role?.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td>
                                        {user.role === 'student' ? (
                                            <button
                                                className={`badge ${user.license_active ? 'badge-success' : 'badge-error'}`}
                                                onClick={() => toggleLicense(user)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {user.license_active ? 'Active' : 'Inactive'}
                                            </button>
                                        ) : (
                                            <span className="text-muted text-xs">N/A</span>
                                        )}
                                    </td>
                                    <td>
                                        <button
                                            className={`badge ${user.status === 'active' ? 'badge-success' : 'badge-error'}`}
                                            onClick={() => toggleStatus(user)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {user.status}
                                        </button>
                                    </td>
                                    <td className="text-sm">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--color-error)' }}>
                                            <Trash2 size={15} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add User Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Add New User</h3>
                            <button className="btn btn-icon btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                                {error && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '12px', background: 'var(--color-error-light)',
                                        color: 'var(--color-error)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
                                    }}>
                                        <AlertCircle size={16} /> {error}
                                    </div>
                                )}

                                <div className="form-group">
                                    <label className="form-label">Full Name *</label>
                                    <input className="form-input" value={formData.full_name}
                                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                        placeholder="John Smith" required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Email *</label>
                                    <input type="email" className="form-input" value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john@organization.com" required />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Password *</label>
                                    <input type="password" className="form-input" value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder="Minimum 8 characters" required minLength={8} />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Role</label>
                                    <select className="form-select" value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                                        <option value="student">Student</option>
                                        {hasTeachers && <option value="teacher">Teacher</option>}
                                        <option value="org_admin">Organization Admin</option>
                                    </select>
                                </div>

                                {formData.role === 'student' && (
                                    <div className="flex items-center gap-3">
                                        <input type="checkbox" id="license" checked={formData.license_active}
                                            onChange={(e) => setFormData({ ...formData, license_active: e.target.checked })} />
                                        <label htmlFor="license" className="text-sm">Activate license immediately</label>
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
