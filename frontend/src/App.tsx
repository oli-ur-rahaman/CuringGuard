import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Plans from './pages/Plans';
import ProjectSetup from './pages/ProjectSetup';
import Contractors from './pages/Contractors';
import Superadmin from './pages/Superadmin';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<Superadmin />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<ProjectSetup />} />
          <Route path="plans" element={<Plans />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="settings" element={<div className="p-8 text-slate-500 text-xl font-medium">System Settings coming soon...</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
