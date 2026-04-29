import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderOpen, FileText, Hand, Image as ImageIcon, LayoutTemplate, Loader2, MousePointer2, Plus, Ruler, Square, Slash, MapPin, X } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { curingService, hierarchyService } from '../services/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type DrawingRecord = {
  id: number;
  name: string;
};

type PageRecord = {
  id: string;
  name: string;
  kind: string;
  page_number?: number;
};

export default function Plans() {
  const [searchParams] = useSearchParams();
  const structureId = Number(searchParams.get('structureId') || '0');
  const requestedDrawingId = Number(searchParams.get('drawingId') || '0');
  const [activeTool, setActiveTool] = useState('select');
  const [treeOpen, setTreeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creatingBlankPage, setCreatingBlankPage] = useState(false);
  const [drawings, setDrawings] = useState<DrawingRecord[]>([]);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState<number>(0);
  const [activeDrawingName, setActiveDrawingName] = useState('');
  const [activePageId, setActivePageId] = useState('');
  const [activePageName, setActivePageName] = useState('');
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pageThumbnails, setPageThumbnails] = useState<Record<string, string>>({});
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 1000 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [calibrationPoints, setCalibrationPoints] = useState<{ x: number; y: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'pan', icon: Hand, label: 'Pan' },
    { id: 'calibrate', icon: Ruler, label: 'Calibrate Scale' },
    { id: 'rect', icon: Square, label: 'Surface' },
    { id: 'line', icon: Slash, label: 'Line' },
    { id: 'point', icon: MapPin, label: 'Point' },
  ];

  useEffect(() => {
    const fetchDrawings = async () => {
      if (!structureId) {
        setDrawings([]);
        setPages([]);
        setActiveDrawingId(0);
        setActiveDrawingName('');
        setActivePageId('');
        setActivePageName('');
        setPdfDocument(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await hierarchyService.getDrawings(structureId);
        setDrawings(data);
        if (data.length > 0) {
          const matchedDrawing = requestedDrawingId ? data.find((drawing: DrawingRecord) => drawing.id === requestedDrawingId) : null;
          setActiveDrawingId(matchedDrawing ? matchedDrawing.id : data[0].id);
        } else {
          setPages([]);
          setActiveDrawingId(0);
          setActiveDrawingName('');
          setActivePageId('');
          setActivePageName('');
          setPdfDocument(null);
        }
      } catch (error) {
        console.error('Failed to load drawings', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDrawings();
  }, [structureId, requestedDrawingId]);

  useEffect(() => {
    const fetchPagesAndPdf = async () => {
      if (!activeDrawingId) {
        setPages([]);
        setActivePageId('');
        setActivePageName('');
        setPdfDocument(null);
        return;
      }

      try {
        setLoading(true);
        const [pageData, fileBlob] = await Promise.all([
          hierarchyService.getDrawingPages(activeDrawingId),
          hierarchyService.getDrawingFile(activeDrawingId),
        ]);

        const pageList = pageData.pages || [];
        setPages(pageList);
        setActiveDrawingName(pageData.drawing_name || '');
        setActivePageId(pageList[0]?.id || '');
        setActivePageName(pageList[0]?.name || '');
        setPageThumbnails({});

        const fileBuffer = await fileBlob.arrayBuffer();
        const typedArray = new Uint8Array(fileBuffer);
        const loadingTask = getDocument({ data: typedArray });
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
      } catch (error) {
        console.error('Failed to load PDF drawing', error);
        setPages([]);
        setPdfDocument(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPagesAndPdf();
  }, [activeDrawingId]);

  useEffect(() => {
    const activePage = pages.find((page) => page.id === activePageId);
    if (!activePage) return;

    setActivePageName(activePage.name);

    const renderActivePage = async () => {
      const canvas = renderCanvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      if (activePage.kind === 'blank') {
        canvas.width = 1200;
        canvas.height = 850;
        setCanvasSize({ width: 1200, height: 850 });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = '#d1d5db';
        context.lineWidth = 2;
        context.strokeRect(0, 0, canvas.width, canvas.height);
        return;
      }

      if (!pdfDocument || !activePage.page_number) return;

      const pdfPage = await pdfDocument.getPage(activePage.page_number);
      const viewport = pdfPage.getViewport({ scale: 1.6 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
    };

    renderActivePage();
  }, [activePageId, pages, pdfDocument]);

  useEffect(() => {
    const pdfPages = pages.filter((page) => page.kind === 'pdf' && page.page_number);
    const nextPage = pdfPages.find((page) => !pageThumbnails[page.id]);
    if (!nextPage || !pdfDocument) return;

    const buildThumbnail = async () => {
      try {
        const pdfPage = await pdfDocument.getPage(nextPage.page_number);
        const viewport = pdfPage.getViewport({ scale: 0.28 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        setPageThumbnails((current) => ({ ...current, [nextPage.id]: canvas.toDataURL('image/png') }));
      } catch (error) {
        console.error('Failed to build page thumbnail', error);
      }
    };

    buildThumbnail();
  }, [pages, pageThumbnails, pdfDocument]);

  useEffect(() => {
    return () => {
      if (pdfDocument?.destroy) {
        pdfDocument.destroy();
      }
    };
  }, [pdfDocument]);

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
        setCalibrationPoints((prev) => [...prev, { x, y }]);
        if (calibrationPoints.length === 1) {
          const m = prompt('Enter the real-world distance in METERS for this line:');
          if (m) {
            const p1 = calibrationPoints[0];
            const p2 = { x, y };
            const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
            alert(`Scale calibrated: 1 unit = ${(parseFloat(m) / dist).toFixed(4)} meters.`);
          }
          setCalibrationPoints([]);
          setActiveTool('select');
        }
      }
      return;
    }

    if (e.pointerType === 'mouse' && (e.button === 1 || activeTool === 'pan')) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !structureId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('structure_id', String(structureId));
    formData.append('name', file.name);

    try {
      setUploading(true);
      await curingService.uploadDrawing(formData);
      const updatedDrawings = await hierarchyService.getDrawings(structureId);
      setDrawings(updatedDrawings);
      if (updatedDrawings.length > 0) {
        setActiveDrawingId(updatedDrawings[updatedDrawings.length - 1].id);
      }
      alert('PDF uploaded successfully.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to upload PDF.');
    } finally {
      setUploading(false);
      setTreeOpen(false);
      e.target.value = '';
    }
  };

  const handleCreateBlankPage = async () => {
    if (!activeDrawingId) return;
    try {
      setCreatingBlankPage(true);
      const result = await hierarchyService.createBlankDrawingPage(activeDrawingId);
      const newPage = result.page;
      setPages((current) => [...current, newPage]);
      setActivePageId(newPage.id);
      setActivePageName(newPage.name);
    } catch (error) {
      alert('Failed to create blank page.');
    } finally {
      setCreatingBlankPage(false);
    }
  };

  const renderThumbnail = (page: PageRecord) => {
    if (page.kind === 'blank') {
      return (
        <div className="h-full w-full rounded-xl border border-dashed border-slate-300 bg-white flex items-center justify-center text-[11px] font-black text-slate-400">
          Blank
        </div>
      );
    }

    const thumbnail = pageThumbnails[page.id];
    if (!thumbnail) {
      return (
        <div className="h-full w-full rounded-xl border border-slate-200 bg-white flex items-center justify-center text-[11px] font-black text-slate-400">
          Loading
        </div>
      );
    }

    return <img src={thumbnail} alt={page.name} className="h-full w-full rounded-xl object-contain bg-white" />;
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
      style={{ touchAction: 'none' }}
    >
      <div
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
      >
        <div
          className="absolute w-[20000px] h-[20000px] -left-[10000px] -top-[10000px] opacity-20"
          style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '40px 40px' }}
        />

        <canvas
          ref={renderCanvasRef}
          className="absolute shadow-2xl bg-white"
          style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }}
        />
        <svg width={canvasSize.width} height={canvasSize.height} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="absolute overflow-visible pointer-events-none">
          {calibrationPoints.length === 1 && (
            <line
              x1={calibrationPoints[0].x}
              y1={calibrationPoints[0].y}
              x2={calibrationPoints[0].x}
              y2={calibrationPoints[0].y}
              stroke="red"
              strokeWidth={2 / scale}
              strokeDasharray="4 4"
            />
          )}
        </svg>
      </div>

      <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10 pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur-xl shadow-2xl border border-slate-800 rounded-3xl flex flex-col p-2.5 gap-3 pointer-events-auto">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              title={t.label}
              className={`p-3.5 rounded-2xl transition-all ${activeTool === t.id ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
            >
              <t.icon className="w-6 h-6" />
            </button>
          ))}
        </div>
      </div>

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
            accept=".pdf"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!structureId}
            className="w-full mt-6 py-4 bg-blue-600/10 border-2 border-dashed border-blue-600/30 rounded-2xl flex items-center justify-center gap-3 text-blue-500 font-black text-sm hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all active:scale-95 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-5 h-5" /> ADD PDF PLAN</>}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          <div className="border border-slate-800 rounded-[1.5rem] overflow-hidden bg-slate-900/50">
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between font-black text-xs text-slate-400">
              <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-500" /> ACTIVE PDFS</div>
            </div>
            <div className="p-2 space-y-1">
              {drawings.length > 0 ? drawings.map((drawing) => (
                <button
                  key={drawing.id}
                  onClick={() => setActiveDrawingId(drawing.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border font-black text-xs ${activeDrawingId === drawing.id ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'}`}
                >
                  <div className="flex items-center gap-3 min-w-0"><FileText className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{drawing.name}</span></div>
                  {activeDrawingId === drawing.id && <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded-full">ACTIVE</span>}
                </button>
              )) : (
                <div className="px-4 py-3 text-xs font-black text-slate-500">No PDFs linked.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => setTreeOpen(!treeOpen)} className="absolute top-6 left-6 z-20 p-3 bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-xl hover:bg-slate-900 transition-all flex items-center gap-2 font-bold text-sm">
        <FolderOpen className="w-5 h-5 text-blue-500" />
        PDF Explorer
      </button>

      <div className="absolute top-6 right-6 z-20 bg-slate-950/90 text-white rounded-2xl border border-slate-800 shadow-xl px-4 py-3">
        <p className="text-sm font-black">{activeDrawingName || 'No PDF selected'}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{activePageName || 'No page selected'}</p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-3 overflow-x-auto px-6 py-4 no-scrollbar">
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => setActivePageId(page.id)}
              className={`w-44 flex-shrink-0 rounded-2xl border p-3 text-left transition-all ${
                activePageId === page.id ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(37,99,235,0.18)]' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="h-24 w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                {renderThumbnail(page)}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <LayoutTemplate className="h-3.5 w-3.5" />
                {page.kind}
              </div>
              <div className="mt-1 truncate text-sm font-black text-white">{page.name}</div>
            </button>
          ))}

          <button
            onClick={handleCreateBlankPage}
            disabled={!activeDrawingId || creatingBlankPage}
            className="w-36 h-[158px] flex-shrink-0 rounded-2xl border border-dashed border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-500 hover:text-white disabled:opacity-50"
          >
            <div className="flex h-full flex-col items-center justify-center gap-3">
              {creatingBlankPage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
              <span className="text-xs font-black uppercase tracking-widest">Add Blank</span>
            </div>
          </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-950/90 px-5 py-4 border border-slate-800 text-white font-bold">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading PDF
          </div>
        </div>
      )}
    </div>
  );
}
