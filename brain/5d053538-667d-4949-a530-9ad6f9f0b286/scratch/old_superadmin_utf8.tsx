import React, { useState } from 'react';
import { 
  ShieldAlert, Server, HardHat, Ban, Box, DatabaseZap, 
  Power, Settings2, ShieldBan, Users, Plus, LogOut, ChevronRight, Menu, X
} from 'lucide-react';

export default function Superadmin() {
  const [activeTab, setActiveTab] = useState('tenants');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [monitors, setMonitors] = useState([
    { id: 1, name: 'Bureau of Engineering', rootAdmin: 'sys_boe_01', projects: 4, contractors: 12, status: 'Online' },
    { id: 2, name: 'Riyadh Infrastructure Auth', rootAdmin: 'ria_admin', projects: 1, contractors: 3, status: 'Online' },
    { id: 3, name: 'National Paving Co', rootAdmin: 'npc_director', projects: 0, contractors: 0, status: 'Suspended' }
  ]);

  const [elements, setElements] = useState([
    { id: 1, name: 'Structural Slab', duration: 7, color: 'Amber' },
    { id: 2, name: 'Core Wall', duration: 14, color: 'Blue' },
    { id: 3, name: 'Support Column', duration: 3, color: 'Purple' }
  ]);

  const [globalContractors, setGlobalContractors] = useState([
    { id: 1, name: 'Oli Contractors LLC', hostMonitor: 'Bureau of Engineering', status: 'Active' },
    { id: 2, name: 'Alpha Structural Builders', hostMonitor: 'Riyadh Infrastructure Auth', status: 'Active' }
  ]);

  const sidebarMenus = [
    { id: 'tenants', label: 'Monitor Tenants', icon: Server, description: 'Manage office silos' },
    { id: 'elements', label: 'Physics Engine', icon: Settings2, description: 'Curing durations & constraints' },
    { id: 'contractors', label: 'IAM Global Override', icon: ShieldBan, description: 'Cross-tenant account locking' },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
       
       {/* MOBILE HEADER (Visible only on small screens) */}
       <div className="md:hidden absolute top-0 left-0 w-full bg-white border-b border-slate-200 p-4 flex items-center justify-between z-20 shadow-sm">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center border border-red-200">
                <ShieldAlert className="w-5 h-5 text-red-600" />
             </div>
             <h1 className="font-extrabold text-slate-900 text-lg tracking-tight">System Root</h1>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-700 active:scale-95 transition-transform shadow-sm"><Menu className="w-5 h-5" /></button>
       </div>

       {/* MOBILE OVERLAY BACKDROP */}
       {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
       )}

       {/* SCALABLE LEFT SIDEBAR */}
       <div className={`fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 flex flex-col shadow-[20px_0_40px_rgba(0,0,0,0.1)] z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0 border border-red-200 shadow-sm">
                   <ShieldAlert className="w-6 h-6 text-red-600" />
                </div>
                <div>
                   <h1 className="font-extrabold text-slate-900 tracking-tight leading-none text-lg">System Root</h1>
                   <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest mt-1">Superadmin Portal</p>
                </div>
             </div>
             <button className="md:hidden p-2 text-slate-400 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100" onClick={() => setIsMobileMenuOpen(false)}><X className="w-5 h-5"/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
             <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest pl-2 mb-3 mt-2">Core Utilities</p>
             {sidebarMenus.map(menu => (
                <button 
                  key={menu.id} 
                  onClick={() => { setActiveTab(menu.id); setIsMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${activeTab === menu.id ? 'bg-red-50 text-red-700 border border-red-200/50 shadow-[0_2px_10px_rgba(220,38,38,0.05)]' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                   <menu.icon className={`w-5 h-5 flex-shrink-0 ${activeTab === menu.id ? 'text-red-600' : 'text-slate-400'}`} />
                   <div>
                      <span className="block font-bold text-sm">{menu.label}</span>
                   </div>
                   {activeTab === menu.id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
                </button>
             ))}
          </div>

          <div className="p-4 border-t border-slate-100">
             <button className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-red-600 transition-colors font-bold text-sm group">
                <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> Sign Out
             </button>
          </div>
       </div>

       {/* MAIN CONTENT AREA */}
       <div className="flex-1 overflow-y-auto bg-slate-50 relative pt-20 md:pt-0">
          
          {/* TAB 1: MONITORS / TENANTS */}
          {activeTab === 'tenants' && (
             <div className="p-6 md:p-10 max-w-[1200px] animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-8 flex items-center justify-between">
                   <div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                         <Server className="w-8 h-8 text-blue-600" /> Active Master Tenants
                      </h2>
                      <p className="text-slate-500 font-medium mt-2">Siloed Monitor entities controlling independent projects and packages.</p>
                   </div>
                   <button className="bg-slate-900 border border-slate-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-slate-900/20 hover:bg-slate-800"><Plus className="w-4 h-4" /> Deploy Tenant</button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                   {monitors.map(m => (
                      <div key={m.id} className="bg-white border-2 border-slate-200 p-6 rounded-3xl relative overflow-hidden group hover:border-slate-300 transition-colors shadow-sm">
                         <div className={`absolute top-0 left-0 w-full h-1.5 ${m.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                         <div className="flex justify-between items-start mb-6 mt-1">
                            <div>
                               <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{m.name}</h3>
                               <p className="font-mono text-[11px] font-bold text-slate-400 mt-1.5 bg-slate-100 inline-block px-2 py-0.5 rounded border border-slate-200">ROOT: {m.rootAdmin}</p>
                            </div>
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-widest border shadow-sm ${m.status === 'Online' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                               {m.status}
                            </span>
                         </div>
                         
                         <div className="flex items-center gap-6 mb-8 px-2 py-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 text-slate-600">
                               <DatabaseZap className="w-4 h-4 text-blue-500" /> <span className="font-extrabold text-sm">{m.projects}</span> <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Projects</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                               <HardHat className="w-4 h-4 text-amber-500" /> <span className="font-extrabold text-sm">{m.contractors}</span> <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Contractors</span>
                            </div>
                         </div>

                         <div className="grid grid-cols-2 gap-3 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <button className="py-2.5 rounded-xl bg-white border-2 border-slate-200 font-bold text-slate-600 text-xs uppercase tracking-widest hover:bg-slate-50 shadow-sm active:scale-95 transition-all">Reset Auth</button>
                            <button className={`py-2.5 rounded-xl border-2 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all ${m.status === 'Online' ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'}`}>
                               <Power className="w-3.5 h-3.5" /> {m.status === 'Online' ? 'Suspend' : 'Reactivate'}
                            </button>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          )}

          {/* TAB 2: PHYSICS LOGIC */}
          {activeTab === 'elements' && (
             <div className="p-6 md:p-10 max-w-[1200px] animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-8 flex items-center justify-between">
                   <div>
                      <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
                         <Settings2 className="w-8 h-8 text-amber-500" /> Global Curing Matrix
                      </h2>
                      <p className="text-slate-500 font-medium mt-2">Force systemic mathematical constraints on element curing durations.</p>
                   </div>
                   <button className="bg-amber-100 border border-amber-200 text-amber-700 px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm hover:bg-amber-200"><Plus className="w-4 h-4" /> Inject Type</button>
                </div>
                
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-slate-200 bg-slate-50/50">
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest pl-8">Base Element Class</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Temporal Lock Math</th>
                            <th className="p-6 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest pl-2">Canvas Visual Layer</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {elements.map(el => (
                            <tr key={el.id} className="hover:bg-slate-50/50 transition-colors group">
                               <td className="p-6 pl-8">
                                 <div className="flex items-center gap-4">
                                   <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors"><Box className="w-5 h-5" /></div>
                                   <span className="font-extrabold text-slate-900 text-lg">{el.name}</span>
                                 </div>
                               </td>
                               <td className="p-6">
                                  <span className="font-mono text-amber-700 font-bold bg-amber-50 px-4 py-2 rounded-xl border border-amber-200 shadow-sm inline-block">{el.duration} Days Required</span>
                               </td>
                               <td className="p-6">
                                  <span className="font-extrabold text-xs uppercase tracking-widest text-slate-600 bg-white shadow-sm px-4 py-2 rounded-full inline-block border-2 border-slate-200 flex items-center gap-2 max-w-fit">
                                    <span className={`w-2.5 h-2.5 rounded-full ${el.color === 'Amber' ? 'bg-amber-500' : el.color === 'Blue' ? 'bg-blue-500' : 'bg-purple-500'}`}></span>
                                    {el.color}
                                  </span>
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
    </div>
  );
}
