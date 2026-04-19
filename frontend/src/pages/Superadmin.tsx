import React, { useState } from 'react';
import { ShieldAlert, Server, HardHat, Ban, Box, DatabaseZap, Power, Activity, Settings2 } from 'lucide-react';

export default function Superadmin() {
  const [activeTab, setActiveTab] = useState('tenants');
  
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans p-4 md:p-8 flex flex-col">
       
       {/* Top Control Header */}
       <div className="max-w-[1400px] mx-auto w-full mb-8 lg:mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-amber-600 rounded-2xl flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.3)]">
                <ShieldAlert className="w-8 h-8 text-white" />
             </div>
             <div>
                <h1 className="text-3xl font-extrabold text-white tracking-widest uppercase">Syslord Core</h1>
                <p className="text-amber-500/80 font-bold tracking-widest text-xs uppercase mt-1">Superadmin Global Override Matrix</p>
             </div>
          </div>
          <div className="flex bg-slate-900 rounded-xl p-1.5 border border-slate-800 shadow-xl">
             <button onClick={() => setActiveTab('tenants')} className={`px-6 py-3 rounded-lg font-bold text-sm tracking-widest uppercase transition-all ${activeTab === 'tenants' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Monitors</button>
             <button onClick={() => setActiveTab('elements')} className={`px-6 py-3 rounded-lg font-bold text-sm tracking-widest uppercase transition-all ${activeTab === 'elements' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>Physics Logic</button>
             <button onClick={() => setActiveTab('contractors')} className={`px-6 py-3 rounded-lg font-bold text-sm tracking-widest uppercase transition-all ${activeTab === 'contractors' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>IAM Override</button>
          </div>
       </div>

       {/* Active Tab Matrix */}
       <div className="flex-1 max-w-[1400px] w-full mx-auto">
          
          {/* TAB 1: MONITORS / TENANTS */}
          {activeTab === 'tenants' && (
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-bold text-white flex items-center gap-3"><Server className="w-5 h-5 text-blue-500" /> Active Master Tenants</h2>
                   <button className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-extrabold transition-all active:scale-95 text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(37,99,235,0.3)]">Deploy New Tenant</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                   {monitors.map(m => (
                      <div key={m.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
                         <div className={`absolute top-0 left-0 w-full h-1 ${m.status === 'Online' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                         <div className="flex justify-between items-start mb-6">
                            <div>
                               <h3 className="text-lg font-extrabold text-white">{m.name}</h3>
                               <p className="font-mono text-xs text-slate-500 mt-1">ROOT: {m.rootAdmin}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${m.status === 'Online' ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-red-900/30 text-red-500 border-red-800/50'}`}>
                               {m.status}
                            </span>
                         </div>
                         <div className="flex items-center gap-6 mb-8">
                            <div className="flex items-center gap-2 text-slate-400">
                               <DatabaseZap className="w-4 h-4" /> <span className="font-bold text-sm">{m.projects} Projects</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                               <HardHat className="w-4 h-4" /> <span className="font-bold text-sm">{m.contractors} Contractors</span>
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-3 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <button className="py-2.5 rounded-xl bg-slate-800 font-bold text-slate-300 text-xs uppercase tracking-widest hover:bg-slate-700 transition-colors">Reset Auth</button>
                            <button className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${m.status === 'Online' ? 'bg-red-950/40 text-red-500 hover:bg-red-900' : 'bg-green-950/40 text-green-500 hover:bg-green-900'}`}>
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
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-bold text-white flex items-center gap-3"><Settings2 className="w-5 h-5 text-amber-500" /> Global Curing Physics Engine</h2>
                   <button className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl font-extrabold transition-all active:scale-95 text-sm uppercase tracking-widest shadow-[0_0_20px_rgba(217,119,6,0.3)]">Inject New Type</button>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-slate-800 bg-slate-900/50">
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest">Base Element Class</th>
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest">Lock Duration Math</th>
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest">Canvas UI Overlay Color</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                         {elements.map(el => (
                            <tr key={el.id} className="hover:bg-slate-800/50 transition-colors">
                               <td className="p-6 font-extrabold text-white text-lg flex items-center gap-3"><Box className="w-5 h-5 text-slate-600" /> {el.name}</td>
                               <td className="p-6">
                                  <span className="font-mono text-amber-500 font-bold bg-amber-500/10 px-4 py-2 rounded-lg border border-amber-500/20">{el.duration} Days Required</span>
                               </td>
                               <td className="p-6">
                                  <span className="font-bold text-xs uppercase tracking-widest text-slate-400 bg-slate-800 px-3 py-1.5 rounded-full inline-block border border-slate-700">{el.color}</span>
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
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-bold text-white flex items-center gap-3"><ShieldBan className="w-5 h-5 text-red-500" /> Contractor Cross-Tenant Directory</h2>
                </div>
                <p className="text-sm text-slate-500 font-medium">Bypass tenant siloing to execute emergency global lockouts on specific operational accounts.</p>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden mt-4">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-slate-800 bg-slate-900/50">
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest">Contractor Account</th>
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest">Host Tenant</th>
                            <th className="p-6 text-xs font-extrabold text-slate-500 uppercase tracking-widest text-right">Syslord Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                         {globalContractors.map(c => (
                            <tr key={c.id} className="hover:bg-slate-800/50 transition-colors group">
                               <td className="p-6 font-extrabold text-white text-md flex items-center gap-3"><HardHat className="w-5 h-5 text-slate-500" /> {c.name}</td>
                               <td className="p-6">
                                  <span className="font-extrabold text-xs uppercase tracking-widest text-blue-400">{c.hostMonitor}</span>
                               </td>
                               <td className="p-6 text-right">
                                  <button className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 ml-auto transition-colors ${c.status === 'Active' ? 'bg-red-950/40 text-red-500 hover:bg-red-900 border border-red-900/50' : 'bg-slate-800 text-slate-500'}`}>
                                     <Ban className="w-3.5 h-3.5" /> Emergency Lockout
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
