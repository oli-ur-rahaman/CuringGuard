import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import CuringProgress from './pages/CuringProgress';
import ProjectSetup from './pages/ProjectSetup';
import Contractors from './pages/Contractors';
import Superadmin from './pages/Superadmin';
import Login from './pages/Login';
import Settings from './pages/Settings';
import { authService } from './services/api';

const AuthGuard = ({ children, requireSuperadmin = false }: { children: ReactNode, requireSuperadmin?: boolean }) => {
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
          <Route path="progress" element={<CuringProgress />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
