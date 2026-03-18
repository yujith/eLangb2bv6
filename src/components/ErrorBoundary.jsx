import { Component } from 'react';

const isDev = import.meta.env.DEV;

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/login';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '100vh', padding: '2rem',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    background: '#f8fafc', color: '#1e293b',
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '12px', padding: '2.5rem',
                        maxWidth: '480px', width: '100%', textAlign: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Something went wrong
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            An unexpected error occurred. This is usually temporary and can be fixed by reloading the page.
                        </p>
                        {isDev && this.state.error && (
                            <pre style={{
                                background: '#fef2f2', color: '#991b1b', padding: '0.75rem',
                                borderRadius: '6px', fontSize: '0.75rem', textAlign: 'left',
                                overflow: 'auto', maxHeight: '120px', marginBottom: '1.5rem',
                                border: '1px solid #fecaca',
                            }}>
                                {this.state.error.toString()}
                            </pre>
                        )}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={this.handleReload}
                                style={{
                                    padding: '0.5rem 1.25rem', borderRadius: '6px', border: 'none',
                                    background: '#E30613', color: '#fff', fontWeight: 500,
                                    cursor: 'pointer', fontSize: '0.875rem',
                                }}
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={this.handleGoHome}
                                style={{
                                    padding: '0.5rem 1.25rem', borderRadius: '6px',
                                    border: '1px solid #e2e8f0', background: '#fff',
                                    color: '#475569', fontWeight: 500, cursor: 'pointer',
                                    fontSize: '0.875rem',
                                }}
                            >
                                Go to Login
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
