import React, { useState } from 'react';
import { 
  MousePointer2, Square, Slash, MapPin, Type, Hand,
  ZoomIn, ZoomOut, Layers, LayoutGrid, CheckSquare, 
  ChevronRight, ChevronLeft, Plus, Image as ImageIcon
} from 'lucide-react';

export default function Plans() {
  const [activeTool, setActiveTool] = useState('select');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activePage, setActivePage] = useState(1);
  
  // Pan and Zoom physics logic
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select Elements' },
    { id: 'pan', icon: Hand, label: 'Pan Canvas (Middle Mouse)' },
    { id: 'rect', icon: Square, label: 'Surface (Wall/Slab)' },
    { id: 'line', icon: Slash, label: 'Line (Pipe)' },
    { id: 'point', icon: MapPin, label: 'Point (Column)' },
    { id: 'text', icon: Type, label: 'Place Text' },
  ];

  const mockElements = [
    { id: 'W-01', type: 'Wall', status: 'Unassigned' },
    { id: 'W-02', type: 'Wall', status: 'Unassigned' },
    { id: 'S-1A', type: 'Slab', status: 'Grouped' },
  ];

  const mockPages = [
    { id: 1, type: 'pdf', label: 'Pg 1' },
    { id: 2, type: 'pdf', label: 'Pg 2' },
    { id: 3, type: 'blank', label: 'Custom 1' },
  ];

  const handleWheel = (e: React.WheelEvent) => {
    // Mouse scroll to zoom
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => Math.max(0.1, Math.min(s * zoomFactor, 5)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // True if Middle Mouse Button (1) or Pan Tool selected
    if (e.button === 1 || activeTool === 'pan') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  return (
    <div 
      className={`absolute inset-0 bg-[#e5e7eb] font-sans overflow-hidden ${isPanning || activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()} // Prevents right-click menu when panning
    >
      {/* 1. PAN & ZOOM WRAPPER (This engine wrapper handles moving the drawing physically) */}
      <div 
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
      >
          {/* Infinite Background Grid for Pan registration mapping */}
          <div className="absolute w-[1000vw] h-[1000vh] -left-[500vw] -top-[500vh] opacity-40" 
               style={{ backgroundImage: 'radial-gradient(#94a3b8 2px, transparent 2px)', backgroundSize: '50px 50px' }}>
          </div>

          {/* Actual Drawing Sheet */}
          <div className="absolute top-[10vh] left-[10vw] w-[80vw] h-[80vh] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-300 pointer-events-auto transition-transform duration-300">
             
             {/* Title Indicator inside drawing scale */}
             <div className="absolute -top-10 left-0 text-slate-700 font-mono text-lg font-bold tracking-tight bg-white/50 px-2 rounded-t-md">
               {activePage === 3 ? '✏️ User Created: Custom Blank Drawing' : `📄 Architectural Blueprint.pdf - Page ${activePage}`}
             </div>

             {/* Mock Map Vector Elements */}
             {activePage === 1 && (
               <>
                 <div className="absolute top-[20%] left-[30%] w-32 h-[400px] border-[3px] border-blue-500 bg-blue-500/10 flex items-center justify-center text-blue-700 font-bold hover:bg-blue-500/20 cursor-pointer shadow-sm">W-01</div>
                 <div className="absolute top-[20%] left-[55%] w-32 h-[400px] border-[3px] border-blue-500 bg-blue-500/10 flex items-center justify-center text-blue-700 font-bold hover:bg-blue-500/20 cursor-pointer shadow-sm">W-02</div>
                 <div className="absolute bottom-[20%] right-[20%] w-[500px] h-64 border-[4px] border-amber-500 bg-amber-500/20 flex flex-col items-center justify-center text-amber-900 font-bold shadow-xl cursor-pointer hover:scale-[1.02] transition-transform">
                   S-1A
                   <span className="text-lg font-bold text-amber-800 bg-amber-200 px-4 py-1 rounded-full mt-2 shadow-sm">Grouped</span>
                 </div>
               </>
             )}
             
             {/* Blank Page Custom Indicator */}
             {activePage === 3 && (
                <div className="w-full h-full flex items-center justify-center text-slate-300 font-bold text-[80px] uppercase tracking-widest opacity-50 pointer-events-none">
                  Blank Canvas Area
                </div>
             )}
          </div>
      </div>

      {/* 2. UI OVERLAYS (These stay statically fixed to viewport boundaries) */}

      {/* FLOATING LEFT TOOLBAR */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl p-2 flex flex-col gap-2 z-10">
         {tools.map(t => (
            <button 
              key={t.id} onClick={() => setActiveTool(t.id)} title={t.label}
              className={`p-3 rounded-xl transition-all hover:scale-105 active:scale-95 ${activeTool === t.id ? 'bg-amber-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <t.icon className="w-6 h-6" />
            </button>
         ))}
         <div className="w-full h-px bg-slate-200 my-1" />
         <button onClick={() => setScale(s => Math.min(s * 1.5, 5))} className="p-3 text-slate-600 hover:bg-slate-100 rounded-xl hover:scale-105 transition-all"><ZoomIn className="w-6 h-6" /></button>
         <button onClick={() => setScale(s => Math.max(s / 1.5, 0.1))} className="p-3 text-slate-600 hover:bg-slate-100 rounded-xl hover:scale-105 transition-all"><ZoomOut className="w-6 h-6" /></button>
      </div>

      {/* BOTTOM PAGE SLIDER */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl p-2.5 flex items-center gap-5 z-10 h-24">
         <div className="flex gap-3 overflow-x-auto px-2">
           {mockPages.map(page => (
             <button 
               key={page.id} onClick={() => setActivePage(page.id)}
               className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 shadow-sm ${activePage === page.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
             >
               {page.type === 'pdf' ? <ImageIcon className="w-6 h-6 text-slate-500 mb-1" /> : <Square className="w-6 h-6 text-slate-500 mb-1" />}
               <span className="text-[10px] font-bold text-slate-700 uppercase tracking-tight">{page.label}</span>
             </button>
           ))}
         </div>
         <div className="w-px h-12 bg-slate-300" />
         <button className="flex flex-col items-center justify-center w-28 h-16 rounded-xl border-2 border-slate-800 bg-slate-900 shadow-md hover:bg-slate-800 transition-all text-white hover:scale-105 active:scale-95 group" onClick={() => setActivePage(3)}>
           <Plus className="w-6 h-6 mb-0.5 text-amber-500 group-hover:scale-110 transition-transform" />
           <span className="text-[10px] font-bold uppercase text-center leading-tight tracking-wide">Blank Drawing</span>
         </button>
      </div>

      {/* COLLAPSIBLE RIGHT PROPERTIES PANEL */}
      <div className={`absolute top-0 right-0 h-full w-80 bg-white/95 backdrop-blur-md border-l border-slate-300 shadow-[-20px_0_40px_rgba(0,0,0,0.1)] transition-transform duration-[400ms] ease-in-out z-30 flex flex-col ${rightPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
         <button 
           onClick={() => setRightPanelOpen(!rightPanelOpen)}
           className="absolute top-1/2 -left-12 -translate-y-1/2 bg-slate-900 border border-slate-800 border-r-0 shadow-lg p-3 rounded-l-xl hover:bg-slate-800 text-white transition-colors"
         >
            {rightPanelOpen ? <ChevronRight className="w-6 h-6 text-amber-500" /> : <ChevronLeft className="w-6 h-6 text-amber-500" />}
         </button>

         <div className="p-6 border-b border-slate-200 flex flex-col items-start gap-1">
            <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">Active Elements</h3>
            <p className="text-sm text-slate-500 font-medium">Select elements to form groups.</p>
         </div>
         
         <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {mockElements.map(el => (
               <div key={el.id} className={`p-4 rounded-xl border-2 ${el.status === 'Grouped' ? 'bg-amber-50 border-amber-300 shadow-md transform scale-[1.02]' : 'bg-white border-slate-200 hover:border-slate-400'} flex items-center justify-between cursor-pointer transition-all`}>
                 <div className="flex items-center gap-4">
                   <CheckSquare className={`w-6 h-6 ${el.status === 'Grouped' ? 'text-amber-500' : 'text-slate-300'}`} />
                   <div>
                     <p className="font-extrabold text-slate-900 text-lg">{el.id}</p>
                     <p className="text-[11px] font-bold text-slate-500 tracking-widest uppercase">{el.type}</p>
                   </div>
                 </div>
                 {el.status === 'Grouped' && <span className="text-[10px] font-extrabold text-amber-800 px-3 py-1 bg-amber-200 rounded-full shadow-sm uppercase tracking-wide">Grouped</span>}
               </div>
            ))}
         </div>
         
         <div className="p-6 border-t border-slate-200 bg-white">
            <button className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-amber-500 hover:text-slate-900 shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95">
              <LayoutGrid className="w-6 h-6" />
              FORM NEW GROUP
            </button>
         </div>
      </div>

    </div>
  );
}
