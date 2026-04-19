import React, { useState, useEffect } from 'react';
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

  // Native Mobile Touch physics constraints
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialScale, setInitialScale] = useState(1);

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'pan', icon: Hand, label: 'Pan' },
    { id: 'rect', icon: Square, label: 'Surface' },
    { id: 'line', icon: Slash, label: 'Line' },
    { id: 'point', icon: MapPin, label: 'Point' },
    { id: 'text', icon: Type, label: 'Text' },
  ];

  const mockElements = [ { id: 'W-01', type: 'Wall', status: 'Unassigned' }, { id: 'W-02', type: 'Wall', status: 'Unassigned' }, { id: 'S-1A', type: 'Slab', status: 'Grouped' } ];
  const mockPages = [ { id: 1, type: 'pdf', label: 'Pg 1' }, { id: 2, type: 'pdf', label: 'Pg 2' }, { id: 3, type: 'blank', label: 'Custom' } ];

  // PC Scroll Zoom
  const handleWheel = (e: React.WheelEvent) => {
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(s => Math.max(0.1, Math.min(s * zoomFactor, 5)));
  };

  // PC Pointer Event Physics (Allows middle click logic)
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

  // Native Multi-touch Physics (Smartphones / Tablets)
  const getPinchDistance = (e: React.TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setInitialPinchDistance(getPinchDistance(e));
      setInitialScale(scale);
      setIsPanning(false); // Stop panning when trying to pinch-zoom explicitly
    } else if (e.touches.length === 1) {
      // Mobile Single Finger Pan tap
      setIsPanning(true);
      setStartPan({ x: e.touches[0].clientX - position.x, y: e.touches[0].clientY - position.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
      // Execute stretch algorithm
      const zoomFactor = getPinchDistance(e) / initialPinchDistance;
      setScale(Math.max(0.1, Math.min(initialScale * zoomFactor, 5)));
    } else if (e.touches.length === 1 && isPanning) {
      // Push geometric origin based on delta
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
      style={{ touchAction: "none" }} // Disables HTML native smooth-scrolling interceptors to permit DOM mathematics exclusively.
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
               {activePage === 3 ? '✏️ Blank Drawing' : `📄 Blueprint - Page ${activePage}`}
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

      {/* FLOATING LEFT TOOLBAR (Slides to top strip on Mobile phone size, remains Left anchored on Desktop sizing) */}
      <div className="absolute left-2 md:left-6 top-4 md:top-1/2 md:-translate-y-1/2 flex md:flex-col gap-2 z-10 w-[calc(100%-1rem)] md:w-auto overflow-x-auto [&::-webkit-scrollbar]:hidden">
        <div className="bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl flex md:flex-col p-2 gap-2 flex-shrink-0">
         {tools.map(t => (
            <button key={t.id} onClick={() => setActiveTool(t.id)} title={t.label}
              className={`p-2.5 md:p-3 rounded-xl transition-all ${activeTool === t.id ? 'bg-amber-500 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
              <t.icon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
         ))}
         <div className="w-px h-auto md:w-full md:h-px bg-slate-200 my-1 mx-1 md:mx-0" />
         <button onClick={() => setScale(s => Math.min(s * 1.5, 5))} className="p-2.5 md:p-3 text-slate-600 hover:bg-slate-100 rounded-xl"><ZoomIn className="w-5 h-5 md:w-6 md:h-6" /></button>
         <button onClick={() => setScale(s => Math.max(s / 1.5, 0.1))} className="p-2.5 md:p-3 text-slate-600 hover:bg-slate-100 rounded-xl"><ZoomOut className="w-5 h-5 md:w-6 md:h-6" /></button>
        </div>
      </div>

      {/* BOTTOM PAGE SLIDER */}
      <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-300 rounded-2xl p-2 md:p-2.5 flex items-center gap-3 md:gap-5 z-10 h-20 md:h-24 max-w-[95vw] overflow-hidden">
         <div className="flex gap-2 md:gap-3 overflow-x-auto overflow-y-hidden px-1 md:px-2 [&::-webkit-scrollbar]:hidden">
           {mockPages.map(page => (
             <button key={page.id} onClick={() => setActivePage(page.id)}
               className={`flex flex-col items-center justify-center min-w-14 w-14 md:w-16 h-14 md:h-16 rounded-xl border-2 transition-all ${activePage === page.id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
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

      {/* COLLAPSIBLE RIGHT PROPERTIES PANEL */}
      <div className={`absolute top-0 right-0 h-full w-[85vw] max-w-sm bg-white/95 backdrop-blur-md border-l border-slate-300 shadow-2xl transition-transform duration-[400ms] ease-in-out z-30 flex flex-col ${rightPanelOpen ? 'translate-x-0' : 'translate-x-[105%]'}`}>
         <button onClick={() => setRightPanelOpen(!rightPanelOpen)}
           className="absolute top-1/2 -left-10 md:-left-12 -translate-y-1/2 bg-slate-900 border border-slate-800 border-r-0 shadow-lg p-2 md:p-3 rounded-l-xl hover:bg-slate-800 text-white" >
            {rightPanelOpen ? <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-amber-500" /> : <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-amber-500" />}
         </button>
         
         <div className="p-4 md:p-6 border-b border-slate-200">
            <h3 className="font-extrabold text-lg md:text-xl text-slate-900 tracking-tight">Active Elements</h3>
            <p className="text-xs md:text-sm text-slate-500 font-medium">Select elements to form groups.</p>
         </div>
         <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3 md:space-y-4">
            {mockElements.map(el => (
               <div key={el.id} className={`p-3 md:p-4 rounded-xl border-2 ${el.status === 'Grouped' ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'} flex items-center justify-between`}>
                 <div className="flex items-center gap-3">
                   <CheckSquare className={`w-5 h-5 ${el.status === 'Grouped' ? 'text-amber-500' : 'text-slate-300'}`} />
                   <div>
                     <p className="font-extrabold text-slate-900 text-md md:text-lg">{el.id}</p>
                     <p className="text-[10px] font-bold text-slate-500">{el.type}</p>
                   </div>
                 </div>
                 {el.status === 'Grouped' && <span className="text-[9px] md:text-[10px] font-extrabold text-amber-800 px-2 py-1 bg-amber-200 rounded-full">Grouped</span>}
               </div>
            ))}
         </div>
         <div className="p-4 md:p-6 border-t border-slate-200 bg-white">
            <button className="w-full py-3 md:py-4 bg-slate-900 text-white rounded-xl font-bold text-md md:text-lg hover:bg-amber-500 hover:text-slate-900 shadow-xl flex items-center justify-center gap-3">
              <LayoutGrid className="w-5 h-5 md:w-6 md:h-6" />
              FORM NEW GROUP
            </button>
         </div>
      </div>
    </div>
  );
}
