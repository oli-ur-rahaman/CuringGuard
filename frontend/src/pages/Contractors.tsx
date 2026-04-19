import React, { useState } from 'react';
import { Users, Plus, KeyRound, Ban, CheckCircle2, Building2 } from 'lucide-react';

export default function Contractors() {
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [contractors, setContractors] = useState([
    { id: 1, name: 'Oli Contractors LLC', loginId: 'oli_con_01', status: 'Active' },
    { id: 2, name: 'Alpha Structural Builders', loginId: 'alpha_bldr', status: 'Inactive' },
    { id: 3, name: 'Desert Foundation Group', loginId: 'dfg_concrete', status: 'Active' }
  ]);

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto h-[calc(100vh-4rem)] flex flex-col overflow-y-auto">
      
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
         <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
               <Users className="w-8 h-8 text-blue-600" /> Contractor Management
            </h1>
            <p className="text-sm md:text-base text-slate-500 font-medium tracking-wide mt-1">
               Monitor Control: Provision contractor accounts and manage access permissions.
            </p>
         </div>
         <button onClick={() => setShowAddForm(!showAddForm)} className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-md active:scale-95">
            <Plus className="w-5 h-5" /> Enroll Contractor
         </button>
      </div>

      {/* Embedded Creation Form */}
      {showAddForm && (
         <div className="mb-8 bg-white border-2 border-blue-100 rounded-[2rem] p-6 lg:p-8 shadow-xl shadow-blue-900/5 animate-in fade-in slide-in-from-top-4 duration-300">
            <h2 className="text-xl font-extrabold text-slate-900 mb-6">Create New Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Contractor Company Name</label>
                  <input type="text" placeholder="e.g. Acme Builders" className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" />
               </div>
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Login ID</label>
                  <input type="text" placeholder="acme_login" className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" />
               </div>
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">System Password</label>
                  <input type="text" placeholder="Set secure password..." className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" />
               </div>
            </div>
            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-slate-100">
               <button onClick={() => setShowAddForm(false)} className="px-6 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-100 border-2 border-transparent transition-colors">Cancel</button>
               <button onClick={() => setShowAddForm(false)} className="px-8 py-3 rounded-xl bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all">Provision Contractor</button>
            </div>
         </div>
      )}

      {/* Directory List Container */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
               <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest pl-6 md:pl-8">Contractor Profile</th>
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Login ID</th>
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Status</th>
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest text-right pr-6 md:pr-8">Mgmt Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {contractors.map(c => (
                     <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 md:p-6 pl-6 md:pl-8">
                           <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border transition-colors ${c.status === 'Active' ? 'bg-blue-50 border-blue-100' : 'bg-slate-100 border-slate-200'}`}>
                                 <Building2 className={`w-5 h-5 ${c.status === 'Active' ? 'text-blue-600' : 'text-slate-400'}`} />
                              </div>
                              <span className={`font-extrabold text-base md:text-lg transition-colors ${c.status === 'Active' ? 'text-slate-900 group-hover:text-blue-700' : 'text-slate-400'}`}>{c.name}</span>
                           </div>
                        </td>
                        <td className="p-4 md:p-6">
                           <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{c.loginId}</span>
                        </td>
                        <td className="p-4 md:p-6">
                           <span className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${c.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                              {c.status === 'Active' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                              {c.status}
                           </span>
                        </td>
                        <td className="p-4 md:p-6 pr-6 md:pr-8 text-right">
                           <div className="flex items-center justify-end gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                              <button className="flex items-center gap-1.5 px-3 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors shadow-sm active:scale-95">
                                 <KeyRound className="w-3.5 h-3.5 text-blue-500" /> Reset Password
                              </button>
                              <button className={`flex items-center gap-1.5 px-3 py-2.5 bg-white border-2 border-slate-200 text-xs font-bold rounded-xl transition-colors shadow-sm active:scale-95 ${c.status === 'Active' ? 'hover:border-red-300 hover:bg-red-50 text-red-600' : 'hover:border-green-300 hover:bg-green-50 text-green-600'}`}>
                                 {c.status === 'Active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                 {c.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}
