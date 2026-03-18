import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { hexToRgb, darkenColor } from '../../lib/colorUtils';
import { Upload, Palette, Save, Check } from 'lucide-react';

export default function Branding() {
    const { organization } = useAuth();
    const [primaryColor, setPrimaryColor] = useState(organization?.primary_color || '#E30613');
    const [secondaryColor, setSecondaryColor] = useState(organization?.secondary_color || '#00BCD4');
    const [sidebarBgColor, setSidebarBgColor] = useState(organization?.sidebar_bg_color || '#1E293B');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(organization?.logo_url || null);

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let logoUrl = organization?.logo_url;

            // Upload logo if changed
            if (logoFile) {
                const extension = logoFile.name.split('.').pop();
                const filePath = `logos/${organization.id}/logo.${extension}`;
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(filePath, logoFile, { upsert: true });

                if (uploadError) {
                    console.error('Logo upload error:', uploadError);
                } else {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(filePath);
                    logoUrl = publicUrl;
                }
            }

            // Update organization
            const { error } = await supabase
                .from('organizations')
                .update({
                    primary_color: primaryColor,
                    secondary_color: secondaryColor,
                    sidebar_bg_color: sidebarBgColor,
                    logo_url: logoUrl,
                })
                .eq('id', organization.id);

            if (!error) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);

                // Apply to CSS variables live
                document.documentElement.style.setProperty('--org-primary', primaryColor);
                document.documentElement.style.setProperty('--org-secondary', secondaryColor);
                
                // Generate and set derived colors
                const rgb = hexToRgb(primaryColor);
                if (rgb) {
                    document.documentElement.style.setProperty('--org-primary-hover', darkenColor(primaryColor, 0.1));
                    document.documentElement.style.setProperty('--org-primary-light', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`);
                    document.documentElement.style.setProperty('--org-primary-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
                }
                
                const rgbSecondary = hexToRgb(secondaryColor);
                if (rgbSecondary) {
                    document.documentElement.style.setProperty('--org-secondary-light', `rgba(${rgbSecondary.r}, ${rgbSecondary.g}, ${rgbSecondary.b}, 0.1)`);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <h1 className="page-title">Branding & Theme</h1>
            <p className="page-subtitle">Customize your organization's look and feel.</p>

            <div className="grid grid-2">
                {/* Settings */}
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>Brand Settings</h4>

                    {/* Logo Upload */}
                    <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                        <label className="form-label">Organization Logo</label>
                        <div style={{
                            border: '2px dashed var(--color-neutral-200)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-8)',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all var(--transition-fast)',
                        }}
                            onClick={() => document.getElementById('logo-input').click()}
                        >
                            {logoPreview ? (
                                <img src={logoPreview} alt="Logo" style={{
                                    maxWidth: '200px', maxHeight: '80px', margin: '0 auto',
                                }} />
                            ) : (
                                <>
                                    <Upload size={32} style={{ color: 'var(--color-neutral-400)', margin: '0 auto var(--space-2)' }} />
                                    <p className="text-sm text-muted">Click to upload logo</p>
                                    <p className="text-xs text-muted">PNG, SVG, or JPG (max 2MB)</p>
                                </>
                            )}
                        </div>
                        <input
                            id="logo-input" type="file" accept="image/*"
                            style={{ display: 'none' }} onChange={handleLogoChange}
                        />
                    </div>

                    {/* Colors */}
                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Primary Color</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color" value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                style={{ width: '48px', height: '48px', padding: 0, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                            />
                            <input
                                type="text" className="form-input" value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                        <label className="form-label">Secondary Color</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color" value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                style={{ width: '48px', height: '48px', padding: 0, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                            />
                            <input
                                type="text" className="form-input" value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                            />
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                        <label className="form-label">Sidebar / Logo Area Background</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color" value={sidebarBgColor}
                                onChange={(e) => setSidebarBgColor(e.target.value)}
                                style={{ width: '48px', height: '48px', padding: 0, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                            />
                            <input
                                type="text" className="form-input" value={sidebarBgColor}
                                onChange={(e) => setSidebarBgColor(e.target.value)}
                                style={{ maxWidth: '140px', fontFamily: 'monospace' }}
                            />
                        </div>
                        <p className="text-xs text-muted" style={{ marginTop: '4px' }}>Controls the logo area at the top of the sidebar.</p>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saved ? <><Check size={18} /> Saved!</> : saving ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                    </button>
                </div>

                {/* Preview */}
                <div className="card">
                    <h4 className="card-title" style={{ marginBottom: 'var(--space-6)' }}>Live Preview</h4>

                    <div style={{
                        background: 'var(--color-neutral-50)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden',
                    }}>
                        {/* Fake Sidebar Preview */}
                        <div style={{
                            background: sidebarBgColor,
                            padding: 'var(--space-4)',
                            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                        }}>
                            {logoPreview ? (
                                <img src={logoPreview} alt="Logo" style={{ height: 24, width: 'auto' }} />
                            ) : (
                                <div style={{
                                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                                    background: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <span style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>eL</span>
                                </div>
                            )}
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                                {organization?.name || 'Your Organization'}
                            </span>
                        </div>

                        {/* Fake Nav */}
                        <div style={{ padding: 'var(--space-3)' }}>
                            {['Dashboard', 'Users', 'Reports'].map((item, i) => (
                                <div key={i} style={{
                                    padding: 'var(--space-2) var(--space-3)',
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: '4px',
                                    background: i === 0 ? primaryColor : 'transparent',
                                    color: i === 0 ? '#fff' : 'var(--color-neutral-500)',
                                    fontSize: 'var(--text-sm)',
                                }}>
                                    {item}
                                </div>
                            ))}
                        </div>

                        {/* Fake Content */}
                        <div style={{ padding: 'var(--space-4)', background: '#fff' }}>
                            <div style={{
                                height: '12px', width: '60%', borderRadius: 4,
                                background: 'var(--color-neutral-200)', marginBottom: 'var(--space-3)',
                            }} />
                            <div className="flex gap-2">
                                <div style={{
                                    padding: '6px 16px', borderRadius: 'var(--radius-md)',
                                    background: primaryColor, color: '#fff', fontSize: 'var(--text-xs)',
                                }}>
                                    Primary Button
                                </div>
                                <div style={{
                                    padding: '6px 16px', borderRadius: 'var(--radius-md)',
                                    background: secondaryColor, color: '#fff', fontSize: 'var(--text-xs)',
                                }}>
                                    Secondary
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
