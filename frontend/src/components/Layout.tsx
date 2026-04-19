import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Map, Users, Settings, Menu, Bell, HardHat } from 'lucide-react';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'PDF Plans & Canvas', path: '/plans', icon: Map },
    { name: 'Contractors', path: '/contractors', icon: Users },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="h-screen w-screen bg-slate-50 flex font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-900 text-slate-300 transition-all duration-300 flex flex-col z-50 shadow-xl`}>
        <div className="h-16 flex items-center px-4 bg-slate-950 border-b border-slate-800">
          <HardHat className="text-amber-500 w-8 h-8 flex-shrink-0" />
          {sidebarOpen && <span className="ml-3 font-bold text-lg text-white tracking-wide">CuringGuard</span>}
        </div>
        <nav className="flex-1 py-6 flex flex-col gap-2 px-3">
          {navItems.map((item) => (
            <NavLink key={item.name} to={item.path}
              className={({ isActive }) => `flex items-center px-3 py-3 rounded-md transition-colors ${isActive ? 'bg-amber-500 text-slate-900 font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}>
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="ml-3">{item.name}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-40">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 focus:outline-none">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:bg-slate-700 transition">
              AD
            </div>
          </div>
        </header>

        {/* Note: Padding is removed here because the Canvas needs absolute full screen space! */}
        <main className="flex-1 relative overflow-hidden bg-slate-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
