import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderPlus, Building2, PackageOpen, FolderGit2, 
  ChevronRight, Plus, UserPlus, HardHat, MoreVertical, Map, ChevronDown, Loader2, Trash2
} from 'lucide-react';
import { hierarchyService, userService } from '../services/api';

export default function ProjectSetup() {
  const [activeProject, setActiveProject] = useState<number>(0);
  const [activePackage, setActivePackage] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);

  const tenant_id = 1; // Demo purposes

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projData, conData] = await Promise.all([
        hierarchyService.getProjects(tenant_id),
        userService.getUsers(tenant_id, 'contractor')
      ]);
      setProjects(projData);
      setContractors(conData);
      if (projData.length > 0) setActiveProject(projData[0].id);
    } catch (error) {
      console.error("Failed to load setup data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeProject) {
      const fetchPackages = async () => {
        const pkgData = await hierarchyService.getPackages(activeProject);
        setPackages(pkgData);
        if (pkgData.length > 0) setActivePackage(pkgData[0].id);
        else setActivePackage(0);
      };
      fetchPackages();
    }
  }, [activeProject]);

  useEffect(() => {
    if (activePackage) {
      const fetchStructures = async () => {
        const strData = await hierarchyService.getStructures(activePackage);
        setStructures(strData);
      };
      fetchStructures();
    } else {
      setStructures([]);
    }
  }, [activePackage]);

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-6 flex items-center justify-between shrink-0">
         <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Hierarchy Configuration</h1>
            <p className="text-sm md:text-base text-slate-500 font-medium tracking-wide">Monitor Dashboard: Define architectural scope and deploy contractors.</p>
         </div>
      </div>

      {/* THREE COLUMN ARCHITECTURE (Finder Style) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 md:gap-6 overflow-y-auto lg:overflow-hidden pb-10 lg:pb-0">
         
         {/* COLUMN 1: PROJECTS */}
         <div className="flex flex-col flex-1 min-h-[300px] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <FolderGit2 className="text-blue-600 w-6 h-6" />
                  <h2 className="font-extrabold text-slate-900 text-lg">Projects</h2>
               </div>
               <button className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 no-scrollbar">
               {projects.map(p => (
                 <div key={p.id} onClick={() => setActiveProject(p.id)} 
                      className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center justify-between ${activeProject === p.id ? 'border-blue-500 bg-blue-50 shadow-md ring-4 ring-blue-500/10' : 'border-slate-200/50 hover:border-slate-300 bg-white shadow-sm'}`}>
                    <div>
                       <h3 className={`font-extrabold ${activeProject === p.id ? 'text-blue-900' : 'text-slate-800'}`}>{p.name}</h3>
                       <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full mt-2 inline-block shadow-sm border bg-green-100 text-green-800 border-green-200">Active</span>
                    </div>
                    <ChevronRight className={`w-5 h-5 ${activeProject === p.id ? 'text-blue-500' : 'text-slate-300'}`} />
                 </div>
               ))}
            </div>
         </div>

         {/* COLUMN 2: PACKAGES */}
         <div className="flex flex-col flex-1 min-h-[300px] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <PackageOpen className="text-amber-500 w-6 h-6" />
                  <h2 className="font-extrabold text-slate-900 text-lg">Packages</h2>
               </div>
               <button className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 no-scrollbar">
               {packages.map(pkg => (
                 <div key={pkg.id} onClick={() => setActivePackage(pkg.id)} 
                      className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center justify-between ${activePackage === pkg.id ? 'border-amber-500 bg-amber-50 shadow-md ring-4 ring-amber-500/10' : 'border-slate-200/50 hover:border-slate-300 bg-white shadow-sm'}`}>
                    <h3 className={`font-extrabold ${activePackage === pkg.id ? 'text-amber-900' : 'text-slate-800'}`}>{pkg.name}</h3>
                    <ChevronRight className={`w-5 h-5 ${activePackage === pkg.id ? 'text-amber-500' : 'text-slate-300'}`} />
                 </div>
               ))}
               {activeProject === 0 && (
                  <div className="p-10 text-center flex flex-col items-center">
                     <PackageOpen className="w-12 h-12 text-slate-300 mb-3" />
                     <p className="text-slate-500 font-bold">Select a project to govern packages.</p>
                  </div>
               )}
            </div>
         </div>

         {/* COLUMN 3: STRUCTURES */}
         <div className="flex flex-col flex-1 min-h-[350px] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <Building2 className="text-purple-600 w-6 h-6" />
                  <h2 className="font-extrabold text-slate-900 text-lg">Structures</h2>
               </div>
               <button className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 no-scrollbar">
               {activePackage !== 0 ? (
                 structures.length > 0 ? structures.map(s => {
                    const assignedCon = contractors.find(c => c.id === s.contractor_id);
                    return (
                      <div key={s.id} className="p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-purple-300 transition-all shadow-sm group">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-extrabold text-slate-900 text-lg xl:text-xl leading-tight">{s.name}</h3>
                            <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="w-5 h-5" /></button>
                        </div>

                        {/* Action Portal Buttons */}
                        <div className="flex gap-2 mb-5">
                            <button onClick={() => navigate('/plans')} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-bold hover:bg-blue-100 hover:border-blue-300 transition-all text-[11px] lg:text-xs shadow-sm active:scale-95">
                              <Map className="w-3.5 h-3.5 flex-shrink-0" /> Open Canvas
                            </button>
                            <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 font-bold hover:bg-indigo-100 hover:border-indigo-300 transition-all text-[11px] lg:text-xs shadow-sm active:scale-95">
                              <Plus className="w-3.5 h-3.5 flex-shrink-0" /> Upload PDF
                            </button>
                        </div>

                        {/* Contractor Assignment Zone */}
                        <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200">
                            <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                              Assigned Contractor
                              {assignedCon && <span className="bg-green-200/80 text-green-900 px-2.5 py-0.5 rounded-full text-[9px] shadow-[0_1px_2px_rgba(0,0,0,0.1)]">Operating</span>}
                            </div>
                            
                            {assignedCon ? (
                              <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center shadow-md"><HardHat className="w-5 h-5 text-amber-500" /></div>
                                    <span className="font-extrabold text-slate-900 text-sm xl:text-base">{assignedCon.username}</span>
                                  </div>
                                  <button className="text-[11px] font-extrabold text-red-500 hover:text-red-700 uppercase tracking-wider bg-red-50 px-2 py-1 rounded-md transition-colors hover:bg-red-100 border border-red-100">Revoke</button>
                              </div>
                            ) : (
                              <div className="relative">
                                <select 
                                  className="appearance-none w-full bg-white border-2 border-dashed border-slate-300 rounded-xl py-3 pl-10 pr-10 hover:border-purple-400 focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all text-slate-600 font-extrabold text-[11px] lg:text-xs tracking-wide cursor-pointer shadow-sm"
                                  onChange={(e) => alert(`Assigned structure ${s.id} to contractor ${e.target.value}`)}
                                  defaultValue=""
                                >
                                  <option value="" disabled>DEPLOY CONTRACTOR...</option>
                                  {contractors.map(c => (
                                    <option key={c.id} value={c.id}>{c.username}</option>
                                  ))}
                                </select>
                                <UserPlus className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            )}
                        </div>
                      </div>
                    );
                 }) : (
                   <div className="p-10 text-center flex flex-col items-center">
                     <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                     <p className="text-slate-500 font-bold">No structures in this package yet.</p>
                   </div>
                 )
               ) : (
                 <div className="p-10 text-center flex flex-col items-center">
                     <Building2 className="w-12 h-12 text-slate-300 mb-3" />
                     <p className="text-slate-500 font-bold">Select a package to view structural targets.</p>
                  </div>
               )}
            </div>
         </div>

      </div>
    </div>
  );
}
