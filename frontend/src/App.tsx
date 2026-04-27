import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import ProjectSetup from './pages/ProjectSetup';
import Contractors from './pages/Contractors';
import Superadmin from './pages/Superadmin';
import Login from './pages/Login';
import { authService } from './services/api';

const AuthGuard = ({ children, requireSuperadmin = false }: { children: React.ReactNode, requireSuperadmin?: boolean }) => {
  if (!authService.isAuthenticated()) return <Navigate to="/login" replace />;
  if (requireSuperadmin && !authService.isSuperadmin()) return <Navigate to="/" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/admin" element={
          <AuthGuard requireSuperadmin={true}>
            <Superadmin />
          </AuthGuard>
        } />
        
        <Route path="/" element={
          <AuthGuard>
            <Layout />
          </AuthGuard>
        }>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<ProjectSetup />} />
          <Route path="plans" element={<Plans />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="settings" element={<div className="p-8 text-slate-500 text-xl font-medium">System Settings coming soon...</div>} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
