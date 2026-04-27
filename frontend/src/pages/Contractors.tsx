import React, { useState, useEffect } from 'react';
import { Users, Plus, KeyRound, Ban, CheckCircle2, Building2, Loader2, Phone } from 'lucide-react';
import { userService } from '../services/api';

export default function Contractors() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contractors, setContractors] = useState<any[]>([]);
  
  // Form State
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    mobile_number: '',
    tenant_id: 1 // Default tenant for demo purposes
  });

  const fetchContractors = async () => {
    try {
      setLoading(true);
      const data = await userService.getUsers(1, 'contractor');
      setContractors(data);
    } catch (error) {
      console.error("Failed to fetch contractors", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContractors();
  }, []);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await userService.create_user({
        ...formData,
        role: 'contractor'
      });
      setShowAddForm(false);
      setFormData({ username: '', password: '', mobile_number: '', tenant_id: 1 });
      fetchContractors();
    } catch (error: any) {
      alert(`Failed to enroll contractor: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && contractors.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

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
         <form onSubmit={handleEnroll} className="mb-8 bg-white border-2 border-blue-100 rounded-[2rem] p-6 lg:p-8 shadow-xl shadow-blue-900/5 animate-in fade-in slide-in-from-top-4 duration-300">
            <h2 className="text-xl font-extrabold text-slate-900 mb-6">Create New Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Login Username</label>
                  <input 
                    required
                    type="text" 
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    placeholder="e.g. oli_contractor" 
                    className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                  />
               </div>
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Mobile (11 Digits)</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      required
                      type="text" 
                      maxLength={11}
                      value={formData.mobile_number}
                      onChange={e => setFormData({...formData, mobile_number: e.target.value})}
                      placeholder="01712345678" 
                      className="w-full border-2 border-slate-200 rounded-xl p-3.5 pl-11 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                    />
                  </div>
               </div>
               <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Initial Password</label>
                  <input 
                    required
                    type="password" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Set secure password..." 
                    className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
                  />
               </div>
               <div className="flex items-end">
                  <button 
                    disabled={submitting}
                    type="submit" 
                    className="w-full px-8 py-3.5 rounded-xl bg-blue-600 text-white font-extrabold shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Provision Account'}
                  </button>
               </div>
            </div>
         </form>
      )}

      {/* Directory List Container */}
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
               <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest pl-6 md:pl-8">Contractor Profile</th>
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Mobile Number</th>
                     <th className="p-4 md:p-5 text-[11px] font-extrabold text-slate-400 uppercase tracking-widest text-right pr-6 md:pr-8">Mgmt Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {contractors.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-slate-400 italic font-medium">No contractors enrolled for this tenant yet.</td>
                    </tr>
                  ) : contractors.map(c => (
                     <tr key={c.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 md:p-6 pl-6 md:pl-8">
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border transition-colors bg-blue-50 border-blue-100">
                                 <Building2 className="w-5 h-5 text-blue-600" />
                              </div>
                              <span className="font-extrabold text-base md:text-lg text-slate-900 group-hover:text-blue-700 transition-colors">{c.username}</span>
                           </div>
                        </td>
                        <td className="p-4 md:p-6">
                           <span className="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 inline-block">{c.mobile_number}</span>
                        </td>
                        <td className="p-4 md:p-6 pr-6 md:pr-8 text-right">
                           <div className="flex items-center justify-end gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                              <button className="flex items-center gap-1.5 px-3 py-2.5 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-colors shadow-sm active:scale-95">
                                 <KeyRound className="w-3.5 h-3.5 text-blue-500" /> Reset Password
                              </button>
                              <button className="flex items-center gap-1.5 px-3 py-2.5 bg-white border-2 border-slate-200 text-xs font-bold rounded-xl transition-colors shadow-sm active:scale-95 hover:border-red-300 hover:bg-red-50 text-red-600">
                                 <Ban className="w-3.5 h-3.5" /> Deactivate
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
