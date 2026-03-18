import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';

// Super Admin
import SuperAdminOverview from './pages/SuperAdmin/Overview';
import Organizations from './pages/SuperAdmin/Organizations';
import ContentLibrary from './pages/SuperAdmin/ContentLibrary';
import CostMonitor from './pages/SuperAdmin/CostMonitor';
import SuperAdminAnalytics from './pages/SuperAdmin/Analytics';
import Billing from './pages/SuperAdmin/Billing';

// Org Admin
import OrgAdminDashboard from './pages/OrgAdmin/Dashboard';
import OrgAdminUsers from './pages/OrgAdmin/Users';
import Branding from './pages/OrgAdmin/Branding';
import Reports from './pages/OrgAdmin/Reports';
import OrgAdminBilling from './pages/OrgAdmin/Billing';
import OrgStudents from './pages/OrgAdmin/Students';
import OrgTeachers from './pages/OrgAdmin/Teachers';

// Teacher
import TeacherDashboard from './pages/Teacher/Dashboard';
import WritingReview from './pages/Teacher/WritingReview';
import SpeakingReview from './pages/Teacher/SpeakingReview';
import ListeningReview from './pages/Teacher/ListeningReview';
import TeacherStudents from './pages/Teacher/Students';

// Student
import StudentDashboard from './pages/Student/Dashboard';
import Reading from './pages/Student/Reading';
import Writing from './pages/Student/Writing';
import Listening from './pages/Student/Listening';
import Speaking from './pages/Student/Speaking';
import SpeakingSimulator from './pages/Student/SpeakingSimulator';
import SpeakingSimulatorBeta from './pages/Student/SpeakingSimulatorBeta';
import History from './pages/Student/History';
import StudentAnalytics from './pages/Student/Analytics';

function PremiumRoute({ children }) {
  const { isPremium } = useAuth();
  if (!isPremium) return <Navigate to="/student" replace />;
  return children;
}

function AppRoutes() {
  const { isAuthenticated, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg"></div>
        <p className="text-muted" style={{ marginTop: '16px' }}>Loading eLanguage Center...</p>
      </div>
    );
  }

  // Default redirect based on role
  const getDefaultRoute = () => {
    if (!isAuthenticated) return '/login';
    switch (role) {
      case 'super_admin': return '/super-admin';
      case 'org_admin': return '/org-admin';
      case 'teacher': return '/teacher';
      case 'student': return '/student';
      default: return '/login';
    }
  };

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to={getDefaultRoute()} /> : <Login />} />

      {/* Super Admin */}
      <Route path="/super-admin" element={
        <ProtectedRoute allowedRoles={['super_admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<SuperAdminOverview />} />
        <Route path="organizations" element={<Organizations />} />
        <Route path="content-library" element={<ContentLibrary />} />
        <Route path="cost-monitor" element={<CostMonitor />} />
        <Route path="analytics" element={<SuperAdminAnalytics />} />
        <Route path="billing" element={<Billing />} />
      </Route>

      {/* Org Admin */}
      <Route path="/org-admin" element={
        <ProtectedRoute allowedRoles={['org_admin']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<OrgAdminDashboard />} />
        <Route path="users" element={<OrgAdminUsers />} />
        <Route path="branding" element={<Branding />} />
        <Route path="reports" element={<Reports />} />
        <Route path="billing" element={<OrgAdminBilling />} />
        <Route path="students" element={<OrgStudents />} />
        <Route path="teachers" element={<OrgTeachers />} />
      </Route>

      {/* Teacher */}
      <Route path="/teacher" element={
        <ProtectedRoute allowedRoles={['teacher']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<TeacherDashboard />} />
        <Route path="writing-review" element={<WritingReview />} />
        <Route path="speaking-review" element={<SpeakingReview />} />
        <Route path="listening-review" element={<ListeningReview />} />
        <Route path="students" element={<TeacherStudents />} />
      </Route>

      {/* Student */}
      <Route path="/student" element={
        <ProtectedRoute allowedRoles={['student']}>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<StudentDashboard />} />
        <Route path="reading" element={<Reading />} />
        <Route path="writing" element={<Writing />} />
        <Route path="listening" element={<Listening />} />
        <Route path="speaking" element={<Speaking />} />
        <Route path="speaking-test" element={<PremiumRoute><SpeakingSimulator /></PremiumRoute>} />
        <Route path="speaking-test-beta" element={<PremiumRoute><SpeakingSimulatorBeta /></PremiumRoute>} />
        <Route path="history" element={<History />} />
        <Route path="analytics" element={<StudentAnalytics />} />
      </Route>

      {/* Default redirect */}
      <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
