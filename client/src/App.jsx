// client/src/App.jsx
// Main router - protected routes with role-based redirects

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';

// Pages - Lazy loaded
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const EmployeeDashboard = lazy(() => import('./pages/employee/EmployeeDashboard'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const BuilderProjectSelector = lazy(() => import('./pages/BuilderProjectSelector'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const VendorsPage = lazy(() => import('./pages/VendorsPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ClientDetail = lazy(() => import('./pages/admin/ClientDetail'));
const InvoicePage = lazy(() => import('./pages/admin/InvoicePage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const AccountingPage = lazy(() => import('./pages/admin/AccountingPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const StaffPage = lazy(() => import('./pages/admin/StaffPage'));
const StaffDetailPage = lazy(() => import('./pages/admin/StaffDetailPage'));
const HistoryPage = lazy(() => import('./pages/admin/HistoryPage'));
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage'));

function ProtectedRoute({ children, adminOnly = false, allowAccounts = false }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  
  const isAccounts = user.role === 'back_office' || user.role === 'accounts' || user.department?.toLowerCase() === 'accounts';

  if (adminOnly && !allowAccounts && user.role !== 'admin') {
    return <Navigate to="/employee/dashboard" replace />;
  }
  
  if (adminOnly && allowAccounts && user.role !== 'admin' && !isAccounts) {
    return <Navigate to="/employee/dashboard" replace />;
  }
  
  if (allowAccounts && user.role !== 'admin' && !isAccounts) {
    return <Navigate to="/employee/dashboard" replace />;
  }
  
  return children;
}

function RoleRouter() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  
  const isAccounts = user.role === 'back_office' || user.role === 'accounts' || user.department?.toLowerCase() === 'accounts';
  
  return (user.role === 'admin' || isAccounts)
    ? <Navigate to="/admin/dashboard" replace />
    : <Navigate to="/employee/dashboard" replace />;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RoleRouter />} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute adminOnly allowAccounts><AdminDashboard /></ProtectedRoute>
        } />
        <Route path="/admin/invoice" element={
          <ProtectedRoute allowAccounts><InvoicePage /></ProtectedRoute>
        } />
        <Route path="/admin/accounting" element={
          <ProtectedRoute allowAccounts><AccountingPage /></ProtectedRoute>
        } />
        <Route path="/admin/history" element={
          <ProtectedRoute adminOnly allowAccounts><HistoryPage /></ProtectedRoute>
        } />
        <Route path="/admin/settings" element={
          <ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>
        } />
        <Route path="/admin/reports" element={
          <ProtectedRoute adminOnly allowAccounts><ReportsPage /></ProtectedRoute>
        } />
        <Route path="/admin/staff" element={
          <ProtectedRoute adminOnly><StaffPage /></ProtectedRoute>
        } />
        <Route path="/admin/staff/:id" element={
          <ProtectedRoute adminOnly><StaffDetailPage /></ProtectedRoute>
        } />
        <Route path="/admin/profile" element={
          <ProtectedRoute adminOnly allowAccounts><StaffDetailPage /></ProtectedRoute>
        } />

        {/* Employee */}
        <Route path="/employee/dashboard" element={
          <ProtectedRoute><EmployeeDashboard /></ProtectedRoute>
        } />
        <Route path="/employee/profile" element={
          <ProtectedRoute><StaffDetailPage /></ProtectedRoute>
        } />

        {/* Shared */}
        <Route path="/daily-reports" element={
          <ProtectedRoute><DailyReportsPage /></ProtectedRoute>
        } />
        <Route path="/projects" element={
          <ProtectedRoute><ProjectsPage /></ProtectedRoute>
        } />
        <Route path="/builder" element={
          <ProtectedRoute><BuilderProjectSelector /></ProtectedRoute>
        } />
        <Route path="/projects/:id" element={
          <ProtectedRoute><ProjectDetail /></ProtectedRoute>
        } />
        <Route path="/attendance" element={
          <ProtectedRoute><AttendancePage /></ProtectedRoute>
        } />
        <Route path="/tasks" element={
          <ProtectedRoute><TasksPage /></ProtectedRoute>
        } />
        <Route path="/vendors" element={
          <ProtectedRoute><VendorsPage /></ProtectedRoute>
        } />
        <Route path="/clients" element={
          <ProtectedRoute><ClientsPage /></ProtectedRoute>
        } />
        <Route path="/clients/:id" element={
          <ProtectedRoute><ClientDetail /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#FFFFFF',
                color: '#1A1A1A',
                border: '1px solid #E0E0E0',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#10b981', secondary: '#FFFFFF' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#FFFFFF' } },
            }}
          />
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}
