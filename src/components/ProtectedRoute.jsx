import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { isAuthenticated, loading, role } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner spinner-lg"></div>
                <p className="text-muted">Loading...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        // Redirect to appropriate dashboard based on role
        const dashboardPaths = {
            super_admin: '/super-admin',
            org_admin: '/org-admin',
            teacher: '/teacher',
            student: '/student',
        };
        return <Navigate to={dashboardPaths[role] || '/login'} replace />;
    }

    return children;
}
