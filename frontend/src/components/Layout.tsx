import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Map, Users, Settings, Menu, Bell, X, FolderGit2, LogOut, CalendarRange } from 'lucide-react';
import { authService, notificationService } from '../services/api';
import logoFinal from '../assets/logo_final.png';
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const currentUser = authService.getCurrentUser();
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Project Hierarchy', path: '/setup', icon: FolderGit2 },
    { name: 'PDF Plans & Canvas', path: '/plans', icon: Map },
    { name: 'Curing Progress', path: '/progress', icon: CalendarRange },
    { name: 'Contractor Mgmt', path: '/contractors', icon: Users },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const loadNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const data = await notificationService.getWebNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification: any) => {
    try {
      if (!notification.is_read) {
        await notificationService.markWebNotificationRead(notification.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
        );
      }
    } catch (error) {
      console.error('Failed to mark notification read', error);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-slate-50 flex font-sans overflow-hidden">
      
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
         <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - Instant snap, no JS layout checks */}
      <aside className={`
        fixed md:relative top-0 left-0 h-[100dvh]
        ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'} 
        bg-white border-r border-slate-200 text-slate-600 flex flex-col z-50 shadow-[20px_0_40px_rgba(0,0,0,0.05)] transition-transform duration-300
      `}>
        <div className="h-16 flex items-center px-4 bg-white border-b border-slate-100 justify-between">
          <div className="flex items-center overflow-hidden">
            <img src={logoFinal} alt="CuringGuard Logo" className="w-8 h-8 object-contain drop-shadow-sm flex-shrink-0" />
            <span className={`ml-3 font-black text-lg tracking-tight ${sidebarOpen ? 'block' : 'hidden'}`}>
               <span className="text-slate-900">Curing</span><span className="text-blue-600">Guard</span>
            </span>
          </div>
          <button className="md:hidden text-slate-400 hover:text-slate-900" onClick={() => setSidebarOpen(false)}>
             <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="flex-1 py-6 flex flex-col gap-2 px-3 overflow-y-auto no-scrollbar">
          {navItems.map((item) => (
            <NavLink key={item.name} to={item.path} onClick={() => window.innerWidth < 768 && setSidebarOpen(false)}
              className={({ isActive }) => `flex items-center px-3 py-3 rounded-xl transition-all active:scale-95 ${isActive ? 'bg-blue-50 text-blue-700 font-bold shadow-[0_2px_10px_rgba(0,71,184,0.05)] border border-blue-200/50' : 'hover:bg-slate-50 text-slate-500 hover:text-slate-900'}`}>
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`ml-3 whitespace-nowrap text-sm ${sidebarOpen ? 'block' : 'hidden'}`}>{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-slate-100">
           <button onClick={() => { authService.logout(); window.location.href='/login'; }} className="w-full flex items-center px-3 py-3 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors font-bold text-sm group">
              <LogOut className="w-5 h-5 flex-shrink-0 group-hover:-translate-x-1 transition-transform" />
              <span className={`ml-3 whitespace-nowrap ${sidebarOpen ? 'block' : 'hidden'}`}>Sign Out</span>
           </button>
        </div>
      </aside>

      {/* Main Screen Content Target Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shadow-sm z-30 shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100 focus:outline-none">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setNotificationOpen((current) => !current)}
                className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 border-white text-[10px] font-black text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationOpen && (
                <div className="absolute right-0 top-12 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">Web Notifications</p>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{unreadCount} unread</p>
                    </div>
                    <button
                      onClick={() => { void loadNotifications(); }}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto">
                    {loadingNotifications ? (
                      <div className="flex items-center justify-center py-10 text-slate-500 text-sm font-bold">Loading...</div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-10 text-center text-sm font-bold text-slate-500">No notifications yet.</div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          onClick={() => { void handleNotificationClick(notification); }}
                          className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 ${
                            notification.is_read ? 'bg-white' : 'bg-blue-50/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-900">{notification.title}</p>
                              <p className="mt-1 text-sm font-medium leading-5 text-slate-600">{notification.message}</p>
                            </div>
                            {!notification.is_read && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600" />}
                          </div>
                          <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                            {notification.dispatch_date || 'Immediate'} · {notification.channel}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:bg-slate-700 transition">
              {((currentUser?.full_name || currentUser?.username || 'A') as string).slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="flex-1 relative overflow-hidden bg-slate-100 h-full w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
