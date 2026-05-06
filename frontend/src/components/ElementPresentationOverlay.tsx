import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  ScanSearch,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { hierarchyService, progressService } from '../services/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Point = { x: number; y: number };
type Annotation = {
  id: string;
  type: 'rect' | 'polygon' | 'line' | 'point';
  elementType: string;
  memberName: string;
  color: string;
  pointShape?: 'circle' | 'square';
  isHidden?: boolean;
  points: Point[];
};

type PresentationMedia = {
  media_id: number;
  file_url: string;
  file_type: 'image' | 'video';
  mime_type: string | null;
  captured_at: string | null;
  capture_latitude: string | null;
  capture_longitude: string | null;
  source_type: string | null;
};

type PresentationEntry = {
  entry_id: number;
  created_at: string | null;
  did_cure_today: boolean;
  remark: string | null;
  submitted_by: string;
  media: PresentationMedia[];
};

type PresentationDay = {
  date: string;
  day_status: 'cured' | 'not_cured' | 'no_update';
  entry_count: number;
  media_count: number;
  entries: PresentationEntry[];
};

type PresentationPayload = {
  drawing_element_id: string;
  element_name: string;
  structure_name: string;
  plan_name: string;
  page_name: string;
  drawing_id: number;
  drawing_page_id: number;
  page_id: string;
  page_kind: string;
  page_number?: number;
  drawing_asset_kind?: string | null;
  start_date: string | null;
  end_date: string | null;
  total_days: number;
  missed_days_count: number;
  is_completed: boolean;
  element_annotation: Annotation;
  navigation?: {
    enabled: boolean;
    current_position: number | null;
    total: number;
    previous_element_id: string | null;
    next_element_id: string | null;
  };
  timeline_days: PresentationDay[];
};

type PlaybackItem = {
  entryIndex: number;
  mediaIndex: number;
  media: PresentationMedia;
};

type Props = {
  drawingElementId: string | null;
  open: boolean;
  onClose: () => void;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
};

const rgba = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const darken = (hex: string, factor = 0.62) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
};

const formatDateLabel = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();
};

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).toUpperCase();
};

const annotationBounds = (annotation: Annotation) => {
  const xs = annotation.points.map((point) => point.x);
  const ys = annotation.points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

const dayStatusLabel = (status: PresentationDay['day_status']) => {
  if (status === 'cured') return 'Cured';
  if (status === 'not_cured') return 'Not Cured';
  return 'No Update';
};

const dayStatusClasses = (status: PresentationDay['day_status']) => {
  if (status === 'cured') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'not_cured') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-white text-slate-500';
};

const renderAnnotation = (annotation: Annotation, selectedId: string) => {
  if (annotation.isHidden) return null;
  const isSelected = annotation.id === selectedId;
  const stroke = darken(annotation.color);
  const mutedStroke = isSelected ? stroke : 'rgba(100,116,139,0.35)';
  const fill = isSelected ? rgba(annotation.color, 0.22) : 'rgba(148,163,184,0.08)';

  if (annotation.type === 'rect') {
    const [start, end] = annotation.points;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    return (
      <g key={annotation.id}>
        {isSelected && <rect x={x} y={y} width={width} height={height} fill="none" stroke="rgba(0,0,0,0.88)" strokeWidth={6} />}
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke={mutedStroke} strokeWidth={isSelected ? 3 : 1.5} />
      </g>
    );
  }

  if (annotation.type === 'polygon') {
    const points = annotation.points.map((point) => `${point.x},${point.y}`).join(' ');
    return (
      <g key={annotation.id}>
        {isSelected && <polygon points={points} fill="none" stroke="rgba(0,0,0,0.88)" strokeWidth={6} />}
        <polygon points={points} fill={fill} stroke={mutedStroke} strokeWidth={isSelected ? 3 : 1.5} />
      </g>
    );
  }

  if (annotation.type === 'line') {
    const points = annotation.points.map((point) => `${point.x},${point.y}`).join(' ');
    return (
      <g key={annotation.id}>
        {isSelected && <polyline points={points} fill="none" stroke="rgba(0,0,0,0.88)" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />}
        <polyline points={points} fill="none" stroke={mutedStroke} strokeWidth={isSelected ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
      </g>
    );
  }

  const point = annotation.points[0];
  const pointSize = 12;
  const half = pointSize / 2;
  return (
    <g key={annotation.id}>
      {isSelected && (annotation.pointShape === 'square' ? (
        <rect x={point.x - half - 4} y={point.y - half - 4} width={pointSize + 8} height={pointSize + 8} fill="none" stroke="rgba(0,0,0,0.88)" strokeWidth={4} />
      ) : (
        <circle cx={point.x} cy={point.y} r={half + 4} fill="none" stroke="rgba(0,0,0,0.88)" strokeWidth={4} />
      ))}
      {annotation.pointShape === 'square' ? (
        <rect x={point.x - half} y={point.y - half} width={pointSize} height={pointSize} fill={isSelected ? mutedStroke : 'rgba(100,116,139,0.5)'} stroke="#fff" strokeWidth={2} />
      ) : (
        <circle cx={point.x} cy={point.y} r={half} fill={isSelected ? mutedStroke : 'rgba(100,116,139,0.5)'} stroke="#fff" strokeWidth={2} />
      )}
    </g>
  );
};

export default function ElementPresentationOverlay({ drawingElementId, open, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRailRef = useRef<HTMLDivElement | null>(null);
  const mediaOverlayRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentElementId, setCurrentElementId] = useState<string | null>(drawingElementId);
  const [payload, setPayload] = useState<PresentationPayload | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [drawingImageUrl, setDrawingImageUrl] = useState<string | null>(null);
  const [mediaUrlMap, setMediaUrlMap] = useState<Record<number, string>>({});
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);
  const [activeMediaFlatIndex, setActiveMediaFlatIndex] = useState<number | null>(null);
  const [showDrawing, setShowDrawing] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 1000 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaZoom, setMediaZoom] = useState(1);
  const [mediaRotation, setMediaRotation] = useState(0);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [isMediaFullscreen, setIsMediaFullscreen] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [mouseViewport, setMouseViewport] = useState({ x: 0, y: 0, visible: false });
  const objectUrlsRef = useRef<string[]>([]);

  const timelineDays = payload?.timeline_days || [];
  const selectedDay = timelineDays[selectedDayIndex] || null;
  const currentDayPlayback = useMemo<PlaybackItem[]>(() => {
    if (!selectedDay) return [];
    const items: PlaybackItem[] = [];
    selectedDay.entries.forEach((entry, entryIndex) => {
      entry.media.forEach((media, mediaIndex) => {
        items.push({ entryIndex, mediaIndex, media });
      });
    });
    return items;
  }, [selectedDay]);

  const currentMediaItem = activeMediaFlatIndex != null ? currentDayPlayback[activeMediaFlatIndex] || null : null;
  const currentEntry = selectedDay?.entries[activeEntryIndex] || null;
  const currentMedia = currentMediaItem?.media || null;
  const currentMediaUrl = currentMedia ? mediaUrlMap[currentMedia.media_id] : null;
  const navigation = payload?.navigation;

  const cleanupObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  const fitToElement = () => {
    const viewport = viewportRef.current;
    const target = payload?.element_annotation;
    if (!viewport || !target) return;
    const bounds = annotationBounds(target);
    const paddedWidth = Math.max(bounds.maxX - bounds.minX + 220, 260);
    const paddedHeight = Math.max(bounds.maxY - bounds.minY + 220, 260);
    const nextScale = Math.min(viewport.clientWidth / paddedWidth, viewport.clientHeight / paddedHeight, 2.4);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    setScale(nextScale);
    setPosition({
      x: viewport.clientWidth / 2 - centerX * nextScale,
      y: viewport.clientHeight / 2 - centerY * nextScale,
    });
  };

  const fitMedia = () => {
    setMediaZoom(1);
    setMediaRotation(0);
  };

  const toggleMediaFullscreen = async () => {
    const target = mediaOverlayRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      }
    } catch {
      // noop
    }
  };

  const executeZoom = (nextScale: number, anchorX?: number, anchorY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const clampedScale = clamp(nextScale, 0.35, 4);
    const rect = viewport.getBoundingClientRect();
    const targetX = anchorX ?? rect.width / 2;
    const targetY = anchorY ?? rect.height / 2;
    const pageX = (targetX - position.x) / scale;
    const pageY = (targetY - position.y) / scale;
    setScale(clampedScale);
    setPosition({
      x: targetX - pageX * clampedScale,
      y: targetY - pageY * clampedScale,
    });
  };

  const currentDateIso = new Date().toISOString().slice(0, 10);

  const timelineLabel = (day: PresentationDay) => {
    if (day.date > currentDateIso) return 'Upcoming';
    if (day.day_status === 'cured') return 'Cured';
    if (day.day_status === 'not_cured') return 'Not Cured';
    return 'No Evidence';
  };

  const timelineClasses = (day: PresentationDay, selected: boolean) => {
    if (selected) return 'border-slate-900 bg-slate-900 text-white';
    if (day.date > currentDateIso) return 'border-slate-200 bg-white text-slate-500';
    if (day.day_status === 'cured') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    return 'border-red-200 bg-red-50 text-red-700';
  };

  const handleClose = async () => {
    if (document.fullscreenElement && overlayRef.current && document.fullscreenElement === overlayRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        // noop
      }
    }
    onClose();
  };

  useEffect(() => {
    const syncFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === overlayRef.current);
      setIsMediaFullscreen(document.fullscreenElement === mediaOverlayRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCurrentElementId(drawingElementId);
  }, [open, drawingElementId]);

  useEffect(() => {
    if (!open || !currentElementId) return;
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        cleanupObjectUrls();
        setMediaUrlMap({});
        setDrawingImageUrl(null);
        if (pdfDocument?.destroy) {
          try {
            await pdfDocument.destroy();
          } catch {
            // noop
          }
        }
        setPdfDocument(null);
        const presentation = await progressService.getPresentation(currentElementId);
        const [annotationResponse, fileBlob] = await Promise.all([
          hierarchyService.getDrawingAnnotations(presentation.drawing_id, presentation.page_id),
          presentation.drawing_asset_kind === 'blank' ? Promise.resolve(null) : hierarchyService.getDrawingFile(presentation.drawing_id),
        ]);
        if (!active) return;
        setPayload(presentation);
        setAnnotations(annotationResponse.annotations || []);
        setSelectedDayIndex(0);
        setActiveEntryIndex(0);
        setActiveMediaFlatIndex(null);
        fitMedia();
        if (!fileBlob) {
          setDrawingImageUrl(null);
          setPdfDocument(null);
        } else if ((fileBlob.type || '').startsWith('image/')) {
          const nextUrl = URL.createObjectURL(fileBlob);
          objectUrlsRef.current.push(nextUrl);
          setDrawingImageUrl(nextUrl);
          setPdfDocument(null);
        } else {
          const typedArray = new Uint8Array(await fileBlob.arrayBuffer());
          const loadingTask = getDocument({ data: typedArray });
          const pdf = await loadingTask.promise;
          if (!active) {
            if (pdf?.destroy) pdf.destroy();
            return;
          }
          setPdfDocument(pdf);
          setDrawingImageUrl(null);
        }
      } catch (error) {
        console.error('Failed to load presentation payload', error);
        if (active) {
          setPayload(null);
          setAnnotations([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [open, currentElementId]);

  useEffect(() => {
    if (!open || !overlayRef.current) return;
    const target = overlayRef.current;
    const attempt = async () => {
      try {
        if (document.fullscreenElement !== target && target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } catch {
        // leave as overlay if fullscreen request fails
      }
    };
    void attempt();
  }, [open]);

  useEffect(() => {
    return () => {
      cleanupObjectUrls();
      if (pdfDocument?.destroy) pdfDocument.destroy();
    };
  }, []);

  useEffect(() => {
    if (timelineDays.length === 0) return;
    const todayIndex = timelineDays.findIndex((day) => day.date === currentDateIso);
    if (todayIndex >= 0) {
      setSelectedDayIndex(todayIndex);
      return;
    }
    setSelectedDayIndex(Math.max(timelineDays.length - 1, 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.drawing_element_id]);

  useEffect(() => {
    if (!selectedDay) return;
    if (selectedDay.entries.length === 0) {
      setActiveEntryIndex(0);
      setActiveMediaFlatIndex(null);
      return;
    }
    if (currentDayPlayback.length > 0) {
      setActiveMediaFlatIndex(0);
      setActiveEntryIndex(currentDayPlayback[0].entryIndex);
    } else {
      setActiveEntryIndex(0);
      setActiveMediaFlatIndex(null);
    }
    fitMedia();
  }, [selectedDay, currentDayPlayback.length]);

  useEffect(() => {
    if (!selectedDay || currentDayPlayback.length === 0) return;
    const needed = currentDayPlayback.filter((item) => !mediaUrlMap[item.media.media_id]);
    if (needed.length === 0) return;
    let cancelled = false;
    const loadMedia = async () => {
      const loaded = await Promise.all(needed.map(async (item) => {
        const blob = await progressService.getMediaFile(item.media.media_id);
        const url = URL.createObjectURL(blob);
        return [item.media.media_id, url] as const;
      }));
      if (cancelled) {
        loaded.forEach(([, url]) => URL.revokeObjectURL(url));
        return;
      }
      loaded.forEach(([, url]) => objectUrlsRef.current.push(url));
      setMediaUrlMap((current) => {
        const next = { ...current };
        loaded.forEach(([id, url]) => { next[id] = url; });
        return next;
      });
    };
    void loadMedia();
    return () => {
      cancelled = true;
    };
  }, [selectedDay, currentDayPlayback, mediaUrlMap]);

  useEffect(() => {
    const renderPage = async () => {
      if (!payload || payload.page_kind === 'blank') {
        setCanvasSize({ width: 1000, height: 1000 });
        return;
      }
      const canvas = renderCanvasRef.current;
      if (!canvas) return;
      if (payload.page_kind === 'image' && drawingImageUrl) {
        const image = new Image();
        image.onload = () => {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) return;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
          requestAnimationFrame(() => fitToElement());
        };
        image.src = drawingImageUrl;
        return;
      }
      if (payload.page_kind === 'pdf' && pdfDocument && payload.page_number) {
        const pdfPage = await pdfDocument.getPage(payload.page_number);
        const viewport = pdfPage.getViewport({ scale: 1.6 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        await pdfPage.render({ canvasContext: context, viewport }).promise;
        setCanvasSize({ width: viewport.width, height: viewport.height });
        requestAnimationFrame(() => fitToElement());
      }
    };
    void renderPage();
  }, [payload, drawingImageUrl, pdfDocument]);

  useEffect(() => {
    if (payload?.element_annotation) {
      requestAnimationFrame(() => fitToElement());
    }
  }, [payload?.element_annotation?.id, canvasSize.width, canvasSize.height]);

  useEffect(() => {
    const rail = timelineRailRef.current;
    if (!rail) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) && event.deltaY === 0) return;
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    };
    rail.addEventListener('wheel', handleWheel, { passive: false });
    return () => rail.removeEventListener('wheel', handleWheel);
  }, [timelineDays.length]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[300] bg-[#eef2f7]">
      <div className="flex h-screen w-screen flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">Curing Presentation</div>
            <div className="mt-1 text-lg font-black tracking-tight text-slate-900">
              {payload ? `${payload.structure_name} / ${payload.plan_name} / ${payload.page_name} / ${payload.element_name}` : 'Loading...'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {navigation?.enabled && (
              <>
                <button
                  type="button"
                  onClick={() => navigation.previous_element_id && setCurrentElementId(navigation.previous_element_id)}
                  disabled={!navigation.previous_element_id}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="Previous active element"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                  {`${navigation.current_position} of ${navigation.total} active`}
                </span>
                <button
                  type="button"
                  onClick={() => navigation.next_element_id && setCurrentElementId(navigation.next_element_id)}
                  disabled={!navigation.next_element_id}
                  className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="Next active element"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            {selectedDay && <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">{formatDateLabel(selectedDay.date)}</span>}
            {selectedDay && <span className={`rounded-xl border px-3 py-2 text-sm font-black ${dayStatusClasses(selectedDay.day_status)}`}>{dayStatusLabel(selectedDay.day_status)}</span>}
            {payload && <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">{`Missed: ${payload.missed_days_count} day${payload.missed_days_count === 1 ? '' : 's'}`}</span>}
            {payload?.is_completed && <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">Completed</span>}
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement === overlayRef.current) {
                  void document.exitFullscreen();
                } else if (overlayRef.current?.requestFullscreen) {
                  void overlayRef.current.requestFullscreen();
                }
              }}
              className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => { void handleClose(); }} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" title="Close presentation">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          </div>
        ) : !payload ? (
          <div className="flex flex-1 items-center justify-center text-sm font-bold text-slate-500">Failed to load presentation.</div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 grid-cols-[34rem_1fr] gap-0">
              <section className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-8 py-6">
                  <div className="text-sm font-medium text-slate-500">Structure Name</div>
                  <div className="mt-1 text-4xl font-black tracking-tight text-slate-900">{payload.structure_name}</div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-sm">
                    <div className="relative flex min-h-[420px] items-center justify-center bg-[#f4f7fb] px-6 py-6">
                      {currentMedia ? (
                        <>
                          <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-4 rounded-2xl bg-white/92 px-4 py-3 shadow-sm backdrop-blur">
                            <div className="flex items-center gap-3 text-xs font-black tracking-[0.12em] text-slate-600">
                              <div>{formatDateTimeLabel(currentMedia.captured_at)}</div>
                              {currentMedia.capture_latitude && currentMedia.capture_longitude ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const mapUrl = `https://www.google.com/maps?q=${currentMedia.capture_latitude},${currentMedia.capture_longitude}`;
                                    window.open(mapUrl, '_blank', 'noopener,noreferrer');
                                  }}
                                  className="cursor-pointer rounded-xl bg-slate-900 p-2 text-white hover:bg-slate-800"
                                  title="Open capture location in Google Maps"
                                >
                                  <MapPin className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-slate-400">Location unavailable</span>
                              )}
                            </div>
                          </div>
                          <div className="relative z-0 flex h-full w-full items-center justify-center pt-16">
                            {currentMedia.file_type === 'video' ? (
                              <video
                                src={currentMediaUrl || undefined}
                                controls
                                onClick={() => {
                                  fitMedia();
                                  setMediaViewerOpen(true);
                                }}
                                className="max-h-[300px] max-w-full cursor-zoom-in rounded-2xl bg-black shadow-xl"
                                style={{ transform: `scale(${mediaZoom}) rotate(${mediaRotation}deg)` }}
                              />
                            ) : (
                              <img
                                src={currentMediaUrl || undefined}
                                alt="Progress evidence"
                                onClick={() => {
                                  fitMedia();
                                  setMediaViewerOpen(true);
                                }}
                                className="max-h-[300px] max-w-full cursor-zoom-in rounded-2xl object-contain shadow-xl"
                                style={{ transform: `scale(${mediaZoom}) rotate(${mediaRotation}deg)` }}
                              />
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-center text-slate-400">
                          <div className="text-2xl font-black">{selectedDay?.entries.length ? 'No media uploaded for this entry/day' : 'No evidence uploaded for this day'}</div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200 bg-white px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeMediaFlatIndex == null) return;
                            const nextIndex = activeMediaFlatIndex - 1;
                            if (nextIndex < 0) return;
                            const nextItem = currentDayPlayback[nextIndex];
                            setActiveMediaFlatIndex(nextIndex);
                            setActiveEntryIndex(nextItem.entryIndex);
                          }}
                          disabled={activeMediaFlatIndex == null || activeMediaFlatIndex <= 0}
                          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="text-center">
                          <div className="text-3xl font-black tracking-tight text-slate-900">{formatDateLabel(selectedDay?.date)}</div>
                          <div className="mt-2 text-sm font-bold text-slate-500">
                            {currentEntry ? (currentEntry.remark?.trim() || 'No comment') : 'No comment'}
                          </div>
                          <div className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                            {currentEntry ? `Entry ${activeEntryIndex + 1} of ${selectedDay?.entries.length || 1}` : 'No entry'}
                            {currentMediaItem ? ` • Media ${activeMediaFlatIndex! + 1} of ${currentDayPlayback.length}` : ''}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-400">
                            {payload.start_date && payload.end_date ? `Curing Period: ${formatDateLabel(payload.start_date)} - ${formatDateLabel(payload.end_date)}, Curing Missed: ${payload.missed_days_count} Day${payload.missed_days_count === 1 ? '' : 's'}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeMediaFlatIndex == null) return;
                            const nextIndex = activeMediaFlatIndex + 1;
                            if (nextIndex >= currentDayPlayback.length) return;
                            const nextItem = currentDayPlayback[nextIndex];
                            setActiveMediaFlatIndex(nextIndex);
                            setActiveEntryIndex(nextItem.entryIndex);
                          }}
                          disabled={activeMediaFlatIndex == null || activeMediaFlatIndex >= currentDayPlayback.length - 1}
                          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      {selectedDay && selectedDay.entries.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedDay.entries.map((entry, index) => (
                            <button
                              key={entry.entry_id}
                              type="button"
                              onClick={() => {
                                setActiveEntryIndex(index);
                                const firstMediaIndex = currentDayPlayback.findIndex((item) => item.entryIndex === index);
                                setActiveMediaFlatIndex(firstMediaIndex >= 0 ? firstMediaIndex : null);
                              }}
                              className={`rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition-colors ${index === activeEntryIndex ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                            >
                              {`Entry ${index + 1}${entry.did_cure_today ? '' : ' • Not Cured'}`}
                            </button>
                          ))}
                        </div>
                      )}

                      {currentDayPlayback.length > 0 && (
                        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                          {selectedDay?.entries.map((entry, entryIndex) => (
                            <div key={entry.entry_id} className="flex flex-col gap-2">
                              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{`Entry ${entryIndex + 1}`}</div>
                              <div className="flex gap-2">
                                {entry.media.map((media) => {
                                  const flatIndex = currentDayPlayback.findIndex((item) => item.media.media_id === media.media_id);
                                  const selected = flatIndex === activeMediaFlatIndex;
                                  return (
                                    <button
                                      key={media.media_id}
                                      type="button"
                                      onClick={() => {
                                        setActiveEntryIndex(entryIndex);
                                        setActiveMediaFlatIndex(flatIndex);
                                      }}
                                      className={`relative h-16 w-24 overflow-hidden rounded-xl border ${selected ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.22)]' : 'border-slate-200'}`}
                                    >
                                      {media.file_type === 'video' ? (
                                        <video src={mediaUrlMap[media.media_id]} className="h-full w-full object-cover" muted />
                                      ) : (
                                        <img src={mediaUrlMap[media.media_id]} alt="Evidence thumbnail" className="h-full w-full object-cover" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="relative flex min-h-0 flex-col bg-[#e5eaf1]">
                <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/92 px-3 py-2 shadow-xl">
                    <button type="button" onClick={() => setScale((current) => current * 1.15)} className="rounded-xl bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 hover:text-white"><ZoomIn className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setScale((current) => current * 0.85)} className="rounded-xl bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 hover:text-white"><ZoomOut className="h-4 w-4" /></button>
                    <button type="button" onClick={fitToElement} className="rounded-xl bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 hover:text-white"><ScanSearch className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setShowDrawing((current) => !current)} className="rounded-xl bg-slate-900 p-2 text-slate-200 hover:bg-slate-800 hover:text-white">
                      {showDrawing ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="pointer-events-none absolute left-1/2 top-[76px] z-20 -translate-x-1/2 text-[13px] font-black tracking-[0.08em] text-black/60">
                  {`${payload.plan_name} / ${payload.page_name}`}
                </div>
                <div
                  ref={viewportRef}
                  className={`relative flex-1 overflow-hidden ${isPanning ? 'cursor-grabbing' : 'cursor-none'}`}
                  onWheel={(event) => {
                    event.preventDefault();
                    const rect = viewportRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.88;
                    executeZoom(scale * zoomFactor, event.clientX - rect.left, event.clientY - rect.top);
                  }}
                  onMouseDown={(event) => {
                    if (event.button !== 1) return;
                    event.preventDefault();
                    setIsPanning(true);
                    setPanStart({ x: event.clientX - position.x, y: event.clientY - position.y });
                  }}
                  onMouseMove={(event) => {
                    const rect = viewportRef.current?.getBoundingClientRect();
                    if (rect) {
                      setMouseViewport({ x: event.clientX - rect.left, y: event.clientY - rect.top, visible: true });
                    }
                    if (!isPanning) return;
                    event.preventDefault();
                    setPosition({ x: event.clientX - panStart.x, y: event.clientY - panStart.y });
                  }}
                  onMouseUp={() => setIsPanning(false)}
                  onMouseLeave={() => {
                    setIsPanning(false);
                    setMouseViewport((current) => ({ ...current, visible: false }));
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}>
                    <canvas ref={renderCanvasRef} className="absolute bg-white shadow-2xl" style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px`, opacity: showDrawing ? 1 : 0 }} />
                    <svg width={canvasSize.width} height={canvasSize.height} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="absolute overflow-visible">
                      {annotations.map((annotation) => renderAnnotation(annotation, payload.element_annotation.id))}
                    </svg>
                  </div>
                  {mouseViewport.visible && (
                    <>
                      <div className="pointer-events-none absolute left-0 right-0 z-30 h-px bg-black/90" style={{ top: mouseViewport.y }} />
                      <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-black/90" style={{ left: mouseViewport.x }} />
                      <div className="pointer-events-none absolute z-30 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-black/10" style={{ left: mouseViewport.x, top: mouseViewport.y }} />
                    </>
                  )}
                </div>
              </section>
            </div>

            <div className="border-t border-slate-200 bg-white px-6 py-4">
              <div ref={timelineRailRef} className="flex gap-3 overflow-x-auto">
                {timelineDays.map((day, index) => (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDayIndex(index)}
                    className={`min-w-[140px] rounded-2xl border px-4 py-3 text-left transition-colors ${timelineClasses(day, index === selectedDayIndex)}`}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.18em]">
                      {formatDateLabel(day.date)}
                      {day.date === currentDateIso && <span className={`ml-1 ${index === selectedDayIndex ? 'text-white/70' : 'text-slate-400'}`}>(Today)</span>}
                    </div>
                    <div className="mt-2 text-sm font-black">{timelineLabel(day)}</div>
                    <div className={`mt-1 text-[11px] font-bold ${index === selectedDayIndex ? 'text-white/70' : 'text-slate-400'}`}>
                      {`${day.entry_count} entry • ${day.media_count} media`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {mediaViewerOpen && currentMedia && (
        <div className="fixed inset-0 z-[340] bg-black/92" ref={mediaOverlayRef}>
          <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-end gap-3 px-6 py-5">
              <button type="button" onClick={() => setMediaZoom((current) => clamp(current - 0.2, 0.4, 4))} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"><ZoomOut className="h-4 w-4" /></button>
              <button type="button" onClick={() => setMediaZoom((current) => clamp(current + 0.2, 0.4, 4))} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"><ZoomIn className="h-4 w-4" /></button>
              <button type="button" onClick={() => setMediaRotation((current) => current - 90)} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"><RotateCcw className="h-4 w-4" /></button>
              <button type="button" onClick={() => setMediaRotation((current) => current + 90)} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"><RotateCw className="h-4 w-4" /></button>
              <button type="button" onClick={() => { void toggleMediaFullscreen(); }} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15" title={isMediaFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                {isMediaFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setMediaViewerOpen(false)} className="rounded-xl bg-white/10 p-2.5 text-white hover:bg-white/15"><X className="h-4 w-4" /></button>
            </div>
            <div className="relative flex flex-1 items-center justify-center px-8 pb-8">
              {currentMedia.file_type === 'video' ? (
                <video
                  src={currentMediaUrl || undefined}
                  controls
                  className="max-h-full max-w-full rounded-2xl bg-black shadow-2xl"
                  style={{ transform: `scale(${mediaZoom}) rotate(${mediaRotation}deg)` }}
                />
              ) : (
                <img
                  src={currentMediaUrl || undefined}
                  alt="Progress evidence"
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                  style={{ transform: `scale(${mediaZoom}) rotate(${mediaRotation}deg)` }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
