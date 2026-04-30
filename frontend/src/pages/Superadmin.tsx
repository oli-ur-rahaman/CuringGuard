import React, { useState, useEffect } from 'react';
import { 
  Server, HardHat, Ban, Box, DatabaseZap, 
  Power, Settings2, ShieldBan, Plus, LogOut, ChevronRight, Menu, X, Search, Edit3, KeyRound
} from 'lucide-react';
import { authService, libraryService, userService } from '../services/api';
import logoFinal from '../assets/logo_final.png';

export default function Superadmin() {
  const [activeTab, setActiveTab] = useState('tenants');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Dynamic Data States
  const [tenants, setTenants] = useState<any[]>([]);
  const [elements, setElements] = useState<any[]>([]);
  const [globalContractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'tenants') {
        const data = await userService.getUsers(undefined, 'monitor');
        setTenants(data);
      } else if (activeTab === 'elements') {
        const data = await libraryService.getRules();
        setElements(data);
      }
    } catch (err) {
      console.error(`Failed to fetch ${activeTab}`, err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = 
      (t.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (t.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && t.is_active) || 
      (statusFilter === 'inactive' && !t.is_active);

    return matchesSearch && matchesStatus;
  });

  const handleToggleStatus = async (id: number) => {
    try {
      if (activeTab === 'tenants') {
        await userService.toggleUserActive(id);
      } else if (activeTab === 'elements') {
        const item = elements.find(e => e.id === id);
        if (item) {
          await libraryService.updateRule(id, { is_active: !item.is_active });
        }
      }
      refreshData();
    } catch (err: any) {
      console.error("Toggle error:", err);
      alert(err.response?.data?.detail || "Failed to toggle status");
    }
  };

  const handleResetPassword = async (tenantId: number) => {
    const newPassword = window.prompt("Enter new password for this monitor account:");
    if (newPassword && newPassword.length >= 6) {
      try {
        await userService.resetUserPassword(tenantId, newPassword);
        alert("Password reset successfully!");
      } catch (err: any) {
        console.error("Reset error:", err);
        alert(err.response?.data?.detail || "Failed to reset password.");
      }
    } else if (newPassword) {
      alert("Password must be at least 6 characters.");
    }
  };



  const openAddModal = () => {
    setEditingItem(null);
    if (activeTab === 'tenants') {
      setFormData({ full_name: '', email: '', mobile_number: '', password: '' });
    } else if (activeTab === 'elements') {
      setFormData({ element_name: '', required_curing_days: '', description: '', geometry_type: 'line' });
    }
    setShowModal(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    if (activeTab === 'tenants') {
      setFormData({ full_name: item.full_name, email: item.email || '', mobile_number: item.mobile_number || '' });
    } else if (activeTab === 'elements') {
      setFormData({ 
        element_name: item.element_name, 
        required_curing_days: item.required_curing_days, 
        description: item.description || '', 
        geometry_type: item.geometry_type 
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === 'tenants') {
      if (!formData.full_name || !formData.email || !formData.mobile_number || (!editingItem && !formData.password)) {
        alert("All fields are mandatory.");
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        alert("Please enter a valid email address.");
        return;
      }
      const mobileRegex = /^\d{11}$/;
      if (!mobileRegex.test(formData.mobile_number)) {
        alert("Mobile number must be exactly 11 digits.");
        return;
      }
      if (!editingItem && formData.password && formData.password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
      }
    } else if (activeTab === 'elements') {
      if (!formData.element_name || !formData.required_curing_days || !formData.geometry_type) {
        alert("Title, curing period, and type are mandatory.");
        return;
      }
      if (!/^\d+$/.test(formData.required_curing_days.toString())) {
        alert("Curing period must be digits only.");
        return;
      }
    }

    try {
      if (activeTab === 'tenants') {
        const normalizedEmail = formData.email.trim().toLowerCase();
        const emailCheck = await userService.checkEmail(normalizedEmail, editingItem?.id);
        if (emailCheck.exists) {
          alert("This email ID is already present in the system. Use another email.");
          return;
        }
        if (editingItem) {
          await userService.update_user(editingItem.id, { ...formData, email: normalizedEmail });
        } else {
          await userService.create_user({ ...formData, email: normalizedEmail, role: 'monitor', username: normalizedEmail });
        }
      } else if (activeTab === 'elements') {
        const payload = {
          ...formData,
          required_curing_days: parseInt(formData.required_curing_days)
        };
        if (editingItem) {
          await libraryService.updateRule(editingItem.id, payload);
        } else {
          await libraryService.createRule(payload);
        }
      }
      setShowModal(false);
      refreshData();
    } catch (err: any) {
      console.error("Submission error:", err);
      const msg = err.response?.data?.detail || "Operation failed.";
      alert(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const sidebarMenus = [
    { id: 'tenants', label: 'Monitor Admins', icon: Server, description: 'Manage office silos' },
    { id: 'elements', label: 'Physics Engine', icon: Settings2, description: 'Curing durations & constraints' },
    { id: 'contractors', label: 'IAM Global Override', icon: ShieldBan, description: 'Cross-tenant account locking' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
       
       {/* MOBILE HEADER (Visible only on small and medium screens) */}
       <div className="lg:hidden absolute top-0 left-0 w-full bg-white border-b border-slate-200 p-4 flex items-center justify-between z-20 shadow-sm">
          <div className="flex items-center gap-3">
             <img src={logoFinal} alt="CuringGuard Logo" className="w-8 h-8 object-contain" />
             <h1 className="font-extrabold text-slate-900 text-lg tracking-tight">Curing<span className="text-blue-600">Guard</span></h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 active:scale-95 transition-transform shadow-sm"><Menu className="w-5 h-5" /></button>
       </div>

       {/* MOBILE OVERLAY BACKDROP */}
       {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
       )}

       {/* SCALABLE LEFT SIDEBAR */}
       <div className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex flex-col shadow-[20px_0_40px_rgba(0,0,0,0.1)] z-50 transform transition-transform duration-300 lg:relative lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
             <div className="flex items-center gap-3">
                <img src={logoFinal} alt="CuringGuard Logo" className="w-12 h-12 object-contain drop-shadow-sm" />
                <div>
                   <h1 className="font-extrabold text-slate-900 tracking-tight leading-none text-xl">Curing<span className="text-blue-600">Guard</span></h1>
                   <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest mt-1">Superadmin Portal</p>
                </div>
             </div>
             <button className="lg:hidden p-2 text-slate-400 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100" onClick={() => setIsMobileMenuOpen(false)}><X className="w-5 h-5"/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
             <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest pl-2 mb-3 mt-2">Core Utilities</p>
             {sidebarMenus.map(menu => (
                <button 
                  key={menu.id} 
                  onClick={() => { setActiveTab(menu.id); setIsMobileMenuOpen(false); setSearchQuery(''); setStatusFilter('all'); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${activeTab === menu.id ? 'bg-blue-50 text-blue-700 border border-blue-200/50 shadow-[0_2px_10px_rgba(0,71,184,0.05)]' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                   <menu.icon className={`w-5 h-5 flex-shrink-0 ${activeTab === menu.id ? 'text-blue-600' : 'text-slate-400'}`} />
                   <div>
                      <span className="block font-bold text-sm">{menu.label}</span>
                   </div>
                   {activeTab === menu.id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
                </button>
             ))}
          </div>

          <div className="p-4 border-t border-slate-100">
             <button onClick={() => authService.logout()} className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-blue-600 transition-colors font-bold text-sm group">
                <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Sign Out
             </button>
          </div>
       </div>

       {/* MAIN CONTENT AREA */}
       <div className="flex-1 overflow-y-auto bg-slate-50 relative pt-20 lg:pt-0">
          
          {/* TAB 1: TENANTS */}
          {activeTab === 'tenants' && (
             <div className="p-6 md:p-10 max-w-[1200px] animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                   <div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                         <Server className="w-8 h-8 text-blue-600" /> Monitor Admins
                      </h2>
                      <p className="text-slate-500 font-medium mt-2">Create, edit, reset password and change active status.</p>
                   </div>
                   
                   <div className="flex flex-wrap items-center gap-3">
                     <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
                       <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                       <button onClick={() => setStatusFilter('active')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${statusFilter === 'active' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Active</button>
                       <button onClick={() => setStatusFilter('inactive')} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${statusFilter === 'inactive' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Suspended</button>
                     </div>

                     <div className="relative group flex-1 min-w-[200px]">
                       <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                       <input 
                         type="text" 
                         placeholder="Search tenants..." 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         className="bg-white border-2 border-slate-200 rounded-2xl py-3 pl-12 pr-6 font-bold text-sm outline-none focus:border-blue-600 transition-all w-full"
                       />
                     </div>

                     <button onClick={openAddModal} className="bg-slate-900 border border-slate-800 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-slate-900/20 hover:bg-slate-800">
                       <Plus className="w-4 h-4" /> Add Monitors
                     </button>
                   </div>
                </div>

                {loading ? (
                   <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                ) : filteredTenants.length === 0 ? (
                   <div className="text-center py-20">
                     <Server className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                     <p className="text-slate-400 font-bold text-lg">No monitors found</p>
                     <p className="text-slate-400 text-sm mt-1">Click "Add Monitors" to create your first one.</p>
                   </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                     {filteredTenants.map(t => (
                        <div key={t.id} className={`bg-white border-2 p-6 rounded-3xl relative overflow-hidden group transition-colors shadow-sm ${t.is_active ? 'border-slate-200 hover:border-slate-300' : 'border-red-100 bg-red-50/10 hover:border-red-200'}`}>
                           <div className={`absolute top-0 left-0 w-full h-1.5 ${t.is_active ? 'bg-green-500' : 'bg-red-500'}`}></div>
                           
                           {/* Hover Actions */}
                           <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => handleEdit(t)} className="p-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-slate-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                           </div>

                           <div className="flex justify-between items-start mb-6 mt-1">
                              <div>
                                 <h3 className="text-lg font-extrabold text-slate-900 leading-tight pr-16">{t.full_name || t.username}</h3>
                                 {t.email && (
                                   <p className="font-mono text-[11px] font-bold text-slate-400 mt-1.5 bg-slate-100 inline-block px-2 py-0.5 rounded border border-slate-200">{t.email}</p>
                                 )}
                              </div>
                           </div>
                           
                           <div className="flex items-center gap-6 mb-8 px-2 py-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-2 text-slate-600">
                                 <DatabaseZap className="w-4 h-4 text-blue-500" /> <span className="font-extrabold text-sm">—</span> <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Projects</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                 <HardHat className="w-4 h-4 text-amber-500" /> <span className="font-extrabold text-sm">—</span> <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contractors</span>
                              </div>
                           </div>

                           <div className="grid grid-cols-2 gap-3">
                              <button onClick={() => handleResetPassword(t.id)} className="py-2.5 rounded-xl bg-white border-2 border-slate-200 font-bold text-slate-600 text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm active:scale-95 transition-all"><KeyRound className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" /> Reset Auth</button>
                              <button onClick={() => handleToggleStatus(t.id)} className={`py-2.5 rounded-xl border-2 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all ${t.is_active ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}>
                                 <Power className="w-3.5 h-3.5" /> {t.is_active ? 'Suspend' : 'Reactivate'}
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>
                )}
             </div>
          )}

          {/* TAB 2: PHYSICS LOGIC */}
          {activeTab === 'elements' && (
             <div className="p-6 md:p-10 max-w-[1200px] animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-8 flex items-center justify-between">
                   <div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                         <Settings2 className="w-8 h-8 text-amber-500" /> Curing Physics
                      </h2>
                      <p className="text-slate-500 font-medium mt-2">Add member type, their curing period, description and type.</p>
                   </div>
                   <button onClick={openAddModal} className="bg-amber-100 border border-amber-200 text-amber-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm hover:bg-amber-200"><Plus className="w-4 h-4" /> Add</button>
                </div>
                
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest pl-8">Element Title</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Description</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Curing Period</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Type</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {elements.map(el => (
                            <tr key={el.id} className={`hover:bg-slate-50/50 transition-colors group ${!el.is_active ? 'opacity-60' : ''}`}>
                               <td className="p-6 pl-8">
                                 <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors"><Box className="w-5 h-5" /></div>
                                   <span className="font-extrabold text-slate-900 text-lg">{el.element_name || el.name}</span>
                                 </div>
                               </td>
                               <td className="p-6">
                                  <p className="text-sm text-slate-500 max-w-xs truncate" title={el.description}>{el.description || 'N/A'}</p>
                               </td>
                               <td className="p-6">
                                  <span className="font-mono text-amber-700 font-bold bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 shadow-sm inline-block">{el.required_curing_days || el.duration} Days</span>
                               </td>
                               <td className="p-6">
                                  <span className="font-extrabold text-xs uppercase tracking-widest text-slate-600 bg-white shadow-sm px-4 py-2 rounded-full inline-block border-2 border-slate-200 flex items-center gap-2 max-w-fit">
                                    <span className={`w-2.5 h-2.5 rounded-full ${el.geometry_type === 'line' ? 'bg-amber-500' : el.geometry_type === 'area' ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
                                    {el.geometry_type || el.color}
                                  </span>
                               </td>
                               <td className="p-6">
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => handleEdit(el)} className="p-2 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-slate-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                                    <button onClick={() => handleToggleStatus(el.id)} className={`p-2 rounded-xl border-2 transition-colors ${el.is_active ? 'bg-red-50 border-red-100 text-red-500 hover:bg-red-100' : 'bg-green-50 border-green-100 text-green-500 hover:bg-green-100'}`}>
                                      <Power className="w-4 h-4" />
                                    </button>
                                  </div>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* TAB 3: GLOBAL IAM OVERRIDE */}
          {activeTab === 'contractors' && (
             <div className="p-6 md:p-10 max-w-[1200px] animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-8 flex items-center justify-between">
                   <div className="max-w-xl">
                      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                         <ShieldBan className="w-8 h-8 text-red-500" /> Master IAM Directory
                      </h2>
                      <p className="text-slate-500 font-medium mt-2 leading-relaxed">Bypass tenant siloing to execute emergency global lockouts on specific operational accounts across all boundaries.</p>
                   </div>
                </div>

                <div className="bg-white border-2 border-red-100 rounded-[2rem] overflow-hidden shadow-xl shadow-red-900/5 mt-4">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-red-100 bg-red-50/50">
                            <th className="p-6 text-[11px] font-extrabold text-red-400 uppercase tracking-widest pl-8">Terminated Account Target</th>
                            <th className="p-6 text-[11px] font-extrabold text-red-400 uppercase tracking-widest">Origin Silo / Tenant</th>
                            <th className="p-6 text-[11px] font-extrabold text-red-400 uppercase tracking-widest text-right pr-8">Authoritative Action</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-red-50">
                         {globalContractors.map(c => (
                            <tr key={c.id} className="hover:bg-red-50/30 transition-colors group">
                               <td className="p-6 pl-8 font-extrabold text-slate-900 text-lg flex items-center gap-4">
                                  <div className="w-12 h-12 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-center shadow-sm"><HardHat className="w-6 h-6 text-slate-400" /></div>
                                  {c.name}
                               </td>
                               <td className="p-6">
                                  <span className="font-extrabold text-xs uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">{c.hostMonitor}</span>
                               </td>
                               <td className="p-6 text-right pr-8">
                                  <button className={`px-5 py-3 rounded-xl text-xs font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 ml-auto transition-all shadow-sm active:scale-95 ${c.status === 'Active' ? 'bg-white border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300' : 'bg-slate-100 border border-slate-200 text-slate-400'}`}>
                                     <Ban className="w-4 h-4" /> Inject Lockout
                                  </button>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

       </div>

        {/* ADD/EDIT MODAL */}
        {showModal && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
             <h2 className="text-3xl font-extrabold text-slate-900 mb-6 tracking-tight">
               {editingItem ? 'Edit' : 'Add'} {activeTab === 'tenants' ? 'Monitor' : 'Element'}
             </h2>
             <form onSubmit={handleSubmit} className="space-y-4">
               
               {activeTab === 'tenants' && (
                 <>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Name</label>
                     <input type="text" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.full_name || ''} onChange={e => setFormData({...formData, full_name: e.target.value})} placeholder="John Doe" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Active Email</label>
                     <input type="email" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@example.com" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Mobile Number (WhatsApp)</label>
                     <input type="text" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.mobile_number || ''} onChange={e => setFormData({...formData, mobile_number: e.target.value})} placeholder="01700000000" />
                   </div>
                   {!editingItem && (
                     <div>
                       <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Password</label>
                       <input type="password" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.password || ''} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="••••••••" />
                     </div>
                   )}
                 </>
               )}
 
               {activeTab === 'elements' && (
                 <>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Element Title</label>
                     <input type="text" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.element_name || ''} onChange={e => setFormData({...formData, element_name: e.target.value})} placeholder="Slab" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Curing Period (Days)</label>
                     <input type="text" required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.required_curing_days || ''} onChange={e => setFormData({...formData, required_curing_days: e.target.value})} placeholder="28" />
                   </div>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Description</label>
                     <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" rows={3} value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Description here..."></textarea>
                   </div>
                   <div>
                     <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1 pl-1">Type</label>
                     <select required className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-blue-600 transition-colors" value={formData.geometry_type || 'line'} onChange={e => setFormData({...formData, geometry_type: e.target.value})}>
                       <option value="line">Line</option>
                       <option value="area">Area</option>
                       <option value="point">Point</option>
                     </select>
                   </div>
                 </>
               )}

              <div className="pt-6 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-4 rounded-2xl font-extrabold text-slate-500 hover:bg-slate-100 transition-all active:scale-95">Cancel</button>
                <button type="submit" className="flex-1 px-6 py-4 rounded-2xl bg-slate-900 text-white font-extrabold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95">
                  {editingItem ? 'Save Changes' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
