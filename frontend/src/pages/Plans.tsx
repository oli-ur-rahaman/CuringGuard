import React, { useState, useEffect, useRef } from 'react';
import { 
  MousePointer2, Square, Slash, MapPin, Type, Hand,
  ZoomIn, ZoomOut, Layers, LayoutGrid, CheckSquare, 
  ChevronRight, ChevronLeft, Plus, Image as ImageIcon,
  FolderOpen, FileText, ChevronDown, X, Loader2, Send,
  Ruler
} from 'lucide-react';
import { curingService, userService } from '../services/api';

export default function Plans() {
  const [activeTool, setActiveTool] = useState('select');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Pan and Zoom physics logic
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [elements, setElements] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<number>(0);

  // Calibration State
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationPoints, setCalibrationPoints] = useState<{x: number, y: number}[]>([]);
  const [metersPerUnit, setMetersPerUnit] = useState(1);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [elData, conData] = await Promise.all([
        curingService.getElements(),
        userService.getUsers(1, 'contractor')
      ]);
      
      setElements(elData.map((el: any) => ({
        ...el,
        id: el.element_id,
        type: el.element_type,
        status: el.poured_date ? 'Curing' : 'Unassigned',
        selected: false,
        vertices: el.coordinates_json ? JSON.parse(el.coordinates_json) : []
      })));
      setContractors(conData);
    } catch (error) {
      console.error("Failed to load plans data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'pan', icon: Hand, label: 'Pan' },
    { id: 'calibrate', icon: Ruler, label: 'Calibrate Scale' },
    { id: 'rect', icon: Square, label: 'Surface' },
    { id: 'line', icon: Slash, label: 'Line' },
    { id: 'point', icon: MapPin, label: 'Point' },
  ];
  
  const toggleElement = (id: string) => {
    setElements(prev => prev.map(el => {
      if (el.id === id) {
        if (el.status === 'Curing') return el;
        const selectedElements = prev.filter(e => e.selected);
        const selectedType = selectedElements.length > 0 ? selectedElements[0].type : null;
        if (selectedType && selectedType !== el.type && !el.selected) return el;
        return { ...el, selected: !el.selected };
      }
      return el;
    }));
  };

  const handleGroupSave = async () => {
    if (!selectedContractor) {
      alert("Please select a contractor to assign.");
      return;
    }
    const selectedElements = elements.filter(e => e.selected);
    try {
      setLoading(true);
      for (const el of selectedElements) {
        await curingService.logCuring(el.id, selectedContractor);
      }
      setShowGroupModal(false);
      fetchData();
    } catch (error) {
      alert("Failed to initialize curing engine for selection.");
    } finally {
      setLoading(false);
    }
  };

  const executeZoom = (targetScale: number, pointerX: number, pointerY: number) => {
    const newScale = Math.max(0.05, Math.min(targetScale, 10));
    const mouseX = (pointerX - position.x) / scale;
    const mouseY = (pointerY - position.y) / scale;
    const newX = pointerX - (mouseX * newScale);
    const newY = pointerY - (mouseY * newScale);
    setScale(newScale);
    setPosition({ x: newX, y: newY });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = e.currentTarget.getBoundingClientRect();
    executeZoom(scale * zoomFactor, e.clientX - rect.left, e.clientY - rect.top);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - position.x) / scale;
    const y = (e.clientY - rect.top - position.y) / scale;

    if (activeTool === 'calibrate') {
      if (calibrationPoints.length < 2) {
        setCalibrationPoints(prev => [...prev, {x, y}]);
        if (calibrationPoints.length === 1) {
          const m = prompt("Enter the real-world distance in METERS for this line:");
          if (m) {
            const p1 = calibrationPoints[0];
            const p2 = {x, y};
            const dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
            setMetersPerUnit(parseFloat(m) / dist);
            alert(`Scale calibrated: 1 unit = ${(parseFloat(m) / dist).toFixed(4)} meters.`);
          }
          setCalibrationPoints([]);
          setActiveTool('select');
        }
      }
      return;
    }

    if (e.pointerType === 'mouse') {
      if (e.button === 1 || activeTool === 'pan') {
        setIsPanning(true);
        setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning && e.pointerType === 'mouse') {
      setPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setIsPanning(false);
  };

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('structure_id', '1'); // Assuming Structure ID 1 for this demo
    formData.append('name', file.name);

    try {
      setUploading(true);
      await curingService.uploadDrawing(formData);
      alert("Drawing uploaded and parsed successfully!");
      fetchData(); // Refresh elements
    } catch (error) {
      alert("Failed to upload/parse drawing.");
    } finally {
      setUploading(false);
      setTreeOpen(false);
    }
  };

  return (
    <div 
      className={`absolute inset-0 bg-slate-900 font-sans overflow-hidden ${isPanning || activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
    >
      {/* CANVAS CONTENT */}
      <div 
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
      >
          {/* Grid Background */}
          <div className="absolute w-[20000px] h-[20000px] -left-[10000px] -top-[10000px] opacity-20" 
               style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
          </div>

          {/* SVG Vector Layer */}
          <svg width="2000" height="2000" viewBox="0 0 1000 1000" className="absolute overflow-visible pointer-events-none">
            {elements.map((el) => (
              <g key={el.id} className="pointer-events-auto cursor-pointer" onClick={() => toggleElement(el.id)}>
                <polygon 
                  points={el.vertices.map((v: any) => `${v[0]},${v[1]}`).join(' ')}
                  className={`transition-all duration-300 ${
                    el.status === 'Curing' 
                      ? 'fill-amber-500/30 stroke-amber-500 stroke-[2]' 
                      : el.selected 
                        ? 'fill-blue-600/40 stroke-blue-600 stroke-[3]' 
                        : 'fill-slate-700/10 stroke-slate-500 stroke-[1] hover:fill-slate-700/20'
                  }`}
                />
                {/* Scale-Independent Label */}
                <foreignObject 
                  x={el.vertices[0][0] - 50} 
                  y={el.vertices[0][1] - 10} 
                  width="100" 
                  height="20"
                  className="overflow-visible"
                >
                  <div 
                    style={{ transform: `scale(${1/scale})`, transformOrigin: 'center' }}
                    className={`flex items-center justify-center whitespace-nowrap px-1 rounded-sm text-[8px] font-black uppercase tracking-tighter shadow-sm border ${
                      el.status === 'Curing' ? 'bg-amber-500 text-slate-900 border-amber-600' : 
                      el.selected ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {el.id}
                  </div>
                </foreignObject>
              </g>
            ))}
            
            {/* Calibration Line Preview */}
            {calibrationPoints.length === 1 && (
               <line x1={calibrationPoints[0].x} y1={calibrationPoints[0].y} x2={calibrationPoints[0].x} y2={calibrationPoints[0].y} stroke="red" strokeWidth={2/scale} strokeDasharray="4 4" />
            )}
          </svg>
      </div>

      {/* TOOLBAR */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur-xl shadow-2xl border border-slate-800 rounded-3xl flex flex-col p-2.5 gap-3 pointer-events-auto">
         {tools.map(t => (
            <button key={t.id} onClick={() => setActiveTool(t.id)} title={t.label}
              className={`p-3.5 rounded-2xl transition-all ${activeTool === t.id ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}>
              <t.icon className="w-6 h-6" />
            </button>
         ))}
        </div>
      </div>

      {/* EXPLORER TOGGLE */}
      {/* LEFT EXPLORER DRAWER */}
      <div className={`absolute top-0 left-0 h-full w-[350px] bg-slate-950/95 backdrop-blur-2xl border-r border-slate-800 shadow-[20px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-in-out z-30 flex flex-col ${treeOpen ? 'translate-x-0' : '-translate-x-full'}`}>
         <div className="p-8 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white tracking-tight">Plan Manager</h2>
              <button onClick={() => setTreeOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept=".dwg,.dxf"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full mt-6 py-4 bg-blue-600/10 border-2 border-dashed border-blue-600/30 rounded-2xl flex items-center justify-center gap-3 text-blue-500 font-black text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all active:scale-95">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> ADD NEW PLAN</>}
            </button>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
             <div className="border border-slate-800 rounded-[1.5rem] overflow-hidden bg-slate-900/50">
                <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between font-black text-xs text-slate-400">
                   <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-500" /> ACTIVE DRAWINGS</div>
                </div>
                <div className="p-2 space-y-1">
                   <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 font-black text-xs">
                      <div className="flex items-center gap-3"><FileText className="w-4 h-4" /> hostel_mugda.dxf</div>
                      <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full">ACTIVE</span>
                   </div>
                </div>
             </div>
         </div>
      </div>

      <button onClick={() => setTreeOpen(!treeOpen)} className="absolute top-6 left-6 z-20 p-3 bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2 font-bold text-sm">
        <FolderOpen className="w-5 h-5 text-blue-500" />
        Drawing Explorer
      </button>

      {/* RIGHT PANEL TOGGLE */}
      <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className="absolute top-6 right-6 z-20 p-3 bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2 font-bold text-sm">
        <LayoutGrid className="w-5 h-5 text-amber-500" />
        Selection ({elements.filter(e => e.selected).length})
      </button>

      {/* RIGHT DRAWER */}
      <div className={`absolute top-0 right-0 h-full w-[400px] bg-slate-950/95 backdrop-blur-2xl border-l border-slate-800 shadow-[-20px_0_40px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-in-out z-30 flex flex-col ${rightPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <div className="p-8 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-2xl text-white tracking-tight">Grouping Engine</h3>
              <button onClick={() => setRightPanelOpen(false)} className="text-slate-500 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-2">Cement-Based Element Monitoring</p>
         </div>
         
         <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {elements.filter(e => e.selected || e.status === 'Curing').map(el => (
               <div key={el.id} className={`p-5 rounded-[1.5rem] border-2 transition-all ${el.status === 'Curing' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900 border-blue-500/50 shadow-lg shadow-blue-500/10'}`}>
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="font-black text-lg text-white">{el.id}</p>
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{el.type}</p>
                   </div>
                   {el.status === 'Curing' ? (
                     <span className="px-3 py-1 bg-amber-500 text-slate-950 text-[10px] font-black rounded-full uppercase tracking-widest">Active Curing</span>
                   ) : (
                     <button onClick={() => toggleElement(el.id)} className="text-slate-500 hover:text-red-500 transition-colors"><X className="w-5 h-5" /></button>
                   )}
                 </div>
               </div>
            ))}
            {elements.filter(e => e.selected).length === 0 && elements.filter(e => e.status === 'Curing').length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                <CheckSquare className="w-16 h-16 text-slate-700 mb-4" />
                <p className="text-slate-500 font-bold">No elements selected for grouping.</p>
              </div>
            )}
         </div>

         <div className="p-8 border-t border-slate-800 bg-slate-950">
            <button 
               disabled={elements.filter(e => e.selected).length === 0}
               onClick={() => setShowGroupModal(true)}
               className={`w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all ${elements.filter(e => e.selected).length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-2xl shadow-blue-600/20 active:scale-95' : 'bg-slate-900 text-slate-700 border-2 border-slate-800 cursor-not-allowed'}`}>
              <LayoutGrid className="w-6 h-6" />
              CREATE BATCH GROUP
            </button>
         </div>
      </div>

      {/* MODAL */}
      {showGroupModal && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
            <div className="bg-slate-900 w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden border border-slate-800">
               <div className="p-10 border-b border-slate-800">
                  <h2 className="text-3xl font-black text-white tracking-tight">Initialize Curing</h2>
                  <p className="text-blue-500 text-xs font-black mt-2 uppercase tracking-widest">Assigning {elements.filter(e => e.selected).length} Structural Elements</p>
               </div>
               
               <div className="p-10 space-y-8">
                  <div>
                     <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 ml-1">Select Field Contractor</label>
                     <select 
                       className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl p-5 font-black text-white focus:outline-none focus:border-blue-600 transition-all appearance-none cursor-pointer"
                       value={selectedContractor}
                       onChange={(e) => setSelectedContractor(Number(e.target.value))}
                     >
                        <option value={0}>Choose Contractor...</option>
                        {contractors.map(c => <option key={c.id} value={c.id}>{c.username}</option>)}
                     </select>
                  </div>
                  
                  <button onClick={handleGroupSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl shadow-2xl shadow-blue-600/20 transition-all active:scale-95 text-xl flex items-center justify-center gap-3">
                    {loading ? <Loader2 className="w-7 h-7 animate-spin" /> : <><Send className="w-6 h-6" /> START MONITORING</>}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
