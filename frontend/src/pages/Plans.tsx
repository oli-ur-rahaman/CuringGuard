import React, { useState, useEffect } from 'react';
import { 
  MousePointer2, Square, Slash, MapPin, Type, Hand,
  ZoomIn, ZoomOut, Layers, LayoutGrid, CheckSquare, 
  ChevronRight, ChevronLeft, Plus, Image as ImageIcon,
  FolderOpen, FileText, ChevronDown, X
} from 'lucide-react';

export default function Plans() {
  const [activeTool, setActiveTool] = useState('select');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [showGroupModal, setShowGroupModal] = useState(false);
  
  // Pan and Zoom physics logic
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState(1);
  const [pinchCenter, setPinchCenter] = useState({ x: 0, y: 0 });

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'pan', icon: Hand, label: 'Pan' },
    { id: 'rect', icon: Square, label: 'Surface' },
    { id: 'line', icon: Slash, label: 'Line' },
    { id: 'point', icon: MapPin, label: 'Point' },
    { id: 'text', icon: Type, label: 'Text' },
  ];

  // Make Elements Stateful for Grouping Logic
  const [elements, setElements] = useState([
    { id: 'W-01', type: 'Wall', status: 'Unassigned', selected: false },
    { id: 'W-02', type: 'Wall', status: 'Unassigned', selected: false },
    { id: 'C-5A', type: 'Column', status: 'Unassigned', selected: false },
    { id: 'S-1A', type: 'Slab', status: 'Grouped', selected: false }
  ]);
  
  const mockPages = [ { id: 1, type: 'pdf', label: 'Pg 1' }, { id: 2, type: 'pdf', label: 'Pg 2' }, { id: 3, type: 'blank', label: 'Custom' } ];

  // Grouping Logic Derivations
  const selectedElements = elements.filter(e => e.selected);
  const selectedType = selectedElements.length > 0 ? selectedElements[0].type : null;

  const toggleElement = (id: string) => {
    setElements(prev => prev.map(el => {
      if (el.id === id) {
        if (el.status === 'Grouped') return el;
        if (selectedType && selectedType !== el.type && !el.selected) return el; // Strict Type Constraint!
        return { ...el, selected: !el.selected };
      }
      return el;
    }));
  };

  const handleGroupSave = () => {
    setElements(prev => prev.map(e => e.selected ? {...e, status: 'Grouped', selected: false} : e));
    setShowGroupModal(false);
  };

  const executeZoom = (targetScale: number, pointerX: number, pointerY: number) => {
    const newScale = Math.max(0.1, Math.min(targetScale, 5));
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

  const handleExternalZoom = (factor: number) => {
    executeZoom(scale * factor, window.innerWidth / 2, window.innerHeight / 2);
  };

  const getPinchDistance = (e: React.TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setInitialPinchDistance(getPinchDistance(e));
      setInitialScale(scale);
      setIsPanning(false);
      
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
      const cy = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
      setPinchCenter({ x: cx, y: cy });

    } else if (e.touches.length === 1) {
      setIsPanning(true);
      setStartPan({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      const zoomFactor = getPinchDistance(e) / initialPinchDistance;
      const targetScale = initialScale * zoomFactor;
      
      const newScale = Math.max(0.1, Math.min(targetScale, 5));
      const mouseX = (pinchCenter.x - position.x) / scale;
      const mouseY = (pinchCenter.y - position.y) / scale;
      
      const newX = pinchCenter.x - (mouseX * newScale);
      const newY = pinchCenter.y - (mouseY * newScale);
      
      setScale(newScale);
      setPosition({ x: newX, y: newY });
      
    } else if (e.touches.length === 1 && isPanning) {
      setPosition({ x: e.touches[0].clientX - startPan.x, y: e.touches[0].clientY - startPan.y });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsPanning(false);
    setInitialPinchDistance(null);
  };

  return (
    <div 
      className={`absolute inset-0 bg-[#e5e7eb] font-sans overflow-hidden ${isPanning || activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: "none" }}
    >
      {/* 1. PAN & ZOOM WRAPPER */}
      <div 
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
      >
          <div className="absolute w-[1000vw] h-[1000vh] -left-[500vw] -top-[500vh] opacity-40" 
               style={{ backgroundImage: 'radial-gradient(#94a3b8 2px, transparent 2px)', backgroundSize: '50px 50px' }}>
          </div>

          <div className="absolute top-[10vh] left-[10vw] w-[80vw] h-[80vh] bg-white shadow-2xl border border-slate-300 pointer-events-auto transition-transform duration-300">
             <div className="absolute -top-6 left-0 md:-top-10 text-slate-700 font-mono text-[10px] md:text-lg font-bold tracking-tight bg-white/50 px-2 rounded-t-md">
               {activePage === 3 ? '✏️ Blank Drawing' : `📄 Architectural_Base.pdf - basement1`}
             </div>

             {activePage === 1 && (
               <>
                 <div className="absolute top-[20%] left-[30%] w-[10%] min-w-16 h-[50%] border-[2px] border-blue-500 bg-blue-500/10 flex items-center justify-center text-blue-700 md:text-xl font-bold cursor-pointer">W-01</div>
                 <div className="absolute bottom-[20%] right-[20%] w-[40%] min-w-32 h-[30%] border-[4px] border-amber-500 bg-amber-500/20 flex flex-col items-center justify-center text-amber-900 font-bold shadow-xl cursor-pointer">
                   S-1A
                   <span className="text-[10px] md:text-lg font-bold text-amber-800 bg-amber-200 px-2 md:px-4 py-1 rounded-full mt-1">Grouped</span>
                 </div>
               </>
             )}
          </div>
      </div>

      {/* 2. RESPONSIVE UI OVERLAYS */}

      {/* FLOATING LEFT TOOLBAR */}
      <div className="absolute left-2 md:left-6 top-4 md:top-1/2 md:-translate-y-1/2 flex md:flex-col gap-2 z-10 w-[calc(100%-1rem)] md:w-auto overflow-x-auto no-scrollbar pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl flex md:flex-col p-2 gap-2 flex-shrink-0 pointer-events-auto">
         {tools.map(t => (
            <button key={t.id} onClick={() => setActiveTool(t.id)} title={t.label}
              className={`p-2.5 md:p-3 rounded-xl transition-all ${activeTool === t.id ? 'bg-amber-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
              <t.icon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
         ))}
         <div className="w-px h-auto md:w-full md:h-px bg-slate-200 my-1 mx-1 md:mx-0" />
         
         <button onClick={() => setTreeOpen(true)} className={`p-2.5 md:p-3 text-slate-600 rounded-xl transition-all ${treeOpen ? 'bg-indigo-500 text-white shadow-md' : 'hover:bg-slate-100 bg-indigo-50 text-indigo-600'}`}><FolderOpen className="w-5 h-5 md:w-6 md:h-6" /></button>
         <button onClick={() => handleExternalZoom(1.5)} className="p-2.5 md:p-3 text-slate-600 hover:bg-slate-100 rounded-xl"><ZoomIn className="w-5 h-5 md:w-6 md:h-6" /></button>
         <button onClick={() => handleExternalZoom(0.6)} className="p-2.5 md:p-3 text-slate-600 hover:bg-slate-100 rounded-xl"><ZoomOut className="w-5 h-5 md:w-6 md:h-6" /></button>
        </div>
      </div>

      {/* BOTTOM PAGE SLIDER */}
      <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl p-2 md:p-2.5 flex items-center gap-3 md:gap-5 z-10 h-20 md:h-24 max-w-[95vw] overflow-hidden">
         <div className="flex gap-2 md:gap-3 overflow-x-auto overflow-y-hidden px-1 md:px-2 py-2 items-center no-scrollbar">
           {mockPages.map(page => (
             <button key={page.id} onClick={() => setActivePage(page.id)}
               className={`flex flex-col items-center justify-center min-w-[56px] min-h-[56px] md:min-w-[64px] md:min-h-[64px] rounded-xl border-2 transition-all hover:scale-105 active:scale-95 shadow-sm ${activePage === page.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
               {page.type === 'pdf' ? <ImageIcon className="w-4 h-4 md:w-6 md:h-6 text-slate-500 mb-1" /> : <Square className="w-4 h-4 md:w-6 md:h-6 text-slate-500 mb-1" />}
               <span className="text-[9px] md:text-[10px] font-bold text-slate-700 uppercase tracking-tight">{page.label}</span>
             </button>
           ))}
         </div>
         <div className="w-px h-10 md:h-12 bg-slate-300" />
         <button className="flex flex-col items-center justify-center min-w-20 md:min-w-28 h-14 md:h-16 rounded-xl border-2 border-slate-800 bg-slate-900 shadow-md text-white px-2" onClick={() => setActivePage(3)}>
           <Plus className="w-4 h-4 md:w-6 md:h-6 text-amber-500" />
           <span className="text-[8px] md:text-[10px] font-bold uppercase text-center leading-tight">Blank Dwg</span>
         </button>
      </div>

      {/* LEFT EXPLORER DRAWER */}
      <div className={`absolute top-0 left-0 h-full w-[85vw] max-w-sm bg-white/95 backdrop-blur-md border-r border-slate-300 shadow-[20px_0_40px_rgba(0,0,0,0.15)] transition-transform duration-[400ms] ease-in-out z-30 flex flex-col ${treeOpen ? 'translate-x-0' : '-translate-x-[105%]'}`}>
         <button onClick={() => setTreeOpen(!treeOpen)} className="absolute top-1/2 -right-10 md:-right-12 -translate-y-1/2 bg-slate-900 border border-slate-800 border-l-0 shadow-lg p-2 md:p-3 rounded-r-xl hover:bg-slate-800 text-white" >
            {treeOpen ? <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-amber-500" /> : <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />}
         </button>
         
         <div className="p-4 md:p-6 border-b border-slate-200 bg-slate-50 relative">
            <p className="text-[10px] md:text-xs text-slate-500 font-extrabold uppercase tracking-widest mb-2 flex items-center justify-between">
              Active Structure Target
            </p>
            <div className="relative">
              <select className="appearance-none w-full bg-white border-2 border-slate-200 text-slate-900 font-extrabold text-sm md:text-base rounded-xl py-3 pl-4 pr-10 hover:border-slate-300 focus:outline-none focus:border-blue-500 transition-all cursor-pointer shadow-sm truncate">
                <option value="1">Main Raft Foundation</option>
                <option value="2">Basement Parking Walls</option>
                <option value="3">South Tower Core</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3"><ChevronDown className="w-5 h-5 text-slate-400" /></div>
            </div>
         </div>
         
         <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
             {/* PDF Document 1 */}
             <div className="border-2 border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm transition-all hover:border-blue-300">
                <div className="p-3 md:p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between font-extrabold text-xs md:text-sm text-slate-800 cursor-pointer">
                   <div className="flex items-center gap-3"><ImageIcon className="w-4 h-4 md:w-5 md:h-5 text-blue-500" /> Architectural_Base.pdf</div>
                   <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
                <div className="p-2 space-y-1 bg-white">
                   {['Pg 1: basement1', 'Pg 2: level2'].map((p, idx) => (
                     <div key={p} onClick={() => setActivePage(idx + 1)} className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer text-xs font-bold transition-colors ${activePage === idx + 1 ? 'bg-blue-100 text-blue-800 border border-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}>
                        <div className="flex items-center gap-2.5"><FileText className="w-3 h-3 md:w-4 md:h-4 text-slate-400" /> {p}</div>
                        {activePage === idx + 1 && <span className="text-[8px] bg-blue-200 px-1.5 py-0.5 rounded-sm uppercase tracking-widest font-extrabold">Viewing</span>}
                     </div>
                   ))}
                </div>
             </div>

             <button className="w-full mt-6 flex items-center justify-center gap-2 py-4 bg-white border-2 border-dashed border-slate-400 rounded-xl text-slate-600 font-bold hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-all text-xs md:text-sm active:scale-[0.98] shadow-sm">
                <Plus className="w-5 h-5 flex-shrink-0" /> <span className="truncate">Upload Drawing PDF</span>
             </button>
         </div>
      </div>

      {/* RIGHT PROPERTIES PANEL -> CONTRACTOR GROUPING SYSTEM */}
      <div className={`absolute top-0 right-0 h-full w-[85vw] max-w-sm bg-white/95 backdrop-blur-md border-l border-slate-300 shadow-[-20px_0_40px_rgba(0,0,0,0.15)] transition-transform duration-[400ms] ease-in-out z-20 flex flex-col ${rightPanelOpen ? 'translate-x-0' : 'translate-x-[105%]'}`}>
         <button onClick={() => setRightPanelOpen(!rightPanelOpen)} className="absolute top-1/2 -left-10 md:-left-12 -translate-y-1/2 bg-slate-900 border border-slate-800 border-r-0 shadow-lg p-2 md:p-3 rounded-l-xl hover:bg-slate-800 text-white" >
            {rightPanelOpen ? <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-amber-500" /> : <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />}
         </button>
         
         <div className="p-4 md:p-6 border-b border-slate-200">
            <h3 className="font-extrabold text-lg md:text-xl text-slate-900 tracking-tight">Grouping Engine</h3>
            {selectedType ? (
               <p className="text-xs md:text-sm text-blue-600 font-bold mt-1 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md border border-blue-100 inline-block">Locking Type: {selectedType}</p>
            ) : (
               <p className="text-xs md:text-sm text-slate-500 font-medium">Select matching elements to group.</p>
            )}
         </div>
         <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3 md:space-y-4 no-scrollbar">
            {elements.map(el => {
               const isMismatched = selectedType && selectedType !== el.type;
               const isGrouped = el.status === 'Grouped';
               const isDisabled = isGrouped || isMismatched;
               return (
                  <div key={el.id} onClick={() => !isDisabled && toggleElement(el.id)} 
                     className={`p-3 md:p-4 rounded-xl border-2 transition-all ${isGrouped ? 'bg-amber-50 border-amber-300 opacity-60' : isDisabled ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed' : el.selected ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-500/20 shadow-blue-500/10 cursor-pointer transform scale-[1.02]' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm cursor-pointer'} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <CheckSquare className={`w-5 h-5 transition-colors ${el.selected ? 'text-blue-600' : isGrouped ? 'text-amber-500' : 'text-slate-300'}`} />
                      <div>
                        <p className={`font-extrabold text-md md:text-lg transition-colors ${isDisabled ? 'text-slate-400' : el.selected ? 'text-blue-900' : 'text-slate-900'}`}>{el.id}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${el.selected ? 'text-blue-500' : 'text-slate-500'}`}>{el.type}</p>
                      </div>
                    </div>
                    {isGrouped && <span className="text-[9px] md:text-[10px] font-extrabold text-amber-800 px-2.5 py-1 bg-amber-200 rounded-full uppercase tracking-widest shadow-sm">Grouped</span>}
                    {isMismatched && !isGrouped && <span className="text-[9px] md:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1"><X className="w-3 h-3"/> Locked</span>}
                  </div>
               )
            })}
         </div>
         <div className="p-4 md:p-6 border-t border-slate-200 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
            <button 
               disabled={selectedElements.length === 0}
               onClick={() => setShowGroupModal(true)}
               className={`w-full py-4 rounded-xl font-extrabold text-md md:text-lg flex items-center justify-center gap-3 transition-all ${selectedElements.length > 0 ? 'bg-slate-900 text-white hover:bg-blue-600 shadow-xl shadow-blue-900/20 active:scale-[0.98]' : 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed'}`}>
              <LayoutGrid className="w-5 h-5 md:w-6 md:h-6" />
              FORM NEW GROUP {selectedElements.length > 0 && `(${selectedElements.length})`}
            </button>
         </div>
      </div>

      {/* OVERLAY MODAL: GROUP CREATION DIALOG */}
      {showGroupModal && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-200/50">
               {/* Modal Header */}
               <div className="bg-slate-900 p-6 md:p-8 flex items-center justify-between">
                  <div>
                     <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">Form Element Group</h2>
                     <p className="text-blue-400 text-[10px] md:text-xs font-bold mt-1.5 uppercase tracking-widest flex items-center gap-2">
                       <CheckSquare className="w-3 h-3" /> {selectedElements.length} {selectedType}(s) Selected
                     </p>
                  </div>
                  <button onClick={() => setShowGroupModal(false)} className="text-slate-400 hover:text-white p-2 bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5" /></button>
               </div>
               
               {/* Modal Body Form */}
               <div className="p-6 md:p-8 space-y-6">
                  <div>
                     <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Unique Group Name / Title</label>
                     <input type="text" placeholder={`e.g. ${selectedType}s Set A`} className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-300" />
                  </div>
                  <div>
                     <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Construction Completion Date</label>
                     <input type="date" className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" />
                     <p className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1.5">
                       <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span> 
                       Curing timer will automatically commence based on this date.
                     </p>
                  </div>
                  <div>
                     <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Notes (Optional)</label>
                     <textarea rows={2} className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all resize-none placeholder:text-slate-300" placeholder="Add tracking annotations..." />
                  </div>
                  
                  {/* Action Bar */}
                  <div className="pt-4">
                     <button onClick={handleGroupSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-4 rounded-xl shadow-[0_10px_20px_rgba(37,99,235,0.2)] transition-all active:scale-[0.98] text-lg flex items-center justify-center gap-2">
                        <CheckSquare className="w-5 h-5" /> Initialize Curing Engine
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
