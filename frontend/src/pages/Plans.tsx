import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckSquare2,
  ChevronDown,
  DraftingCompass,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Maximize2,
  Hand,
  LayoutTemplate,
  Layers3,
  Loader2,
  MapPin,
  Minimize2,
  MousePointer2,
  Square as SquareIcon,
  PenSquare,
  Plus,
  RefreshCw,
  ScanSearch,
  Slash,
  Square,
  Trash2,
  Triangle,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { authService, hierarchyService, libraryService, progressService } from '../services/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Point = { x: number; y: number };
type DrawingRecord = { id: number; name: string; structure_id: number };
type ProjectRecord = { id: number; name: string };
type PackageRecord = { id: number; name: string; project_id: number };
type StructureRecord = { id: number; name: string; package_id: number };
type ExplorerGroup = {
  id: number;
  name: string;
  projectName: string;
  packageName: string;
  drawings: DrawingRecord[];
};
type CalibrationRecord = {
  id: number;
  points: Point[];
  value: number;
  unit: 'ft' | 'in' | 'm' | 'mm';
};
type PageRecord = { id: string; name: string; kind: string; page_number?: number; calibrations?: CalibrationRecord[] };
type AnnotationType = 'rect' | 'polygon' | 'line' | 'point';
type ToolId = 'select' | 'pan' | 'calibrate' | 'rect' | 'polygon' | 'line' | 'point';
type Annotation = {
  id: string;
  type: AnnotationType;
  elementType: string;
  memberName: string;
  color: string;
  pointShape?: 'circle' | 'square';
  isHidden?: boolean;
  points: Point[];
  curingDurationDays?: number | null;
  curingStartDate?: string;
  curingEndDate?: string;
};
type ProgressRowInfo = {
  drawing_element_id: string;
  structure_id: number;
  structure_name: string;
  plan_name: string;
  page_name: string;
  element_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  elapsed_days: number;
  is_completed: boolean;
  today_status: 'added' | 'pending';
  gantt_days: Array<{
    date: string;
    did_cure_today: boolean;
    entry_id: number;
  }>;
};
type CuringRuleRecord = {
  id: number;
  element_name: string;
  geometry_type: string;
  required_curing_days: number;
  description?: string;
  is_active: boolean;
};
type ElementSortKey = 'memberName' | 'elementType' | 'curingDurationDays' | 'curingStartDate' | 'curingEndDate';
type ToolConfig = {
  elementType: string;
  memberName: string;
  color: string;
  pointShape: 'circle' | 'square';
};
type ElementEditDraft = {
  memberName: string;
  color: string;
};
type CustomElementDraft = {
  id?: number;
  element_name: string;
  description: string;
  required_curing_days: string;
  geometry_type: string;
};
type SelectionBox = { start: Point; end: Point };
type DrawingSession =
  | { tool: 'rect'; start: Point; current: Point }
  | { tool: 'polygon' | 'line'; points: Point[] }
  | { tool: 'calibrate'; start: Point; current: Point };
type PlanWorkspaceState = {
  structureId: number;
  drawingId: number;
  pageId: string;
  scale: number;
  position: { x: number; y: number };
  showDrawing: boolean;
  elementsDrawerOpen: boolean;
};

const TOOL_CONFIG_DEFAULT: ToolConfig = {
  elementType: 'Wall',
  memberName: '',
  color: '#3b82f6',
  pointShape: 'circle',
};

const DRAWING_TOOLS: ToolId[] = ['rect', 'polygon', 'line', 'point'];
const CALIBRATION_UNITS = ['ft', 'in', 'm', 'mm'] as const;
const COLOR_SWATCHES = ['#3b82f6', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#0f766e', '#ec4899', '#64748b'];
const PLAN_WORKSPACE_KEY = 'curingguard.plan.workspace';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const loadPlanWorkspace = (): PlanWorkspaceState | null => {
  try {
    const raw = localStorage.getItem(PLAN_WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      structureId: Number(parsed.structureId) || 0,
      drawingId: Number(parsed.drawingId) || 0,
      pageId: typeof parsed.pageId === 'string' ? parsed.pageId : '',
      scale: typeof parsed.scale === 'number' ? parsed.scale : 1,
      position: {
        x: Number(parsed.position?.x) || 0,
        y: Number(parsed.position?.y) || 0,
      },
      showDrawing: parsed.showDrawing !== false,
      elementsDrawerOpen: parsed.elementsDrawerOpen !== false,
    };
  } catch {
    return null;
  }
};

const savePlanWorkspace = (workspace: PlanWorkspaceState) => {
  localStorage.setItem(PLAN_WORKSPACE_KEY, JSON.stringify(workspace));
};

const viewportStateMatches = (
  currentScale: number,
  currentPosition: Point,
  currentShowDrawing: boolean,
  targetScale: number,
  targetPosition: Point,
  targetShowDrawing: boolean,
) => {
  const epsilon = 0.5;
  return Math.abs(currentScale - targetScale) < 0.001
    && Math.abs(currentPosition.x - targetPosition.x) < epsilon
    && Math.abs(currentPosition.y - targetPosition.y) < epsilon
    && currentShowDrawing === targetShowDrawing;
};

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

const formatDisplayDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).toUpperCase();
};

const calibrationPixelLength = (calibration: CalibrationRecord) => {
  const [start, end] = calibration.points;
  return Math.hypot(end.x - start.x, end.y - start.y);
};

const resolveCalibrationForPage = (pages: PageRecord[], activePageId: string) => {
  const activePage = pages.find((page) => page.id === activePageId);
  const direct = activePage?.calibrations?.[0];
  if (direct) return direct;
  for (const page of pages) {
    if (page.id === activePageId) continue;
    if (page.calibrations && page.calibrations.length > 0) return page.calibrations[0];
  }
  return null;
};

const calibratedPixels = (calibration: CalibrationRecord | null, desired: { ft: number; in: number; m: number; mm: number }) => {
  if (!calibration || !calibration.value) return null;
  const pxPerUnit = calibrationPixelLength(calibration) / calibration.value;
  const desiredValue = desired[calibration.unit];
  if (!Number.isFinite(pxPerUnit) || !Number.isFinite(desiredValue)) return null;
  return pxPerUnit * desiredValue;
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

const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-6) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
};

const hitTestAnnotation = (annotation: Annotation, point: Point, tolerance: number) => {
  if (annotation.type === 'point') {
    return Math.hypot(point.x - annotation.points[0].x, point.y - annotation.points[0].y) <= tolerance * 1.8;
  }

  if (annotation.type === 'rect') {
    const bounds = annotationBounds(annotation);
    return point.x >= bounds.minX - tolerance
      && point.x <= bounds.maxX + tolerance
      && point.y >= bounds.minY - tolerance
      && point.y <= bounds.maxY + tolerance;
  }

  if (annotation.type === 'polygon') {
    if (pointInPolygon(point, annotation.points)) return true;
    for (let index = 0; index < annotation.points.length; index += 1) {
      const start = annotation.points[index];
      const end = annotation.points[(index + 1) % annotation.points.length];
      if (distanceToSegment(point, start, end) <= tolerance) return true;
    }
    return false;
  }

  for (let index = 0; index < annotation.points.length - 1; index += 1) {
    if (distanceToSegment(point, annotation.points[index], annotation.points[index + 1]) <= tolerance) {
      return true;
    }
  }
  return false;
};

const intersectsSelectionBox = (annotation: Annotation, box: SelectionBox) => {
  const bounds = annotationBounds(annotation);
  const boxMinX = Math.min(box.start.x, box.end.x);
  const boxMaxX = Math.max(box.start.x, box.end.x);
  const boxMinY = Math.min(box.start.y, box.end.y);
  const boxMaxY = Math.max(box.start.y, box.end.y);
  return !(bounds.maxX < boxMinX || bounds.minX > boxMaxX || bounds.maxY < boxMinY || bounds.minY > boxMaxY);
};

export default function Plans() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const persistedWorkspaceRef = useRef<PlanWorkspaceState | null>(loadPlanWorkspace());
  const routeStructureId = Number(searchParams.get('structureId') || '0');
  const routeDrawingId = Number(searchParams.get('drawingId') || '0');
  const persistedWorkspace = persistedWorkspaceRef.current;
  const initialStructureId = routeStructureId || persistedWorkspace?.structureId || 0;
  const requestedDrawingId = routeDrawingId || persistedWorkspace?.drawingId || 0;
  const currentUser = authService.getCurrentUser();
  const currentUserId = currentUser?.user_id || 0;
  const isContractor = currentUser?.role === 'contractor';
  const [activeTool, setActiveTool] = useState<ToolId>('select');
  const [treeOpen, setTreeOpen] = useState(false);
  const [elementsDrawerOpen, setElementsDrawerOpen] = useState(persistedWorkspace?.elementsDrawerOpen !== false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creatingBlankPage, setCreatingBlankPage] = useState(false);
  const [refreshingElements, setRefreshingElements] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'existing' | 'create'>('existing');
  const [showDrawing, setShowDrawing] = useState(true);
  const [thumbnailHover, setThumbnailHover] = useState(false);
  const [activeStructureId, setActiveStructureId] = useState(initialStructureId);
  const [explorerGroups, setExplorerGroups] = useState<ExplorerGroup[]>([]);
  const [expandedStructureIds, setExpandedStructureIds] = useState<number[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [structures, setStructures] = useState<StructureRecord[]>([]);
  const [selectedUploadStructureId, setSelectedUploadStructureId] = useState<number>(0);
  const [selectedUploadProjectId, setSelectedUploadProjectId] = useState<number>(0);
  const [selectedUploadPackageId, setSelectedUploadPackageId] = useState<number>(0);
  const [newStructureName, setNewStructureName] = useState('');
  const [pendingUploadContext, setPendingUploadContext] = useState<{
    structureId?: number;
    createStructure?: boolean;
    projectId?: number;
    packageId?: number;
    structureName?: string;
  } | null>(null);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [activeDrawingId, setActiveDrawingId] = useState(requestedDrawingId);
  const [activeDrawingName, setActiveDrawingName] = useState('');
  const [activePageId, setActivePageId] = useState('');
  const [activePageName, setActivePageName] = useState('');
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [pageThumbnails, setPageThumbnails] = useState<Record<string, string>>({});
  const [annotationsByPage, setAnnotationsByPage] = useState<Record<string, Annotation[]>>({});
  const [progressRowByElementId, setProgressRowByElementId] = useState<Record<string, ProgressRowInfo>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [curingRules, setCuringRules] = useState<CuringRuleRecord[]>([]);
  const [elementSort, setElementSort] = useState<{ key: ElementSortKey; direction: 'asc' | 'desc' }>({
    key: 'memberName',
    direction: 'asc',
  });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 1000 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [mouseViewport, setMouseViewport] = useState({ x: 0, y: 0, visible: false });
  const [mousePage, setMousePage] = useState<Point>({ x: 0, y: 0 });
  const [cursorContrastColor, setCursorContrastColor] = useState<'black' | 'white'>('black');
  const [selectedInfoPosition, setSelectedInfoPosition] = useState({ x: 116, y: 118 });
  const [selectedInfoClosed, setSelectedInfoClosed] = useState(false);
  const [selectedInfoHovered, setSelectedInfoHovered] = useState(false);
  const [selectedInfoDrag, setSelectedInfoDrag] = useState<{ active: boolean; offsetX: number; offsetY: number }>({
    active: false,
    offsetX: 0,
    offsetY: 0,
  });
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectionToggleMode, setSelectionToggleMode] = useState(false);
  const [drawingSession, setDrawingSession] = useState<DrawingSession | null>(null);
  const [toolConfigDraft, setToolConfigDraft] = useState<ToolConfig>(TOOL_CONFIG_DEFAULT);
  const [activeToolConfig, setActiveToolConfig] = useState<ToolConfig | null>(null);
  const [toolModalOpen, setToolModalOpen] = useState(false);
  const [calibrationModalOpen, setCalibrationModalOpen] = useState(false);
  const [pendingCalibrationLine, setPendingCalibrationLine] = useState<[Point, Point] | null>(null);
  const [calibrationDraft, setCalibrationDraft] = useState<{ value: string; unit: (typeof CALIBRATION_UNITS)[number] }>({ value: '', unit: 'ft' });
  const [elementEditModalOpen, setElementEditModalOpen] = useState(false);
  const [elementEditDraft, setElementEditDraft] = useState<ElementEditDraft>({ memberName: '', color: TOOL_CONFIG_DEFAULT.color });
  const [elementsLibraryModalOpen, setElementsLibraryModalOpen] = useState(false);
  const [editingCustomElementId, setEditingCustomElementId] = useState<number | null>(null);
  const [customElementDraft, setCustomElementDraft] = useState<CustomElementDraft>({ element_name: '', description: '', required_curing_days: '', geometry_type: 'area' });
  const [inlineCreateElement, setInlineCreateElement] = useState(false);
  const [inlineElementDraft, setInlineElementDraft] = useState<CustomElementDraft>({ element_name: '', description: '', required_curing_days: '', geometry_type: 'area' });
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const planRootRef = useRef<HTMLDivElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbnailRailRef = useRef<HTMLDivElement>(null);
  const dateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const bulkStartDateInputRef = useRef<HTMLInputElement | null>(null);
  const restoredViewportKeyRef = useRef('');
  const workspaceRestoreReadyRef = useRef(false);
  const viewportRestoreAppliedRef = useRef(false);
  const pendingViewportRestoreRef = useRef<PlanWorkspaceState | null>(null);

  const currentAnnotations = annotationsByPage[activePageId] || [];
  const selectedAnnotations = currentAnnotations.filter((annotation) => selectedIds.includes(annotation.id));
  const singleSelectedAnnotation = selectedAnnotations.length === 1 ? selectedAnnotations[0] : null;
  const singleSelectedProgress = singleSelectedAnnotation ? progressRowByElementId[singleSelectedAnnotation.id] : null;
  const filteredPackages = packages.filter((pkg) => pkg.project_id === selectedUploadProjectId);
  const activeRuleMap = curingRules.reduce<Record<string, number>>((acc, rule) => {
    if (!rule.is_active) return acc;
    const byName = rule.element_name?.trim().toLowerCase();
    const byGeometry = rule.geometry_type?.trim().toLowerCase();
    if (byName) acc[byName] = rule.required_curing_days;
    if (byGeometry && acc[byGeometry] === undefined) acc[byGeometry] = rule.required_curing_days;
    return acc;
  }, {});
  const sortedAnnotations = [...currentAnnotations].sort((left, right) => {
    const factor = elementSort.direction === 'asc' ? 1 : -1;
    const leftValue = left[elementSort.key];
    const rightValue = right[elementSort.key];

    if (elementSort.key === 'curingDurationDays') {
      return (((leftValue as number | null | undefined) ?? -1) - ((rightValue as number | null | undefined) ?? -1)) * factor;
    }

    return String(leftValue || '').localeCompare(String(rightValue || ''), undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
  const selectedCount = selectedIds.length;
  const allSelected = currentAnnotations.length > 0 && selectedCount === currentAnnotations.length;
  const appliedCalibration = resolveCalibrationForPage(pages, activePageId);
  const calibratedLineStroke = calibratedPixels(appliedCalibration, { ft: 1.5, in: 18, m: 0.45, mm: 460 });
  const calibratedPointSize = calibratedPixels(appliedCalibration, { ft: 2, in: 24, m: 0.62, mm: 620 });
  const allowedGeometryType = activeTool === 'line' ? 'line' : activeTool === 'point' ? 'point' : 'area';
  const elementTypeOptions = curingRules
    .filter((rule) => rule.is_active && (rule.geometry_type || '').trim().toLowerCase() === allowedGeometryType)
    .map((rule) => rule.element_name)
    .filter((value, index, array) => !!value && array.indexOf(value) === index);

  const tools = [
    { id: 'select' as const, icon: MousePointer2, label: 'Selection' },
    { id: 'pan' as const, icon: Hand, label: 'Hand Pan' },
    { id: 'calibrate' as const, icon: DraftingCompass, label: 'Calibration' },
    { id: 'rect' as const, icon: Square, label: 'Rectangle' },
    { id: 'polygon' as const, icon: Triangle, label: 'Polygon' },
    { id: 'line' as const, icon: Slash, label: 'Line' },
    { id: 'point' as const, icon: MapPin, label: 'Point' },
  ];

  const geometryTypeForTool = (tool: ToolId) => (tool === 'line' ? 'line' : tool === 'point' ? 'point' : 'area');

  const refreshCustomElements = async () => {
    try {
      const rules = await libraryService.getRules();
      setCuringRules(rules || []);
      return rules || [];
    } catch (error) {
      console.error('Failed to load curing rules', error);
      return [];
    }
  };

  const refreshProgressRows = async () => {
    try {
      const response = await progressService.getRows();
      const nextMap: Record<string, ProgressRowInfo> = {};
      (response?.structures || []).forEach((group: any) => {
        (group.rows || []).forEach((row: ProgressRowInfo) => {
          nextMap[row.drawing_element_id] = row;
        });
      });
      setProgressRowByElementId(nextMap);
      return nextMap;
    } catch (error) {
      console.error('Failed to load progress rows', error);
      return {};
    }
  };

  const getNextCopyColor = (sourceColor: string) => {
    const currentIndex = COLOR_SWATCHES.findIndex((color) => color.toLowerCase() === sourceColor.toLowerCase());
    if (currentIndex >= 0) {
      return COLOR_SWATCHES[(currentIndex + 1) % COLOR_SWATCHES.length];
    }
    return COLOR_SWATCHES[0];
  };

  const cloneAnnotation = (annotation: Annotation): Annotation => ({
    ...annotation,
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `copy-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    memberName: `${annotation.memberName || annotation.elementType} copy`,
    color: getNextCopyColor(annotation.color),
    points: annotation.points.map((point) => ({ x: point.x + 18, y: point.y + 18 })),
  });

  const resetInlineElementDraft = (geometryType: string) => {
    setInlineElementDraft({ element_name: '', description: '', required_curing_days: '', geometry_type: geometryType });
  };

  const handleSaveCustomElement = async (draft: CustomElementDraft) => {
    if (!draft.element_name.trim() || !/^\d+$/.test(draft.required_curing_days)) {
      alert('Element name and curing period are required. Curing period must be digits only.');
      return null;
    }
    const payload = {
      element_name: draft.element_name.trim(),
      description: draft.description.trim(),
      required_curing_days: parseInt(draft.required_curing_days, 10),
      geometry_type: draft.geometry_type,
      is_active: true,
    };
    const saved = draft.id
      ? await libraryService.updateRule(draft.id, payload)
      : await libraryService.createRule(payload);
    const nextRules = await refreshCustomElements();
    return { saved, nextRules };
  };

  const handleDeleteCustomElement = async (ruleId: number) => {
    await libraryService.deleteRule(ruleId);
    await refreshCustomElements();
  };

  const handleOpenElementsLibrary = () => {
    setEditingCustomElementId(null);
    setCustomElementDraft({ element_name: '', description: '', required_curing_days: '', geometry_type: 'area' });
    setElementsLibraryModalOpen(true);
  };

  const persistAnnotations = async (pageId: string, annotations: Annotation[]) => {
    if (!activeDrawingId || !pageId) return;
    try {
      setSaveState('saving');
      const response = await hierarchyService.saveDrawingAnnotations(activeDrawingId, pageId, annotations);
      if (response.annotations) {
        setAnnotationsForPage(pageId, response.annotations);
      }
      void refreshProgressRows();
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 900);
    } catch (error) {
      console.error('Failed to save annotations', error);
      setSaveState('idle');
    }
  };

  const getFitViewportState = () => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const availableWidth = Math.max(viewport.clientWidth - 120, 300);
    const availableHeight = Math.max(viewport.clientHeight - 160, 240);
    const nextScale = Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height, 1);
    return {
      scale: nextScale,
      position: {
        x: Math.max((viewport.clientWidth - canvasSize.width * nextScale) / 2, 40),
        y: Math.max((viewport.clientHeight - canvasSize.height * nextScale) / 2, 40),
      },
    };
  };

  const fitToCanvas = () => {
    const nextViewport = getFitViewportState();
    if (!nextViewport) return null;
    setScale(nextViewport.scale);
    setPosition(nextViewport.position);
    return nextViewport;
  };

  const pagePointFromEvent = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left - position.x) / scale, 0, canvasSize.width),
      y: clamp((clientY - rect.top - position.y) / scale, 0, canvasSize.height),
    };
  };

  const setAnnotationsForPage = (pageId: string, annotations: Annotation[]) => {
    setAnnotationsByPage((current) => ({ ...current, [pageId]: annotations }));
  };

  const openToolConfig = (tool: ToolId) => {
    const geometryType = geometryTypeForTool(tool);
    const nextOptions = curingRules
      .filter((rule) => rule.is_active && (rule.geometry_type || '').trim().toLowerCase() === geometryType)
      .map((rule) => rule.element_name)
      .filter((value, index, array) => !!value && array.indexOf(value) === index);
    const fallbackElementType = nextOptions[0] || '';
    setToolConfigDraft((current) => ({
      ...current,
      elementType: nextOptions.includes(current.elementType) ? current.elementType : fallbackElementType,
    }));
    setInlineCreateElement(false);
    resetInlineElementDraft(geometryType);
    setActiveTool(tool);
    setDrawingSession(null);
    setSelectionBox(null);
    setSelectionStart(null);
    setSelectedIds([]);
    setToolModalOpen(true);
  };

  const toggleStructureGroup = (structureId: number) => {
    setExpandedStructureIds((current) => (
      current.includes(structureId)
        ? current.filter((id) => id !== structureId)
        : [...current, structureId]
    ));
  };

  const refreshExplorerData = async (preferredDrawingId?: number) => {
    const latestWorkspace = loadPlanWorkspace();

    if (!currentUserId) {
      setProjects([]);
      setPackages([]);
      setStructures([]);
      setExplorerGroups([]);
      return;
    }

    setLoading(true);
    try {
      const projectData = await hierarchyService.getProjects(currentUserId);
      setProjects(projectData);

      const packageLists = await Promise.all(projectData.map((project: ProjectRecord) => hierarchyService.getPackages(project.id)));
      const flatPackages: PackageRecord[] = packageLists.flat();
      setPackages(flatPackages);

      const structureLists = await Promise.all(flatPackages.map((pkg: PackageRecord) => hierarchyService.getStructures(pkg.id)));
      const flatStructures: StructureRecord[] = structureLists.flat();
      setStructures(flatStructures);

      const drawingLists = await Promise.all(flatStructures.map((structure: StructureRecord) => hierarchyService.getDrawings(structure.id)));
      const flatDrawings: DrawingRecord[] = drawingLists.flat();

      const nextGroups: ExplorerGroup[] = flatStructures.map((structure) => {
        const pkg = flatPackages.find((item) => item.id === structure.package_id);
        const project = projectData.find((item: ProjectRecord) => item.id === pkg?.project_id);
        return {
          id: structure.id,
          name: structure.name,
          packageName: pkg?.name || '',
          projectName: project?.name || '',
          drawings: flatDrawings.filter((drawing) => drawing.structure_id === structure.id),
        };
      });
      setExplorerGroups(nextGroups);
      setExpandedStructureIds((current) => {
        if (current.length > 0) return current;
        return nextGroups.map((group) => group.id);
      });

      if (preferredDrawingId) {
        const preferredDrawing = flatDrawings.find((drawing) => drawing.id === preferredDrawingId);
        if (preferredDrawing) {
          setActiveDrawingId(preferredDrawing.id);
          setActiveStructureId(preferredDrawing.structure_id);
          return;
        }
      }

      if (requestedDrawingId) {
        const requestedDrawing = flatDrawings.find((drawing) => drawing.id === requestedDrawingId);
        if (requestedDrawing) {
          setActiveDrawingId(requestedDrawing.id);
          setActiveStructureId(requestedDrawing.structure_id);
          return;
        }
      }

      if (latestWorkspace?.drawingId) {
        const persistedDrawing = flatDrawings.find((drawing) => drawing.id === latestWorkspace.drawingId);
        if (persistedDrawing) {
          setActiveDrawingId(persistedDrawing.id);
          setActiveStructureId(persistedDrawing.structure_id);
          return;
        }
      }

      if (!flatDrawings.length) {
        setActiveDrawingId(0);
        return;
      }

      if (latestWorkspace?.drawingId === 0 && latestWorkspace?.structureId === initialStructureId && !routeDrawingId) {
        setActiveDrawingId(0);
        return;
      }

      const firstMatchingDrawing = flatDrawings.find((drawing) => drawing.structure_id === initialStructureId) || flatDrawings[0];
      setActiveDrawingId((current) => current || firstMatchingDrawing.id);
      setActiveStructureId(firstMatchingDrawing.structure_id);
    } catch (error) {
      console.error('Failed to load explorer data', error);
    } finally {
      setLoading(false);
    }
  };

  const reloadCurrentPageAnnotations = async (drawingId: number, pageId: string, options?: { preserveSelection?: boolean }) => {
    try {
      setRefreshingElements(true);
      const response = await hierarchyService.getDrawingAnnotations(drawingId, pageId);
      setAnnotationsForPage(pageId, response.annotations || []);
      if (!options?.preserveSelection) setSelectedIds([]);
    } catch (error) {
      console.error('Failed to load annotations', error);
      setAnnotationsForPage(pageId, []);
      if (!options?.preserveSelection) setSelectedIds([]);
    } finally {
      setRefreshingElements(false);
    }
  };

  const finalizeDrawingAnnotation = (annotation: Annotation) => {
    const nextAnnotations = [...currentAnnotations, annotation];
    setAnnotationsForPage(activePageId, nextAnnotations);
    void persistAnnotations(activePageId, nextAnnotations);
    setSelectedIds([annotation.id]);
    setDrawingSession(null);
    if (annotation.type === 'polygon' || annotation.type === 'line') {
      setSelectionBox(null);
      setSelectionStart(null);
    }
  };

  const closeCurrentDrawing = () => {
    setActiveDrawingId(0);
    setActiveDrawingName('');
    setPages([]);
    setActivePageId('');
    setActivePageName('');
    setPdfDocument(null);
    setImageObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPageThumbnails({});
    setAnnotationsByPage({});
    setSelectedIds([]);
    setDrawingSession(null);
    setSelectionBox(null);
    setSelectionStart(null);
    setActiveTool('select');
    setActiveToolConfig(null);
    setToolModalOpen(false);
    setCalibrationModalOpen(false);
    setPendingCalibrationLine(null);
    setElementEditModalOpen(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    restoredViewportKeyRef.current = '';
    viewportRestoreAppliedRef.current = false;
    pendingViewportRestoreRef.current = null;
    savePlanWorkspace({
      structureId: activeStructureId,
      drawingId: 0,
      pageId: '',
      scale: 1,
      position: { x: 0, y: 0 },
      showDrawing,
      elementsDrawerOpen,
    });
    navigate(activeStructureId ? `/plans?structureId=${activeStructureId}` : '/plans', { replace: true });
  };

  useEffect(() => {
    void refreshExplorerData();
  }, [currentUserId, requestedDrawingId]);

  useEffect(() => {
    void refreshCustomElements();
  }, []);

  useEffect(() => {
    void refreshProgressRows();
  }, []);

  useEffect(() => {
    if (singleSelectedAnnotation) {
      setSelectedInfoClosed(false);
    }
  }, [singleSelectedAnnotation?.id]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === planRootRef.current);
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    if (!selectedInfoDrag.active) return;
    const handlePointerMove = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const nextX = clamp(event.clientX - selectedInfoDrag.offsetX, 16, rect.width - 300);
      const nextY = clamp(event.clientY - selectedInfoDrag.offsetY, 16, rect.height - 110);
      setSelectedInfoPosition({ x: nextX, y: nextY });
    };
    const handlePointerUp = () => {
      setSelectedInfoDrag((current) => ({ ...current, active: false }));
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [selectedInfoDrag]);

  useEffect(() => {
    const fetchPagesAndAsset = async () => {
      if (!activeDrawingId) {
        setPages([]);
        setActivePageId('');
        setActivePageName('');
        setPdfDocument(null);
        setImageObjectUrl(null);
        return;
      }

      try {
        setLoading(true);
        const latestWorkspace = loadPlanWorkspace();
        const pageData = await hierarchyService.getDrawingPages(activeDrawingId);
        const fileBlob = pageData.has_source_file
          ? await hierarchyService.getDrawingFile(activeDrawingId)
          : null;

        const pageList = pageData.pages || [];
        const restoredPage = latestWorkspace?.drawingId === activeDrawingId
          ? pageList.find((page: PageRecord) => page.id === latestWorkspace.pageId)
          : null;
        const initialPage = restoredPage || pageList[0] || null;
        setPages(pageList);
        setActiveDrawingName(pageData.drawing_name || '');
        setActiveStructureId(pageData.structure_id || 0);
        setActivePageId(initialPage?.id || '');
        setActivePageName(initialPage?.name || '');
        setPageThumbnails({});
        setAnnotationsByPage({});
        setSelectedIds([]);
        setDrawingSession(null);
        setToolModalOpen(false);
        setElementEditModalOpen(false);
        setActiveToolConfig(null);
        setActiveTool('select');

        if (!fileBlob) {
          setPdfDocument(null);
          setImageObjectUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
        } else if ((fileBlob.type || '').startsWith('image/')) {
          setPdfDocument(null);
          const nextObjectUrl = URL.createObjectURL(fileBlob);
          setImageObjectUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return nextObjectUrl;
          });
        } else {
          setImageObjectUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
          const typedArray = new Uint8Array(await fileBlob.arrayBuffer());
          const loadingTask = getDocument({ data: typedArray });
          const pdf = await loadingTask.promise;
          setPdfDocument(pdf);
        }
      } catch (error) {
        console.error('Failed to load plan asset', error);
        setPages([]);
        setPdfDocument(null);
        setImageObjectUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPagesAndAsset();
  }, [activeDrawingId]);

  useEffect(() => {
    const activePage = pages.find((page) => page.id === activePageId);
    if (!activePage || !activeDrawingId) return;

    viewportRestoreAppliedRef.current = false;
    pendingViewportRestoreRef.current = null;
    setActivePageName(activePage.name);
    setSelectedIds([]);
    setDrawingSession(null);
    setSelectionBox(null);
    setSelectionStart(null);
    setActiveTool('select');
    setActiveToolConfig(null);
    setToolModalOpen(false);
    setCalibrationModalOpen(false);
    setPendingCalibrationLine(null);
    setElementEditModalOpen(false);
    void reloadCurrentPageAnnotations(activeDrawingId, activePage.id);
  }, [activePageId, activeDrawingId, pages]);

  useEffect(() => {
    const renderActivePage = async () => {
      const canvas = renderCanvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      const activePage = pages.find((page) => page.id === activePageId);
      if (!activePage) {
        canvas.width = 1;
        canvas.height = 1;
        setCanvasSize({ width: 1, height: 1 });
        context.clearRect(0, 0, 1, 1);
        return;
      }

      if (activePage.kind === 'blank') {
        canvas.width = 1400;
        canvas.height = 900;
        setCanvasSize({ width: 1400, height: 900 });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = '#d1d5db';
        context.lineWidth = 2;
        context.strokeRect(0, 0, canvas.width, canvas.height);
        return;
      }

      if (activePage.kind === 'image' && imageObjectUrl) {
        const image = new Image();
        image.onload = () => {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          setPageThumbnails((current) => ({ ...current, [activePage.id]: imageObjectUrl }));
        };
        image.src = imageObjectUrl;
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

    void renderActivePage();
  }, [activePageId, pages, pdfDocument, imageObjectUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !canvasSize.width || !canvasSize.height || !activePageId) return;

    const restoreKey = `${activeDrawingId}:${activePageId}:${canvasSize.width}x${canvasSize.height}`;
    if (restoredViewportKeyRef.current === restoreKey) return;

    const workspace = loadPlanWorkspace();
    if (workspace && workspace.drawingId === activeDrawingId && workspace.pageId === activePageId) {
      const nextWorkspace = {
        ...workspace,
        scale: workspace.scale || 1,
        position: workspace.position || { x: 0, y: 0 },
        showDrawing: workspace.showDrawing !== false,
      };
      pendingViewportRestoreRef.current = nextWorkspace;
      restoredViewportKeyRef.current = restoreKey;
      viewportRestoreAppliedRef.current = false;
      setScale(nextWorkspace.scale);
      setPosition(nextWorkspace.position);
      setShowDrawing(nextWorkspace.showDrawing);
      return;
    }

    const fittedViewport = getFitViewportState();
    if (!fittedViewport) return;
    pendingViewportRestoreRef.current = {
      structureId: activeStructureId,
      drawingId: activeDrawingId,
      pageId: activePageId,
      scale: fittedViewport.scale,
      position: fittedViewport.position,
      showDrawing: true,
      elementsDrawerOpen,
    };
    restoredViewportKeyRef.current = restoreKey;
    viewportRestoreAppliedRef.current = false;
    fitToCanvas();
    setShowDrawing(true);
  }, [canvasSize.width, canvasSize.height, activeStructureId, activeDrawingId, activePageId]);

  useEffect(() => {
    const pendingRestore = pendingViewportRestoreRef.current;
    if (!pendingRestore) return;
    if (pendingRestore.drawingId !== activeDrawingId || pendingRestore.pageId !== activePageId) return;
    if (!viewportStateMatches(
      scale,
      position,
      showDrawing,
      pendingRestore.scale,
      pendingRestore.position,
      pendingRestore.showDrawing,
    )) return;

    viewportRestoreAppliedRef.current = true;
    pendingViewportRestoreRef.current = null;
  }, [activeDrawingId, activePageId, scale, position, showDrawing]);

  useEffect(() => {
    const imagePages = pages.filter((page) => page.kind === 'image');
    if (imageObjectUrl && imagePages.length > 0) {
      setPageThumbnails((current) => {
        const next = { ...current };
        for (const page of imagePages) {
          if (!next[page.id]) next[page.id] = imageObjectUrl;
        }
        return next;
      });
      return;
    }

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

    void buildThumbnail();
  }, [pages, pageThumbnails, pdfDocument, imageObjectUrl]);

  useEffect(() => {
    return () => {
      if (pdfDocument?.destroy) pdfDocument.destroy();
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    };
  }, [pdfDocument, imageObjectUrl]);

  useEffect(() => {
    if (loading) return;
    if (!activeStructureId) return;
    if (activeDrawingId > 0 && !activePageId) return;
    if (!workspaceRestoreReadyRef.current && activeDrawingId > 0) return;
    const pendingRestore = pendingViewportRestoreRef.current;
    if (activeDrawingId > 0 && pendingRestore && pendingRestore.drawingId === activeDrawingId && pendingRestore.pageId === activePageId) return;
    if (activeDrawingId > 0 && !viewportRestoreAppliedRef.current) return;
    const nextWorkspace = {
      structureId: activeStructureId,
      drawingId: activeDrawingId,
      pageId: activePageId,
      scale,
      position,
      showDrawing,
      elementsDrawerOpen,
    };
    savePlanWorkspace(nextWorkspace);
    persistedWorkspaceRef.current = nextWorkspace;
  }, [activeStructureId, activeDrawingId, activePageId, scale, position, showDrawing, elementsDrawerOpen]);

  useEffect(() => {
    if (!activeStructureId) return;
    if (activeDrawingId > 0 && !activePageId) return;
    workspaceRestoreReadyRef.current = true;
  }, [activeStructureId, activeDrawingId, activePageId]);

  useEffect(() => {
    const handleEscapeReset = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDrawingSession(null);
      setSelectionBox(null);
      setSelectionStart(null);
    };

    window.addEventListener('keydown', handleEscapeReset);
    return () => window.removeEventListener('keydown', handleEscapeReset);
  }, []);

  const executeZoom = (targetScale: number, pointerX?: number, pointerY?: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const anchorX = pointerX ?? rect.width / 2;
    const anchorY = pointerY ?? rect.height / 2;
    const newScale = clamp(targetScale, 0.05, 10);
    const mouseX = (anchorX - position.x) / scale;
    const mouseY = (anchorY - position.y) / scale;
    setScale(newScale);
    setPosition({
      x: anchorX - mouseX * newScale,
      y: anchorY - mouseY * newScale,
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    executeZoom(scale * zoomFactor, e.clientX - rect.left, e.clientY - rect.top);
  };

  const resolveCursorContrastColor = (pagePoint: Point) => {
    const canvas = renderCanvasRef.current;
    if (!canvas || !showDrawing) return 'white' as const;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 'white' as const;
    const sampleX = clamp(Math.round(pagePoint.x), 0, Math.max(canvas.width - 1, 0));
    const sampleY = clamp(Math.round(pagePoint.y), 0, Math.max(canvas.height - 1, 0));
    const [r, g, b, a] = context.getImageData(sampleX, sampleY, 1, 1).data;
    if (a === 0) return 'white' as const;
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    return luminance >= 235 ? 'black' : 'white';
  };

  const updateMouseTracking = (e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const nextPagePoint = pagePointFromEvent(e.clientX, e.clientY);
    setMouseViewport({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
    setMousePage(nextPagePoint);
    setCursorContrastColor(resolveCursorContrastColor(nextPagePoint));
  };

  const startSelection = (point: Point, ctrlKey: boolean) => {
    setSelectionStart(point);
    setSelectionBox({ start: point, end: point });
    setSelectionToggleMode(ctrlKey);
  };

  const finalizeSelection = (endPoint: Point) => {
    if (!selectionStart || !selectionBox) return;
    const tiny = Math.hypot(endPoint.x - selectionStart.x, endPoint.y - selectionStart.y) < 4 / Math.max(scale, 0.3);

    if (tiny) {
      const tolerance = 8 / Math.max(scale, 0.3);
      const hit = [...currentAnnotations].reverse().find((annotation) => hitTestAnnotation(annotation, endPoint, tolerance));
      if (selectionToggleMode) {
        if (!hit) {
          setSelectionBox(null);
          setSelectionStart(null);
          return;
        }
        setSelectedIds((current) => current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id]);
      } else {
        setSelectedIds(hit ? [hit.id] : []);
      }
    } else {
      const hits = currentAnnotations.filter((annotation) => intersectsSelectionBox(annotation, { start: selectionStart, end: endPoint })).map((annotation) => annotation.id);
      if (selectionToggleMode) {
        setSelectedIds((current) => {
          const next = new Set(current);
          for (const id of hits) {
            if (next.has(id)) next.delete(id);
            else next.add(id);
          }
          return Array.from(next);
        });
      } else {
        setSelectedIds(hits);
      }
    }

    setSelectionBox(null);
    setSelectionStart(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    updateMouseTracking(e);
    const pagePoint = pagePointFromEvent(e.clientX, e.clientY);

    if (e.pointerType === 'mouse' && (e.button === 1 || activeTool === 'pan')) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - position.x, y: e.clientY - position.y });
      return;
    }

    if (activeTool === 'select') {
      startSelection(pagePoint, e.ctrlKey || e.metaKey);
      return;
    }

    if (activeTool === 'calibrate') {
      if (!drawingSession || drawingSession.tool !== 'calibrate') {
        setDrawingSession({ tool: 'calibrate', start: pagePoint, current: pagePoint });
      } else {
        setPendingCalibrationLine([drawingSession.start, pagePoint]);
        setCalibrationDraft({ value: '', unit: 'ft' });
        setCalibrationModalOpen(true);
        setDrawingSession(null);
      }
      return;
    }

    if (activeTool === 'point' && activeToolConfig) {
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        type: 'point',
        elementType: activeToolConfig.elementType,
        memberName: activeToolConfig.memberName,
        color: activeToolConfig.color,
        pointShape: activeToolConfig.pointShape,
        points: [pagePoint],
      };
      finalizeDrawingAnnotation(annotation);
      return;
    }

    if (activeTool === 'rect' && activeToolConfig) {
      if (!drawingSession || drawingSession.tool !== 'rect') {
        setDrawingSession({ tool: 'rect', start: pagePoint, current: pagePoint });
      } else {
        finalizeDrawingAnnotation({
          id: crypto.randomUUID(),
          type: 'rect',
          elementType: activeToolConfig.elementType,
          memberName: activeToolConfig.memberName,
          color: activeToolConfig.color,
          points: [drawingSession.start, pagePoint],
        });
      }
      return;
    }

    if ((activeTool === 'polygon' || activeTool === 'line') && activeToolConfig) {
      if (!drawingSession || drawingSession.tool !== activeTool) {
        setDrawingSession({ tool: activeTool, points: [pagePoint] });
      } else {
        setDrawingSession({ ...drawingSession, points: [...drawingSession.points, pagePoint] });
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    if (!activeToolConfig || !drawingSession) return;
    if (drawingSession.tool !== 'polygon' && drawingSession.tool !== 'line') return;

    const minimumPoints = drawingSession.tool === 'polygon' ? 3 : 2;
    if (drawingSession.points.length < minimumPoints) {
      setDrawingSession(null);
      return;
    }

    finalizeDrawingAnnotation({
      id: crypto.randomUUID(),
      type: drawingSession.tool,
      elementType: activeToolConfig.elementType,
      memberName: activeToolConfig.memberName,
      color: activeToolConfig.color,
      points: drawingSession.points,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    updateMouseTracking(e);
    const pagePoint = pagePointFromEvent(e.clientX, e.clientY);

    if (isPanning && e.pointerType === 'mouse') {
      setPosition({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
      return;
    }

    if (activeTool === 'select' && selectionStart) {
      setSelectionBox({ start: selectionStart, end: pagePoint });
      return;
    }

    if (drawingSession?.tool === 'rect') {
      setDrawingSession({ ...drawingSession, current: pagePoint });
      return;
    }

    if (drawingSession?.tool === 'calibrate') {
      setDrawingSession({ ...drawingSession, current: pagePoint });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pagePoint = pagePointFromEvent(e.clientX, e.clientY);
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (activeTool === 'select' && selectionStart) {
      finalizeSelection(pagePoint);
    }
  };

  const handleOpenUploadModal = () => {
    const defaultProjectId = projects[0]?.id || 0;
    const defaultPackageId = packages.find((pkg) => pkg.project_id === defaultProjectId)?.id || 0;
    setUploadMode('existing');
    setSelectedUploadStructureId(activeStructureId || structures[0]?.id || 0);
    setSelectedUploadProjectId(defaultProjectId);
    setSelectedUploadPackageId(defaultPackageId);
    setNewStructureName('');
    setUploadModalOpen(true);
  };

  const handleUploadModalSelect = () => {
    if (isContractor || uploadMode === 'existing') {
      if (!selectedUploadStructureId) {
        alert('Select a structure first.');
        return;
      }
      setPendingUploadContext({ structureId: selectedUploadStructureId });
    } else {
      if (!selectedUploadProjectId || !selectedUploadPackageId || !newStructureName.trim()) {
        alert('Select project, package, and enter structure name.');
        return;
      }
      setPendingUploadContext({
        createStructure: true,
        projectId: selectedUploadProjectId,
        packageId: selectedUploadPackageId,
        structureName: newStructureName.trim(),
      });
    }

    setUploadModalOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadContext) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    if (pendingUploadContext.structureId) {
      formData.append('structure_id', String(pendingUploadContext.structureId));
    }
    if (pendingUploadContext.createStructure) {
      formData.append('create_structure', 'true');
      formData.append('project_id', String(pendingUploadContext.projectId));
      formData.append('package_id', String(pendingUploadContext.packageId));
      formData.append('structure_name', pendingUploadContext.structureName || '');
    }

    try {
      setUploading(true);
      const result = await hierarchyService.uploadManagedDrawing(formData);
      await refreshExplorerData(result.drawing_id);
      setActiveStructureId(result.structure_id || 0);
      alert('Plan upload complete.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to upload plan.');
    } finally {
      setUploading(false);
      setPendingUploadContext(null);
      setTreeOpen(false);
      e.target.value = '';
    }
  };

  const handleCreateBlankPage = async () => {
    if (!activeDrawingId) return;
    const name = window.prompt('Enter blank sheet name:');
    if (!name || !name.trim()) return;
    try {
      setCreatingBlankPage(true);
      const result = await hierarchyService.createBlankDrawingPage(activeDrawingId, name.trim());
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

  const handleRenameActiveDrawing = async (drawingId: number, currentName: string) => {
    const name = window.prompt('Rename plan/file', currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    try {
      await hierarchyService.updateDrawing(drawingId, { name: name.trim() });
      setExplorerGroups((current) => current.map((group) => ({
        ...group,
        drawings: group.drawings.map((drawing) => drawing.id === drawingId ? { ...drawing, name: name.trim() } : drawing),
      })));
      if (activeDrawingId === drawingId) setActiveDrawingName(name.trim());
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to rename plan.');
    }
  };

  const handleRenamePage = async (pageId: string, currentName: string) => {
    if (!activeDrawingId) return;
    const name = window.prompt('Rename page', currentName);
    if (!name || !name.trim() || name.trim() === currentName) return;
    try {
      const response = await hierarchyService.updateDrawingPage(activeDrawingId, pageId, name.trim());
      const updatedPage = response.page as PageRecord;
      setPages((current) => current.map((page) => page.id === updatedPage.id ? { ...page, ...updatedPage } : page));
      if (activePageId === updatedPage.id) setActivePageName(updatedPage.name);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to rename page.');
    }
  };

  const handleDeleteSelectedElements = async () => {
    if (!activeDrawingId || !activePageId || selectedIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected element${selectedIds.length > 1 ? 's' : ''}?`);
    if (!confirmed) return;

    try {
      await hierarchyService.deleteDrawingAnnotations(activeDrawingId, activePageId, selectedIds);
      const nextAnnotations = currentAnnotations.filter((annotation) => !selectedIds.includes(annotation.id));
      setAnnotationsForPage(activePageId, nextAnnotations);
      setSelectedIds([]);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete selected elements.');
    }
  };

  const handleCopySelectedElements = async () => {
    if (!activePageId || selectedAnnotations.length === 0) return;
    const copies = selectedAnnotations.map(cloneAnnotation);
    const nextAnnotations = [...currentAnnotations, ...copies];
    setAnnotationsForPage(activePageId, nextAnnotations);
    setSelectedIds(copies.map((annotation) => annotation.id));
    await persistAnnotations(activePageId, nextAnnotations);
  };

  const handleSelectedInfoPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest('button')) return;
    event.preventDefault();
    setSelectedInfoDrag({
      active: true,
      offsetX: event.clientX - selectedInfoPosition.x,
      offsetY: event.clientY - selectedInfoPosition.y,
    });
  };

  const handleOpenEditSelectedElements = () => {
    if (selectedAnnotations.length === 0) return;

    const first = selectedAnnotations[0];
    const sameName = selectedAnnotations.every((annotation) => annotation.memberName === first.memberName);
    const sameColor = selectedAnnotations.every((annotation) => annotation.color === first.color);
    setElementEditDraft({
      memberName: sameName ? first.memberName : '',
      color: sameColor ? first.color : first.color,
    });
    setElementEditModalOpen(true);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === planRootRef.current) {
        await document.exitFullscreen();
        return;
      }
      await planRootRef.current?.requestFullscreen();
    } catch (error) {
      console.error('Failed to toggle fullscreen', error);
    }
  };

  const handleRefreshCurrentPage = async () => {
    if (!activeDrawingId || !activePageId) return;
    await reloadCurrentPageAnnotations(activeDrawingId, activePageId);
  };

  const handleUpdateAnnotationMeta = async (
    elementId: string,
    patch: Partial<Pick<Annotation, 'memberName' | 'color' | 'elementType' | 'curingStartDate' | 'isHidden'>>,
  ) => {
    if (!activeDrawingId || !activePageId) return;

    const optimistic = currentAnnotations.map((annotation) => {
      if (annotation.id !== elementId) return annotation;
      const nextElementType = patch.elementType ?? annotation.elementType;
      const nextStartDate = patch.curingStartDate ?? annotation.curingStartDate ?? '';
      const fallbackDuration = activeRuleMap[nextElementType.trim().toLowerCase()] ?? annotation.curingDurationDays ?? null;
      const nextEndDate = nextStartDate && typeof fallbackDuration === 'number'
        ? new Date(new Date(`${nextStartDate}T00:00:00`).getTime() + fallbackDuration * 86400000).toISOString().slice(0, 10)
        : '';
      return {
        ...annotation,
        ...patch,
        curingDurationDays: fallbackDuration,
        curingEndDate: nextEndDate,
      };
    });

    setAnnotationsForPage(activePageId, optimistic);

    try {
      const response = await hierarchyService.updateDrawingAnnotation(activeDrawingId, activePageId, elementId, {
        memberName: patch.memberName,
        color: patch.color,
        elementType: patch.elementType,
        curingStartDate: patch.curingStartDate,
        isHidden: patch.isHidden,
      });
      const updated = response.annotation;
      setAnnotationsForPage(activePageId, optimistic.map((annotation) => (
        annotation.id === elementId ? updated : annotation
      )));
      void refreshProgressRows();
    } catch (error: any) {
      await reloadCurrentPageAnnotations(activeDrawingId, activePageId, { preserveSelection: true });
      alert(error.response?.data?.detail || 'Failed to update element.');
    }
  };

  const handleSortElements = (key: ElementSortKey) => {
    setElementSort((current) => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ));
  };

  const handleDrawerRowSelect = (annotationId: string, event: React.MouseEvent) => {
    const toggle = event.ctrlKey || event.metaKey;
    setActiveTool('select');
    setSelectedIds((current) => {
      if (!toggle) {
        if (current.includes(annotationId)) {
          if (current.length > 1) {
            return [annotationId];
          }
          return [];
        }
        return [annotationId];
      }
      if (current.includes(annotationId)) {
        return current.filter((id) => id !== annotationId);
      }
      return [...current, annotationId];
    });
  };

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(currentAnnotations.map((annotation) => annotation.id));
  };

  const handleShowAllElements = async () => {
    if (!activeDrawingId || !activePageId) return;
    await Promise.all(currentAnnotations.map((annotation) => (
      handleUpdateAnnotationMeta(annotation.id, { isHidden: false })
    )));
    await reloadCurrentPageAnnotations(activeDrawingId, activePageId, { preserveSelection: true });
  };

  const handleApplyStartDateToSelected = async (startDate: string) => {
    if (!activeDrawingId || !activePageId || selectedIds.length === 0 || !startDate) return;
    await Promise.all(selectedIds.map((id) => (
      handleUpdateAnnotationMeta(id, { curingStartDate: startDate })
    )));
    await reloadCurrentPageAnnotations(activeDrawingId, activePageId, { preserveSelection: true });
  };

  const handleSaveCalibration = async () => {
    if (!activeDrawingId || !activePageId || !pendingCalibrationLine) return;
    const parsedValue = Number(calibrationDraft.value);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      alert('Enter a valid calibration value.');
      return;
    }

    try {
      const [start, end] = pendingCalibrationLine;
      const response = await hierarchyService.createPageCalibration(activeDrawingId, activePageId, {
        value: parsedValue,
        unit: calibrationDraft.unit,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
      const updatedPage = response.page as PageRecord;
      setPages((current) => current.map((page) => page.id === updatedPage.id ? { ...page, ...updatedPage } : page));
      if (activePageId === updatedPage.id) {
        setActivePageName(updatedPage.name);
      }
      setCalibrationModalOpen(false);
      setPendingCalibrationLine(null);
      setCalibrationDraft({ value: '', unit: 'ft' });
      setDrawingSession(null);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to save calibration.');
    }
  };

  const handleSaveEditedElements = async () => {
    if (!activePageId || selectedIds.length === 0) return;
    setElementEditModalOpen(false);
    await Promise.all(selectedIds.map((id) => handleUpdateAnnotationMeta(id, {
      memberName: elementEditDraft.memberName,
      color: elementEditDraft.color,
    })));
  };

  const handleDeletePage = async (pageId: string) => {
    if (!activeDrawingId) return;
    const page = pages.find((entry) => entry.id === pageId);
    if (!page) return;
    const confirmed = window.confirm(`Hide page "${page.name}" from this drawing?`);
    if (!confirmed) return;

    try {
      await hierarchyService.deleteDrawingPage(activeDrawingId, pageId);
      const nextPages = pages.filter((entry) => entry.id !== pageId);
      setPages(nextPages);
      setPageThumbnails((current) => {
        const next = { ...current };
        delete next[pageId];
        return next;
      });
      setAnnotationsByPage((current) => {
        const next = { ...current };
        delete next[pageId];
        return next;
      });
      if (activePageId === pageId) {
        const fallbackPage = nextPages[0];
        setActivePageId(fallbackPage?.id || '');
        setActivePageName(fallbackPage?.name || '');
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete page.');
    }
  };

  const handleThumbnailWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const rail = thumbnailRailRef.current;
    if (!rail) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      rail.scrollLeft += e.deltaY;
    }
  };

  const renderCursorGlyph = () => {
    if (!mouseViewport.visible) return null;
    const baseClass = 'pointer-events-none absolute z-40';
    const style = { left: mouseViewport.x + 10, top: mouseViewport.y + 10 };
    if (activeTool === 'rect') {
      return <div className={`${baseClass} h-3 w-4 rounded-[2px] border ${cursorContrastColor === 'black' ? 'border-black bg-black/15' : 'border-white bg-white/15'}`} style={style} />;
    }
    if (activeTool === 'polygon') {
      return <div className={`${baseClass} h-0 w-0 border-l-[8px] border-r-[8px] border-b-[14px] border-l-transparent border-r-transparent ${cursorContrastColor === 'black' ? 'border-b-black' : 'border-b-white'}`} style={style} />;
    }
    if (activeTool === 'line') {
      return <div className={`${baseClass} h-[2px] w-5 rotate-[-22deg] ${cursorContrastColor === 'black' ? 'bg-black' : 'bg-white'}`} style={style} />;
    }
    if (activeTool === 'calibrate') {
      return (
        <div className={baseClass} style={style}>
          <DraftingCompass className={`h-4 w-4 ${cursorContrastColor === 'black' ? 'text-black' : 'text-white'}`} />
        </div>
      );
    }
    if (activeTool === 'point') {
      return <div className={`${baseClass} h-2 w-2 rounded-full border ${cursorContrastColor === 'black' ? 'border-black bg-black/80' : 'border-white bg-white/80'}`} style={style} />;
    }
    return null;
  };

  const renderAnnotation = (annotation: Annotation) => {
    if (annotation.isHidden) return null;
    const selected = selectedIds.includes(annotation.id);
    const stroke = darken(annotation.color);
    const fill = rgba(annotation.color, selected ? 0.32 : 0.18);
    const strokeWidth = selected ? 3 : 2;

    if (annotation.type === 'rect') {
      const start = annotation.points[0];
      const end = annotation.points[1];
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);
      return (
        <g key={annotation.id}>
          <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          {annotation.memberName && <text x={x + 8} y={y + 20} fill={stroke} fontSize="15" fontWeight="700">{annotation.memberName}</text>}
        </g>
      );
    }

    if (annotation.type === 'polygon') {
      return (
        <g key={annotation.id}>
          <polygon
            points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {annotation.memberName && <text x={annotation.points[0].x + 8} y={annotation.points[0].y - 8} fill={stroke} fontSize="15" fontWeight="700">{annotation.memberName}</text>}
        </g>
      );
    }

    if (annotation.type === 'line') {
      const lineStrokeWidth = calibratedLineStroke ?? strokeWidth;
      return (
        <g key={annotation.id}>
          {selected && (
            <polyline
              points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke="rgba(0,0,0,0.92)"
              strokeWidth={lineStrokeWidth + 6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          <polyline
            points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth={lineStrokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {annotation.memberName && <text x={annotation.points[0].x + 8} y={annotation.points[0].y - 8} fill={stroke} fontSize="15" fontWeight="700">{annotation.memberName}</text>}
        </g>
      );
    }

    const pointSize = calibratedPointSize ?? 10;
    const halfPointSize = pointSize / 2;
    return (
      <g key={annotation.id}>
        {selected && (annotation.pointShape === 'square' ? (
          <rect
            x={annotation.points[0].x - halfPointSize - 4}
            y={annotation.points[0].y - halfPointSize - 4}
            width={pointSize + 8}
            height={pointSize + 8}
            fill="none"
            stroke="rgba(0,0,0,0.92)"
            strokeWidth={4}
          />
        ) : (
          <circle
            cx={annotation.points[0].x}
            cy={annotation.points[0].y}
            r={(pointSize / 2) + 4}
            fill="none"
            stroke="rgba(0,0,0,0.92)"
            strokeWidth={4}
          />
        ))}
        {annotation.pointShape === 'square' ? (
          <rect
            x={annotation.points[0].x - halfPointSize}
            y={annotation.points[0].y - halfPointSize}
            width={pointSize}
            height={pointSize}
            fill={stroke}
            stroke="#ffffff"
            strokeWidth={2}
          />
        ) : (
          <circle
            cx={annotation.points[0].x}
            cy={annotation.points[0].y}
            r={pointSize / 2}
            fill={stroke}
            stroke="#ffffff"
            strokeWidth={2}
          />
        )}
        {annotation.memberName && <text x={annotation.points[0].x + 10} y={annotation.points[0].y - 10} fill={stroke} fontSize="15" fontWeight="700">{annotation.memberName}</text>}
      </g>
    );
  };

  const renderDraft = () => {
    if (!drawingSession) return null;

    if (drawingSession.tool === 'rect') {
      if (!activeToolConfig) return null;
      const stroke = darken(activeToolConfig.color);
      const fill = rgba(activeToolConfig.color, 0.18);
      const x = Math.min(drawingSession.start.x, drawingSession.current.x);
      const y = Math.min(drawingSession.start.y, drawingSession.current.y);
      const width = Math.abs(drawingSession.current.x - drawingSession.start.x);
      const height = Math.abs(drawingSession.current.y - drawingSession.start.y);
      return <rect x={x} y={y} width={width} height={height} fill={fill} stroke={stroke} strokeWidth={2} strokeDasharray="8 6" />;
    }

    if (drawingSession.tool === 'calibrate') {
      return (
        <line
          x1={drawingSession.start.x}
          y1={drawingSession.start.y}
          x2={drawingSession.current.x}
          y2={drawingSession.current.y}
          stroke="#f7c58a"
          strokeWidth={1}
          strokeLinecap="round"
        />
      );
    }

    if (!activeToolConfig) return null;
    const stroke = darken(activeToolConfig.color);
    const fill = rgba(activeToolConfig.color, 0.18);
    const previewPoints = [...drawingSession.points, mousePage];
    return drawingSession.tool === 'polygon'
      ? <polygon points={previewPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill={fill} stroke={stroke} strokeWidth={2} strokeDasharray="8 6" />
      : <polyline points={previewPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="8 6" strokeLinejoin="round" strokeLinecap="round" />;
  };

  const renderThumbnail = (page: PageRecord) => {
    if (page.kind === 'blank') {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-[11px] font-black text-slate-400">
          Blank
        </div>
      );
    }

    const thumbnail = pageThumbnails[page.id];
    if (!thumbnail) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-black text-slate-400">
          Loading
        </div>
      );
    }

    return <img src={thumbnail} alt={page.name} className="h-full w-full rounded-xl object-contain bg-white" />;
  };

  const selectedElementTodayLabel = (() => {
    if (!singleSelectedAnnotation) return null;
    if (singleSelectedProgress) return singleSelectedProgress.today_status === 'added' ? 'Added Today' : 'Pending Today';
    if (!singleSelectedAnnotation.curingStartDate || !singleSelectedAnnotation.curingEndDate) return 'Not Scheduled';
    const today = new Date().toISOString().slice(0, 10);
    if (today < singleSelectedAnnotation.curingStartDate) return 'Upcoming';
    if (today > singleSelectedAnnotation.curingEndDate) return 'Completed';
    return 'Pending Today';
  })();

  const selectedElementTimeline = (() => {
    if (!singleSelectedAnnotation?.curingStartDate || !singleSelectedAnnotation?.curingEndDate) return [];
    const startDate = new Date(`${singleSelectedAnnotation.curingStartDate}T00:00:00`);
    const endDate = new Date(`${singleSelectedAnnotation.curingEndDate}T00:00:00`);
    const totalDays = Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 86400000), 0);
    return Array.from({ length: totalDays }, (_, index) => {
      const dayDate = new Date(startDate.getTime() + index * 86400000);
      const dayKey = dayDate.toISOString().slice(0, 10);
      const todayKey = new Date().toISOString().slice(0, 10);
      const progressDay = singleSelectedProgress?.gantt_days.find((entry) => entry.date === dayKey);
      const isToday = dayKey === todayKey;
      const isPast = dayKey < todayKey;
      let tone = 'upcoming';
      if (progressDay?.did_cure_today) tone = 'cured';
      else if (isPast) tone = 'missed';
      else if (isToday) tone = 'pending';
      return { dayKey, isToday, tone };
    });
  })();
  const isSelectedElementScheduled = Boolean(singleSelectedAnnotation?.curingStartDate && singleSelectedAnnotation?.curingEndDate);

  return (
    <div
      ref={planRootRef}
      className={`absolute inset-0 overflow-hidden bg-[#8f959d] font-sans ${isFullscreen ? 'z-[200] h-screen w-screen' : ''}`}
    >
      <div
        ref={viewportRef}
        className={`absolute inset-0 overflow-hidden ${isPanning || activeTool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-none'}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onPointerLeave={() => {
          setMouseViewport((current) => ({ ...current, visible: false }));
          setIsPanning(false);
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none' }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
        >
          <div
            className="absolute h-[20000px] w-[20000px] -left-[10000px] -top-[10000px] opacity-20"
            style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '40px 40px' }}
          />
          <canvas
            ref={renderCanvasRef}
            className="absolute bg-white shadow-2xl"
            style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px`, opacity: showDrawing ? 1 : 0 }}
          />
          <svg width={canvasSize.width} height={canvasSize.height} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="absolute overflow-visible">
            {(pages.find((page) => page.id === activePageId)?.calibrations || []).map((calibration) => {
              const [start, end] = calibration.points;
              const centerX = (start.x + end.x) / 2;
              const centerY = (start.y + end.y) / 2;
              return (
                <g key={calibration.id}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke="#f7c58a"
                    strokeWidth={1}
                    strokeLinecap="round"
                  />
                  <text x={centerX + 8} y={centerY - 8} fill="#c27a2c" fontSize="14" fontWeight="800">
                    {`${calibration.value} ${calibration.unit}`}
                  </text>
                </g>
              );
            })}
            {currentAnnotations.map(renderAnnotation)}
            {renderDraft()}
            {selectionBox && (
              <rect
                x={Math.min(selectionBox.start.x, selectionBox.end.x)}
                y={Math.min(selectionBox.start.y, selectionBox.end.y)}
                width={Math.abs(selectionBox.end.x - selectionBox.start.x)}
                height={Math.abs(selectionBox.end.y - selectionBox.start.y)}
                fill="rgba(59,130,246,0.12)"
                stroke="rgba(59,130,246,0.95)"
                strokeWidth={1.8}
                strokeDasharray="8 6"
              />
            )}
          </svg>
        </div>

        {singleSelectedAnnotation && !selectedInfoClosed && (
          <div
            className={`absolute z-20 w-[312px] rounded-[22px] border border-slate-200 bg-white/96 px-4 py-3 shadow-xl backdrop-blur ${selectedInfoDrag.active ? 'cursor-grabbing' : 'cursor-default'}`}
            style={{ left: selectedInfoPosition.x, top: selectedInfoPosition.y }}
            onPointerDown={handleSelectedInfoPointerDown}
            onPointerEnter={() => setSelectedInfoHovered(true)}
            onPointerLeave={() => setSelectedInfoHovered(false)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[28px] font-black leading-none tracking-tight text-slate-900">
                    {singleSelectedAnnotation.memberName || singleSelectedAnnotation.elementType}
                  </div>
                  {isSelectedElementScheduled && (
                    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                      selectedElementTodayLabel === 'Added Today'
                        ? 'bg-emerald-100 text-emerald-700'
                        : selectedElementTodayLabel === 'Completed'
                          ? 'bg-slate-200 text-slate-600'
                          : selectedElementTodayLabel === 'Upcoming'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                    }`}>
                      {selectedElementTodayLabel}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInfoClosed(true)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {isSelectedElementScheduled ? (
              <>
                <div className="mt-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                  <span>{formatDisplayDate(singleSelectedAnnotation.curingStartDate)}</span>
                  <span>{formatDisplayDate(singleSelectedAnnotation.curingEndDate)}</span>
                </div>
                <div className="mt-3 flex gap-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                  {selectedElementTimeline.length > 0 ? (
                    selectedElementTimeline.map((day) => (
                      <div
                        key={day.dayKey}
                        className={`h-6 min-w-0 flex-1 rounded-md border ${
                          day.isToday
                            ? 'border-slate-900 bg-white'
                            : day.tone === 'cured'
                              ? 'border-emerald-100 bg-emerald-200'
                              : day.tone === 'missed' || day.tone === 'pending'
                                ? 'border-red-100 bg-red-200'
                                : 'border-slate-200 bg-white'
                        }`}
                        title={day.dayKey}
                      />
                    ))
                  ) : (
                    <div className="w-full py-2 text-center text-xs font-bold text-slate-400">No gantt data</div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                Not Scheduled
              </div>
            )}
          </div>
        )}

        {mouseViewport.visible && !selectedInfoHovered && (
          <>
            <div className={`pointer-events-none absolute left-0 right-0 z-30 h-px ${cursorContrastColor === 'black' ? 'bg-black' : 'bg-white'}`} style={{ top: mouseViewport.y }} />
            <div className={`pointer-events-none absolute top-0 bottom-0 z-30 w-px ${cursorContrastColor === 'black' ? 'bg-black' : 'bg-white'}`} style={{ left: mouseViewport.x }} />
            <div className={`pointer-events-none absolute z-30 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border ${cursorContrastColor === 'black' ? 'border-black bg-black/15' : 'border-white bg-white/15'}`} style={{ left: mouseViewport.x, top: mouseViewport.y }} />
            {renderCursorGlyph()}
          </>
        )}
      </div>

      <div className="pointer-events-none absolute left-6 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <div className="pointer-events-auto flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/80 p-2.5 shadow-2xl backdrop-blur-xl">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => {
                if (DRAWING_TOOLS.includes(tool.id)) openToolConfig(tool.id);
                else {
                  setActiveTool(tool.id);
                  setDrawingSession(null);
                  setToolModalOpen(false);
                  if (tool.id !== 'select') setSelectedIds([]);
                }
              }}
              title={tool.label}
              className={`rounded-2xl p-3.5 transition-all ${activeTool === tool.id ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}
            >
              <tool.icon className="h-6 w-6" />
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/90 px-3 py-2 shadow-xl">
          <button
            onClick={() => setTreeOpen((current) => !current)}
            title="Toggle plan explorer"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          <button onClick={() => executeZoom(scale * 1.15)} className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => executeZoom(scale * 0.85)} className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={fitToCanvas} className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white">
            <ScanSearch className="h-4 w-4" />
          </button>
          <button onClick={() => setShowDrawing((current) => !current)} className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white">
            {showDrawing ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            onClick={() => void handleRefreshCurrentPage()}
            disabled={!activeDrawingId || !activePageId}
            title="Refresh page elements"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw
              className="h-4 w-4"
              style={refreshingElements ? { animation: 'spin 1.2s linear infinite', transformOrigin: '50% 50%', display: 'block' } : undefined}
            />
          </button>
          <button
            onClick={() => setElementsDrawerOpen((current) => !current)}
            title="Toggle elements drawer"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <FileText className="h-4 w-4" />
          </button>
          <button
            onClick={() => void handleToggleFullscreen()}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            onClick={closeCurrentDrawing}
            disabled={!activeDrawingId}
            title="Close current drawing"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={handleDeleteSelectedElements}
            disabled={selectedIds.length === 0}
            title="Delete selected elements"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenEditSelectedElements}
            disabled={selectedIds.length === 0}
            title="Edit selected elements"
            className="rounded-xl bg-slate-900 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PenSquare className="h-4 w-4" />
          </button>
          <button className="cursor-not-allowed rounded-xl bg-slate-900/60 p-2 text-slate-500" title="Grouping will be added next">
            <Layers3 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-[84px] z-20 -translate-x-1/2">
        <div className="flex items-center gap-3 whitespace-nowrap text-center text-[13px] font-black tracking-[0.08em] text-black/65">
          <span>{activeDrawingName || 'No plan selected'}</span>
          <span className="text-black/35">/</span>
          <span>{activePageName || 'No page selected'}</span>
          {(saveState === 'saving' || saveState === 'saved') && (
            <>
              <span className="text-black/30">/</span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-black/45">
                {saveState === 'saving' ? 'Saving' : 'Saved'}
              </span>
            </>
          )}
        </div>
      </div>

      <div className={`absolute top-0 left-0 z-30 flex h-full w-[380px] flex-col border-r border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f7fc_100%)] shadow-[20px_0_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-transform duration-500 ease-in-out ${treeOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="border-b border-slate-200 p-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Plan Manager</h2>
            <button onClick={() => setTreeOpen(false)} className="text-slate-400 transition-colors hover:text-slate-700"><X className="h-6 w-6" /></button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".pdf"
          />
          <button
            onClick={handleOpenUploadModal}
            disabled={!projects.length}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-blue-200 bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] py-4 text-sm font-black text-blue-700 transition-all hover:border-blue-300 hover:bg-[linear-gradient(180deg,#e7f0ff_0%,#d6e8ff_100%)] active:scale-95 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Plus className="h-5 w-5" /> ADD PLAN FILE</>}
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6 no-scrollbar">
          {explorerGroups.length > 0 ? explorerGroups.map((group) => {
            const expanded = expandedStructureIds.includes(group.id);
            return (
              <div key={group.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => toggleStructureGroup(group.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-black text-slate-800">{group.name}</div>
                    <div className="truncate text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                      {group.projectName} {group.packageName ? ` / ${group.packageName}` : ''}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="border-t border-slate-200 bg-white px-2 py-2">
                    {group.drawings.length > 0 ? group.drawings.map((drawing) => (
                      <button
                        key={drawing.id}
                        onClick={() => {
                          setActiveStructureId(group.id);
                          setActiveDrawingId(drawing.id);
                        }}
                        className={`mb-1 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-black ${activeDrawingId === drawing.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{drawing.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRenameActiveDrawing(drawing.id, drawing.name);
                            }}
                            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                            title="Rename plan"
                          >
                            <PenSquare className="h-3.5 w-3.5" />
                          </button>
                          {activeDrawingId === drawing.id && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700">ACTIVE</span>}
                        </div>
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-xs font-black text-slate-400">No plans under this structure.</div>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-500 shadow-sm">
              No structure plans linked.
            </div>
          )}
        </div>
      </div>

      <div className={`absolute top-0 right-0 z-30 flex h-full w-[570px] flex-col border-l border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f7fc_100%)] shadow-[-20px_0_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-transform duration-500 ease-in-out ${elementsDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="border-b border-slate-200 p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Page Elements</h2>
              <div className="mt-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
                <span>{currentAnnotations.length} loaded</span>
                {refreshingElements && <RefreshCw className="h-3.5 w-3.5 animate-[spin_1.2s_linear_infinite]" />}
              </div>
            </div>
            <button onClick={() => setElementsDrawerOpen(false)} className="text-slate-400 transition-colors hover:text-slate-700">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button
              onClick={handleOpenElementsLibrary}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              <Plus className="h-4 w-4" />
              Elements
            </button>
            <button
              onClick={handleToggleSelectAll}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              {allSelected ? <CheckSquare2 className="h-4 w-4" /> : <SquareIcon className="h-4 w-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={() => void handleShowAllElements()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              type="button"
            >
              <Eye className="h-4 w-4" />
              Show All
            </button>
            <input
              ref={bulkStartDateInputRef}
              type="date"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void handleApplyStartDateToSelected(event.target.value)}
            />
            <button
              onClick={() => void handleCopySelectedElements()}
              disabled={selectedIds.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
            >
              <Plus className="h-4 w-4" />
              Copy
            </button>
            <button
              onClick={() => {
                const input = bulkStartDateInputRef.current;
                if (!input || selectedIds.length === 0) return;
                if (typeof input.showPicker === 'function') input.showPicker();
                else input.click();
              }}
              disabled={selectedIds.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
            >
              <Plus className="h-4 w-4" />
              Start Date
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1.7fr_0.9fr_0.7fr_1.2fr_1.2fr_0.7fr] gap-2 border-b border-slate-200 px-5 py-5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
          {[
            ['Name', 'memberName'],
            ['Type', 'elementType'],
            ['Days', 'curingDurationDays'],
            ['Start', 'curingStartDate'],
            ['End', 'curingEndDate'],
          ].map(([label, key]) => (
            <button
              key={key}
              onClick={() => handleSortElements(key as ElementSortKey)}
              className="flex items-center gap-1 text-left transition-colors hover:text-slate-700"
              type="button"
            >
              <span>{label}</span>
              {elementSort.key === key && <span>{elementSort.direction === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
          <div className="text-center">Show</div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-5 no-scrollbar"
          onClick={(event) => {
            if (event.target === event.currentTarget && !(event.ctrlKey || event.metaKey)) setSelectedIds([]);
          }}
        >
          {sortedAnnotations.length > 0 ? sortedAnnotations.map((annotation) => {
            const selected = selectedIds.includes(annotation.id);
            return (
              <div
                key={annotation.id}
                onClick={(event) => handleDrawerRowSelect(annotation.id, event)}
                className={`mb-3 rounded-[1.35rem] border px-3 py-3 transition-colors ${selected ? 'border-blue-300 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'} cursor-pointer`}
              >
                <div className="grid grid-cols-[1.7fr_0.9fr_0.7fr_1.2fr_1.2fr_0.7fr] gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {selected ? <CheckSquare2 className="h-4 w-4 flex-shrink-0 text-blue-600" /> : <SquareIcon className="h-4 w-4 flex-shrink-0 text-slate-300" />}
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: annotation.color }}
                      />
                      <div className="truncate text-sm font-black text-slate-800">{annotation.memberName || 'Unnamed element'}</div>
                    </div>
                  </div>
                  <div className="truncate pt-0.5 text-xs font-bold text-slate-600">{annotation.elementType}</div>
                  <div className="pt-0.5 text-xs font-black text-slate-700">{annotation.curingDurationDays ?? '-'}</div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={(node) => { dateInputRefs.current[annotation.id] = node; }}
                      type="date"
                      value={annotation.curingStartDate || ''}
                      onChange={(e) => void handleUpdateAnnotationMeta(annotation.id, { curingStartDate: e.target.value })}
                      className="sr-only"
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = dateInputRefs.current[annotation.id];
                        if (!input) return;
                        if (typeof input.showPicker === 'function') input.showPicker();
                        else input.click();
                      }}
                      className="w-full whitespace-nowrap bg-transparent px-2 py-1.5 text-left text-[11px] font-bold text-slate-700 outline-none cursor-pointer hover:text-blue-700"
                    >
                      {formatDisplayDate(annotation.curingStartDate)}
                    </button>
                  </div>
                  <div className="whitespace-nowrap bg-transparent px-2 py-1.5 text-[11px] font-bold text-slate-500">
                    {formatDisplayDate(annotation.curingEndDate)}
                  </div>
                  <div className="flex items-start justify-center pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => void handleUpdateAnnotationMeta(annotation.id, { isHidden: !annotation.isHidden })}
                      className={`rounded-lg p-1.5 transition-colors ${annotation.isHidden ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700' : 'text-blue-700 hover:bg-blue-100'}`}
                      type="button"
                    >
                      {annotation.isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-[1.7rem] border border-dashed border-slate-300 bg-white px-5 py-10 text-center text-sm font-bold text-slate-400">
              No elements on this page yet.
            </div>
          )}
        </div>
      </div>

      <div
        className={`absolute bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl transition-all duration-200 ${thumbnailHover ? 'h-[192px]' : 'h-[92px]'}`}
        onMouseEnter={() => setThumbnailHover(true)}
        onMouseLeave={() => setThumbnailHover(false)}
      >
        <div className="relative h-full px-6 py-3">
          <div
            ref={thumbnailRailRef}
            className="flex h-full items-center gap-3 overflow-x-auto pr-40 no-scrollbar"
            onWheel={handleThumbnailWheel}
          >
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => setActivePageId(page.id)}
                className={`${thumbnailHover ? 'w-40' : 'w-[92px]'} relative flex-shrink-0 rounded-2xl border p-2.5 text-left transition-all ${activePageId === page.id ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(37,99,235,0.18)]' : 'border-slate-800 bg-slate-900 hover:border-slate-700'} ${thumbnailHover ? 'h-[160px]' : 'h-[68px]'}`}
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRenamePage(page.id, page.name);
                  }}
                  className="absolute right-8 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-300 transition-colors hover:border-blue-500 hover:text-blue-400"
                  role="button"
                  tabIndex={0}
                >
                  <PenSquare className="h-3 w-3" />
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeletePage(page.id);
                  }}
                  className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-300 transition-colors hover:border-red-500 hover:text-red-400"
                  role="button"
                  tabIndex={0}
                >
                  <X className="h-3 w-3" />
                </span>
                <div className={`w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ${thumbnailHover ? 'h-24' : 'h-10'}`}>
                  {renderThumbnail(page)}
                </div>
                {thumbnailHover && (
                  <>
                    <div className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <LayoutTemplate className="h-3.5 w-3.5" />
                      {page.kind}
                    </div>
                    <div className="mt-1 truncate text-sm font-black text-white">{page.name}</div>
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="absolute bottom-4 right-6">
            <button
              onClick={handleCreateBlankPage}
              disabled={!activeDrawingId || creatingBlankPage}
              className={`rounded-2xl border border-dashed border-slate-700 bg-slate-900 px-5 text-slate-300 transition-all hover:border-blue-500 hover:text-white disabled:opacity-50 ${thumbnailHover ? 'h-[160px] w-32' : 'h-[68px] w-28'}`}
            >
              <div className="flex h-full flex-col items-center justify-center gap-3">
                {creatingBlankPage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
                {thumbnailHover && <span className="text-xs font-black uppercase tracking-widest">Add Blank</span>}
              </div>
            </button>
          </div>
        </div>
      </div>

      {uploadModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/25">
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">Add Plan File</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">{isContractor ? 'Select one of your assigned structures first.' : 'Select an existing structure or create a new one first.'}</p>
              </div>
              <button onClick={() => setUploadModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {!isContractor && <div className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setUploadMode('existing')}
                className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-colors ${uploadMode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Select Structure
              </button>
              <button
                onClick={() => setUploadMode('create')}
                className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-colors ${uploadMode === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Create Structure
              </button>
            </div>}

            <div className="space-y-4">
              {uploadMode === 'existing' ? (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Structure</label>
                  <select
                    value={selectedUploadStructureId}
                    onChange={(e) => setSelectedUploadStructureId(Number(e.target.value))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    <option value={0}>Select structure</option>
                    {structures.map((structure) => (
                      <option key={structure.id} value={structure.id}>{structure.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Project</label>
                    <select
                      value={selectedUploadProjectId}
                      onChange={(e) => {
                        const projectId = Number(e.target.value);
                        setSelectedUploadProjectId(projectId);
                        const firstPackageId = packages.find((pkg) => pkg.project_id === projectId)?.id || 0;
                        setSelectedUploadPackageId(firstPackageId);
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value={0}>Select project</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Package</label>
                    <select
                      value={selectedUploadPackageId}
                      onChange={(e) => setSelectedUploadPackageId(Number(e.target.value))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                    >
                      <option value={0}>Select package</option>
                      {filteredPackages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Structure Name</label>
                    <input
                      value={newStructureName}
                      onChange={(e) => setNewStructureName(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                      placeholder="Structure name"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadModalSelect}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
              >
                Select
              </button>
            </div>
          </div>
        </div>
      )}

      {toolModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">Element Setup</h3>
              <button onClick={() => { setToolModalOpen(false); setActiveTool('select'); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-black uppercase tracking-widest text-slate-500">Element Type</label>
                  <button
                    type="button"
                    onClick={() => {
                      setInlineCreateElement(true);
                      resetInlineElementDraft(geometryTypeForTool(activeTool));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Element
                  </button>
                </div>
                {!inlineCreateElement ? (
                  <select
                    value={toolConfigDraft.elementType}
                    onChange={(e) => setToolConfigDraft((current) => ({ ...current, elementType: e.target.value }))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  >
                    {elementTypeOptions.length > 0
                      ? elementTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)
                      : <option value="">No element types configured</option>}
                  </select>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <input
                      value={inlineElementDraft.element_name}
                      onChange={(e) => setInlineElementDraft((current) => ({ ...current, element_name: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                      placeholder="Element type name"
                    />
                    <input
                      value={inlineElementDraft.description}
                      onChange={(e) => setInlineElementDraft((current) => ({ ...current, description: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                      placeholder="Description"
                    />
                    <input
                      value={inlineElementDraft.required_curing_days}
                      onChange={(e) => setInlineElementDraft((current) => ({ ...current, required_curing_days: e.target.value.replace(/\D/g, '') }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                      placeholder="Curing period (days)"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setInlineCreateElement(false)}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleSaveCustomElement({ ...inlineElementDraft, geometry_type: geometryTypeForTool(activeTool) }).then((result) => {
                            if (!result) return;
                            const createdName = result.saved?.element_name || inlineElementDraft.element_name.trim();
                            setToolConfigDraft((current) => ({ ...current, elementType: createdName }));
                            setInlineCreateElement(false);
                            resetInlineElementDraft(geometryTypeForTool(activeTool));
                          });
                        }}
                        className="rounded-2xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                      >
                        OK
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Member Name</label>
                <input
                  value={toolConfigDraft.memberName}
                  onChange={(e) => setToolConfigDraft((current) => ({ ...current, memberName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Member name"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      onClick={() => setToolConfigDraft((current) => ({ ...current, color }))}
                      className={`h-9 w-9 rounded-full border-2 ${toolConfigDraft.color === color ? 'border-slate-900' : 'border-white'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {activeTool === 'point' && (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Point Shape</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setToolConfigDraft((current) => ({ ...current, pointShape: 'circle' }))}
                      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${toolConfigDraft.pointShape === 'circle' ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
                    >
                      <span className="h-4 w-4 rounded-full border-2 border-slate-700" />
                      Circle
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolConfigDraft((current) => ({ ...current, pointShape: 'square' }))}
                      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold ${toolConfigDraft.pointShape === 'square' ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
                    >
                      <span className="h-4 w-4 border-2 border-slate-700" />
                      Square
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setToolModalOpen(false); setActiveTool('select'); }}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActiveToolConfig(toolConfigDraft);
                  setToolModalOpen(false);
                  setDrawingSession(null);
                }}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {calibrationModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/25">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">Calibration</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Enter the real length for the drawn line.</p>
              </div>
              <button
                onClick={() => {
                  setCalibrationModalOpen(false);
                  setPendingCalibrationLine(null);
                  setActiveTool('select');
                }}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Length</label>
                <input
                  value={calibrationDraft.value}
                  onChange={(e) => setCalibrationDraft((current) => ({ ...current, value: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Enter digits only"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Unit</label>
                <select
                  value={calibrationDraft.unit}
                  onChange={(e) => setCalibrationDraft((current) => ({ ...current, unit: e.target.value as (typeof CALIBRATION_UNITS)[number] }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  {CALIBRATION_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setCalibrationModalOpen(false);
                  setPendingCalibrationLine(null);
                  setActiveTool('select');
                }}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSaveCalibration(); }}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {elementEditModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-900">Edit Elements</h3>
              <button onClick={() => setElementEditModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Member Name</label>
                <input
                  value={elementEditDraft.memberName}
                  onChange={(e) => setElementEditDraft((current) => ({ ...current, memberName: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Member name"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-500">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      onClick={() => setElementEditDraft((current) => ({ ...current, color }))}
                      className={`h-9 w-9 rounded-full border-2 ${elementEditDraft.color === color ? 'border-slate-900' : 'border-white'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setElementEditModalOpen(false)}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSaveEditedElements(); }}
                className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {elementsLibraryModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/25">
          <div className="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black text-slate-900">Elements</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">Manage your own element types for this monitor account.</p>
              </div>
              <button onClick={() => setElementsLibraryModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_auto]">
              <input
                value={customElementDraft.element_name}
                onChange={(e) => setCustomElementDraft((current) => ({ ...current, element_name: e.target.value }))}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                placeholder="Element type name"
              />
              <input
                value={customElementDraft.description}
                onChange={(e) => setCustomElementDraft((current) => ({ ...current, description: e.target.value }))}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                placeholder="Description"
              />
              <input
                value={customElementDraft.required_curing_days}
                onChange={(e) => setCustomElementDraft((current) => ({ ...current, required_curing_days: e.target.value.replace(/\D/g, '') }))}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                placeholder="Days"
              />
              <select
                value={customElementDraft.geometry_type}
                onChange={(e) => setCustomElementDraft((current) => ({ ...current, geometry_type: e.target.value }))}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="area">Area</option>
                <option value="line">Line</option>
                <option value="point">Point</option>
              </select>
              <button
                type="button"
                onClick={() => { void handleSaveCustomElement(customElementDraft).then(() => { setEditingCustomElementId(null); setCustomElementDraft({ element_name: '', description: '', required_curing_days: '', geometry_type: 'area' }); }); }}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
              >
                {editingCustomElementId ? 'Save' : 'Add'}
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Element Type</th>
                    <th className="p-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Description</th>
                    <th className="p-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Days</th>
                    <th className="p-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Geometry</th>
                    <th className="p-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {curingRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50/60">
                      <td className="p-4 text-sm font-black text-slate-900">{rule.element_name}</td>
                      <td className="p-4 text-sm font-medium text-slate-500">{rule.description || '-'}</td>
                      <td className="p-4 text-sm font-black text-slate-700">{rule.required_curing_days}</td>
                      <td className="p-4 text-sm font-bold uppercase tracking-widest text-slate-500">{rule.geometry_type}</td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            title="Edit element"
                            onClick={() => {
                              setEditingCustomElementId(rule.id);
                              setCustomElementDraft({
                                id: rule.id,
                                element_name: rule.element_name,
                                description: rule.description || '',
                                required_curing_days: String(rule.required_curing_days),
                                geometry_type: rule.geometry_type,
                              });
                            }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                          >
                            <PenSquare className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete element"
                            onClick={() => { void handleDeleteCustomElement(rule.id); }}
                            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {curingRules.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm font-medium italic text-slate-400">No active elements configured.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/90 px-5 py-4 font-bold text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading plan
          </div>
        </div>
      )}
    </div>
  );
}
