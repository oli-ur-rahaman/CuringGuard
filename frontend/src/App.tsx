import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="plans" element={<div className="p-8 text-slate-500 text-xl font-medium">PDF Plans & Canvas coming soon...</div>} />
          <Route path="contractors" element={<div className="p-8 text-slate-500 text-xl font-medium">Contractor Management coming soon...</div>} />
          <Route path="settings" element={<div className="p-8 text-slate-500 text-xl font-medium">System Settings coming soon...</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
