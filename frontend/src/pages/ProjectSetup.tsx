import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, PackageOpen, FolderGit2, 
  ChevronRight, Plus, UserPlus, HardHat, ChevronDown, Loader2, Trash2, FileText, PenSquare, BellRing, X, UserMinus, Dices
} from 'lucide-react';
import { hierarchyService, userService, authService, curingService, notificationService } from '../services/api';

type NotificationSlot = {
  id: number;
  notification_time: string;
  is_enabled: boolean;
};

type StructureNotificationSettings = {
  auto_sms_enabled: boolean;
  auto_web_enabled: boolean;
  slots: NotificationSlot[];
};

const hierarchyViewKey = (userId: number) => `curingguard.hierarchy.view.${userId || 'anon'}`;

type HierarchyViewState = {
  projectId: number;
  packageId: number;
  mode: 'total' | 'structures';
};

const loadHierarchyView = (userId: number): HierarchyViewState => {
  try {
    const raw = localStorage.getItem(hierarchyViewKey(userId));
    if (!raw) return { projectId: 0, packageId: 0, mode: 'total' as const };
    const parsed = JSON.parse(raw);
    return {
      projectId: Number(parsed?.projectId) || 0,
      packageId: Number(parsed?.packageId) || 0,
      mode: parsed?.mode === 'structures' ? 'structures' : 'total',
    };
  } catch {
    return { projectId: 0, packageId: 0, mode: 'total' as const };
  }
};

const saveHierarchyView = (userId: number, projectId: number, packageId: number, mode: 'total' | 'structures') => {
  localStorage.setItem(hierarchyViewKey(userId), JSON.stringify({ projectId, packageId, mode }));
};

const slotTimeToMinutes = (value: string) => {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
};

const minutesToSlotTime = (inputMinutes: number) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(inputMinutes)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const formatSlotTimeLabel = (value: string) => {
  const [rawHour, rawMinute] = value.split(':').map((part) => Number(part));
  const hour = Number.isFinite(rawHour) ? rawHour : 0;
  const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

export default function ProjectSetup() {
  const user = authService.getCurrentUser();
  const user_id = user ? user.user_id : 0;
  const isMonitor = user?.role === 'monitor';
  const isContractor = user?.role === 'contractor';
  const EMPTY_CONTRACTOR_FORM = {
    full_name: '',
    email: '',
    mobile_number: '',
    password: '',
  };
  const persistedViewRef = useRef(loadHierarchyView(user_id));
  const [activeProject, setActiveProject] = useState<number>(persistedViewRef.current.projectId);
  const [activePackage, setActivePackage] = useState<number>(persistedViewRef.current.packageId);
  const [viewMode, setViewMode] = useState<'total' | 'structures'>(persistedViewRef.current.mode);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [projects, setProjects] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [allStructures, setAllStructures] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [allDrawingsByStructure, setAllDrawingsByStructure] = useState<Record<number, any[]>>({});
  const [drawingsByStructure, setDrawingsByStructure] = useState<Record<number, any[]>>({});
  const [notificationSettingsByStructure, setNotificationSettingsByStructure] = useState<Record<number, StructureNotificationSettings>>({});
  const [selectedNotificationSlotByStructure, setSelectedNotificationSlotByStructure] = useState<Record<number, number | null>>({});
  const [whatsAppUiEnabledByStructure, setWhatsAppUiEnabledByStructure] = useState<Record<number, boolean>>({});
  const [selectedStructureForUpload, setSelectedStructureForUpload] = useState<number | null>(null);
  const [uploadingStructureId, setUploadingStructureId] = useState<number | null>(null);
  const [deletingDrawingId, setDeletingDrawingId] = useState<number | null>(null);
  const [savingNotificationStructureId, setSavingNotificationStructureId] = useState<number | null>(null);
  const timelineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const slotTimeInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const notificationDragRef = useRef<null | {
    structureId: number;
    slotId: number;
    originalTime: string;
    lastTime: string;
  }>(null);
  const [showCreateContractorModal, setShowCreateContractorModal] = useState(false);
  const [targetStructureForContractor, setTargetStructureForContractor] = useState<number | null>(null);
  const [creatingAndAssigningContractor, setCreatingAndAssigningContractor] = useState(false);
  const [contractorCreateForm, setContractorCreateForm] = useState(EMPTY_CONTRACTOR_FORM);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialFetchDoneRef = useRef(false);
  const effectiveViewMode: 'total' | 'structures' = isContractor ? 'structures' : viewMode;
  const displayStructures = effectiveViewMode === 'structures' && !isContractor ? allStructures : structures;
  const displayDrawingsByStructure = effectiveViewMode === 'structures' && !isContractor ? allDrawingsByStructure : drawingsByStructure;

  const refreshPackages = async (projectId: number, preferredPackageId?: number) => {
    const pkgData = await hierarchyService.getPackages(projectId);
    setPackages(pkgData);
    const nextPackageId = preferredPackageId && pkgData.some((pkg: any) => pkg.id === preferredPackageId)
      ? preferredPackageId
      : (pkgData[0]?.id || 0);
    setActivePackage(nextPackageId);
    return { pkgData, nextPackageId };
  };

  const refreshStructures = async (packageId: number) => {
    if (!packageId) {
      setStructures([]);
      setDrawingsByStructure({});
      return [];
    }
    const strData = await hierarchyService.getStructures(packageId);
    setStructures(strData);
    const drawingEntries = await Promise.all(
      strData.map(async (structure: any) => [structure.id, await hierarchyService.getDrawings(structure.id)] as const)
    );
    setDrawingsByStructure(Object.fromEntries(drawingEntries));
    return strData;
  };

  const fetchData = async () => {
    if (!user_id) return;
    try {
      setLoading(true);
      const projectPromise = hierarchyService.getProjects(user_id);
      const contractorPromise = isMonitor ? userService.getUsers(undefined, 'contractor') : Promise.resolve([]);
      const [projData, conData] = await Promise.all([projectPromise, contractorPromise]);
      setProjects(projData);
      setContractors(conData);
      if (isMonitor) {
        const structureSettings = await notificationService.getStructureSettings();
        setNotificationSettingsByStructure(
          Object.fromEntries(
            structureSettings.map((setting: any) => [
              setting.structure_id,
              {
                auto_sms_enabled: !!setting.auto_sms_enabled,
                auto_web_enabled: setting.auto_web_enabled !== false,
                slots: Array.isArray(setting.slots) && setting.slots.length > 0
                  ? [...setting.slots].sort((a: any, b: any) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time))
                  : [{ id: -1, notification_time: '10:30', is_enabled: true }],
              },
            ])
          )
        );
      }
      if (projData.length > 0) {
        const packageLists = await Promise.all(projData.map((project: any) => hierarchyService.getPackages(project.id)));
        const flatPackages = packageLists.flat();
        setPackages(flatPackages);
        const structureLists = await Promise.all(flatPackages.map((pkg: any) => hierarchyService.getStructures(pkg.id)));
        const strData = structureLists.flat();
        setAllStructures(strData);
        const drawingEntries = await Promise.all(
          strData.map(async (structure: any) => [structure.id, await hierarchyService.getDrawings(structure.id)] as const)
        );
        const nextDrawingsByStructure = Object.fromEntries(drawingEntries);
        setAllDrawingsByStructure(nextDrawingsByStructure);
        if (isContractor) {
          setStructures(strData);
          setDrawingsByStructure(nextDrawingsByStructure);
        }
        const restoredProjectId = persistedViewRef.current.projectId;
        const nextProjectId = restoredProjectId && projData.some((project: any) => project.id === restoredProjectId)
          ? restoredProjectId
          : projData[0].id;
        setActiveProject(nextProjectId);
      } else {
        setActiveProject(0);
        setActivePackage(0);
        setPackages([]);
        setAllStructures([]);
        setStructures([]);
        setAllDrawingsByStructure({});
        setDrawingsByStructure({});
      }
    } catch (error) {
      console.error("Failed to load setup data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    fetchData();
  }, []);

  useEffect(() => {
    if (isContractor) return;
    if (activeProject) {
      const fetchPackages = async () => {
        const preferredPackageId = activeProject === persistedViewRef.current.projectId
          ? persistedViewRef.current.packageId
          : undefined;
        await refreshPackages(activeProject, preferredPackageId);
      };
      fetchPackages();
    }
  }, [activeProject, isContractor]);

  useEffect(() => {
    if (isContractor) return;
    if (activePackage) {
      const fetchStructures = async () => {
        await refreshStructures(activePackage);
      };
      fetchStructures();
    } else {
      setStructures([]);
      setDrawingsByStructure({});
    }
  }, [activePackage, isContractor]);

  useEffect(() => {
    saveHierarchyView(user_id, activeProject, activePackage, viewMode);
  }, [user_id, activeProject, activePackage, viewMode]);

  const handleAddProject = async () => {
    const name = window.prompt("Enter new Project name:");
    if (!name) return;
    try {
      await hierarchyService.createProject({ name, user_id });
      fetchData(); // reload projects
    } catch (e: any) {
      alert("Error adding project: " + e.message);
    }
  };

  const handleAddPackage = async () => {
    if (!activeProject) return alert("Select a project first.");
    const name = window.prompt("Enter new Package name:");
    if (!name) return;
    try {
      await hierarchyService.createPackage({ name, project_id: activeProject });
      const { pkgData } = await refreshPackages(activeProject);
      setActivePackage(pkgData[pkgData.length - 1].id);
    } catch (e: any) {
      alert("Error adding package: " + e.message);
    }
  };

  const handleAddStructure = async () => {
    if (!activePackage) return alert("Select a package first.");
    const name = window.prompt("Enter new Structure name:");
    if (!name) return;
    try {
      await hierarchyService.createStructure({ name, package_id: activePackage });
      await refreshStructures(activePackage);
    } catch (e: any) {
      alert("Error adding structure: " + e.message);
    }
  };

  const handleAssignContractor = async (structureId: number, contractorId: number) => {
    if (!contractorId) return;
    try {
      await hierarchyService.assignContractor(structureId, contractorId);
      await fetchData();
    } catch (e: any) {
      alert("Error assigning contractor: " + e.message);
    }
  };

  const handleRevokeContractor = async (structureId: number) => {
    try {
      await hierarchyService.assignContractor(structureId, null);
      await fetchData();
    } catch (e: any) {
      alert(e.response?.data?.detail || e.message || 'Error revoking contractor.');
    }
  };

  const handleEditProject = async (projectId: number, currentName: string) => {
    const name = window.prompt('Edit project name:', currentName);
    if (!name || !name.trim()) return;
    try {
      await hierarchyService.updateProject(projectId, { name: name.trim() });
      await fetchData();
      setActiveProject(projectId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update project.');
    }
  };

  const handleDeleteProject = async (projectId: number, projectName: string) => {
    if (!window.confirm(`Soft delete project "${projectName}"?`)) return;
    try {
      await hierarchyService.deleteProject(projectId);
      const remainingProjects = projects.filter((project) => project.id !== projectId);
      setProjects(remainingProjects);
      const nextProjectId = remainingProjects[0]?.id || 0;
      setActiveProject(nextProjectId);
      if (!nextProjectId) {
        setPackages([]);
        setActivePackage(0);
        setStructures([]);
        setDrawingsByStructure({});
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete project.');
    }
  };

  const handleEditPackage = async (packageId: number, currentName: string) => {
    const name = window.prompt('Edit package name:', currentName);
    if (!name || !name.trim()) return;
    try {
      await hierarchyService.updatePackage(packageId, { name: name.trim() });
      await refreshPackages(activeProject, packageId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update package.');
    }
  };

  const handleDeletePackage = async (packageId: number, packageName: string) => {
    if (!window.confirm(`Soft delete package "${packageName}"?`)) return;
    try {
      await hierarchyService.deletePackage(packageId);
      const remainingPackages = packages.filter((pkg) => pkg.id !== packageId);
      setPackages(remainingPackages);
      const nextPackageId = remainingPackages[0]?.id || 0;
      setActivePackage(nextPackageId);
      await refreshStructures(nextPackageId);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete package.');
    }
  };

  const handleEditStructure = async (structureId: number, currentName: string) => {
    const name = window.prompt('Edit structure name:', currentName);
    if (!name || !name.trim()) return;
    try {
      await hierarchyService.updateStructure(structureId, { name: name.trim() });
      await fetchData();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update structure.');
    }
  };

  const handleDeleteStructure = async (structureId: number, structureName: string) => {
    if (!window.confirm(`Soft delete structure "${structureName}"?`)) return;
    try {
      await hierarchyService.deleteStructure(structureId);
      await fetchData();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete structure.');
    }
  };

  const handleStructureUploadClick = (structureId: number) => {
    setSelectedStructureForUpload(structureId);
    fileInputRef.current?.click();
  };

  const handleCreateBlankDrawing = async (structureId: number) => {
    const name = window.prompt('Enter blank drawing name:');
    if (!name || !name.trim()) return;

    try {
      await hierarchyService.createBlankDrawing(structureId, name.trim());
      const updatedDrawings = await hierarchyService.getDrawings(structureId);
      setDrawingsByStructure(prev => ({ ...prev, [structureId]: updatedDrawings }));
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to create blank drawing.');
    }
  };

  const handleStructureFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStructureForUpload) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('structure_id', String(selectedStructureForUpload));
    formData.append('name', file.name);

    try {
      setUploadingStructureId(selectedStructureForUpload);
      await curingService.uploadDrawing(formData);
      const updatedDrawings = await hierarchyService.getDrawings(selectedStructureForUpload);
      setDrawingsByStructure(prev => ({ ...prev, [selectedStructureForUpload]: updatedDrawings }));
      alert('Plan upload complete.');
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((item: any) => item.msg || item.message || JSON.stringify(item)).join('\n')
        : detail || 'Failed to upload plan.';
      alert(message);
    } finally {
      setUploadingStructureId(null);
      setSelectedStructureForUpload(null);
      e.target.value = '';
    }
  };

  const handleDeleteDrawing = async (structureId: number, drawingId: number, drawingName: string) => {
    const confirmed = window.confirm(`Delete plan file "${drawingName}" from record and storage?`);
    if (!confirmed) return;

    try {
      setDeletingDrawingId(drawingId);
      await hierarchyService.deleteDrawing(drawingId);
      setDrawingsByStructure(prev => ({
        ...prev,
        [structureId]: (prev[structureId] || []).filter(drawing => drawing.id !== drawingId),
      }));
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete plan file.');
    } finally {
      setDeletingDrawingId(null);
    }
  };

  const handleEditDrawing = async (structureId: number, drawingId: number, currentName: string) => {
    const name = window.prompt('Edit plan name:', currentName);
    if (!name || !name.trim()) return;

    try {
      await hierarchyService.updateDrawing(drawingId, { name: name.trim() });
      const updatedDrawings = await hierarchyService.getDrawings(structureId);
      setDrawingsByStructure(prev => ({ ...prev, [structureId]: updatedDrawings }));
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update plan name.');
    }
  };

  const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 11);

  const openCreateContractorModal = (structureId: number) => {
    setTargetStructureForContractor(structureId);
    setContractorCreateForm(EMPTY_CONTRACTOR_FORM);
    setShowCreateContractorModal(true);
  };

  const closeCreateContractorModal = () => {
    setShowCreateContractorModal(false);
    setTargetStructureForContractor(null);
    setContractorCreateForm(EMPTY_CONTRACTOR_FORM);
  };

  const handleCreateAndAssignContractor = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetStructureForContractor) return;
    if (contractorCreateForm.mobile_number.length !== 11) {
      alert('Mobile number must be exactly 11 digits.');
      return;
    }

    try {
      setCreatingAndAssigningContractor(true);
      const normalizedEmail = contractorCreateForm.email.trim().toLowerCase();
      const emailCheck = await userService.checkEmail(normalizedEmail);
      if (emailCheck.exists) {
        alert('This email ID is already present in the system. Use another email.');
        return;
      }
      const createdContractor = await userService.create_user({
        username: normalizedEmail,
        email: normalizedEmail,
        full_name: contractorCreateForm.full_name.trim(),
        mobile_number: contractorCreateForm.mobile_number,
        password: contractorCreateForm.password,
        role: 'contractor',
      });
      await hierarchyService.assignContractor(targetStructureForContractor, createdContractor.id);
      const [updatedContractors] = await Promise.all([
        userService.getUsers(undefined, 'contractor'),
        refreshStructures(activePackage),
      ]);
      setContractors(updatedContractors);
      closeCreateContractorModal();
      alert('Contractor enrolled and assigned successfully.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to create and assign contractor.');
    } finally {
      setCreatingAndAssigningContractor(false);
    }
  };

  const getTimelineMinutesFromClientX = (structureId: number, clientX: number) => {
    const rail = timelineRefs.current[structureId];
    if (!rail) return null;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((ratio * 24 * 60) / 30) * 30;
  };

  const handleNotificationSettingChange = async (
    structureId: number,
    patch: { auto_sms_enabled?: boolean; auto_web_enabled?: boolean }
  ) => {
    const current = notificationSettingsByStructure[structureId] || {
      auto_sms_enabled: false,
      auto_web_enabled: true,
      slots: [],
    };
    const optimistic = { ...current, ...patch };
    setNotificationSettingsByStructure((prev) => ({ ...prev, [structureId]: optimistic }));
    try {
      setSavingNotificationStructureId(structureId);
      const updated = await notificationService.updateStructureSettings(structureId, patch);
      setNotificationSettingsByStructure((prev) => ({
        ...prev,
        [structureId]: {
          auto_sms_enabled: !!updated.auto_sms_enabled,
          auto_web_enabled: updated.auto_web_enabled !== false,
          slots: Array.isArray(updated.slots) ? [...updated.slots].sort((a: any, b: any) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time)) : current.slots,
        },
      }));
    } catch (error: any) {
      setNotificationSettingsByStructure((prev) => ({ ...prev, [structureId]: current }));
      alert(error.response?.data?.detail || 'Failed to update notification settings.');
    } finally {
      setSavingNotificationStructureId(null);
    }
  };

  const handleCreateNotificationSlot = async (structureId: number, notificationTime: string) => {
    try {
      setSavingNotificationStructureId(structureId);
      const created = await notificationService.createStructureSlot(structureId, { notification_time: notificationTime });
      setNotificationSettingsByStructure((prev) => {
        const current = prev[structureId] || { auto_sms_enabled: false, auto_web_enabled: true, slots: [] };
        const slots = [...current.slots, created].sort((a, b) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time));
        return { ...prev, [structureId]: { ...current, slots } };
      });
      setSelectedNotificationSlotByStructure((prev) => ({ ...prev, [structureId]: created.id }));
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to add notification time.');
    } finally {
      setSavingNotificationStructureId(null);
    }
  };

  const handleTimelineClick = async (structureId: number, event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-slot-marker="true"]')) return;
    const minutes = getTimelineMinutesFromClientX(structureId, event.clientX);
    if (minutes == null) return;
    const notificationTime = minutesToSlotTime(minutes);
    const current = notificationSettingsByStructure[structureId];
    if (current?.slots.some((slot) => slot.notification_time === notificationTime)) {
      const existing = current.slots.find((slot) => slot.notification_time === notificationTime);
      setSelectedNotificationSlotByStructure((prev) => ({ ...prev, [structureId]: existing?.id || null }));
      return;
    }
    await handleCreateNotificationSlot(structureId, notificationTime);
  };

  const handleNotificationSlotPointerDown = (structureId: number, slot: NotificationSlot, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNotificationSlotByStructure((prev) => ({ ...prev, [structureId]: slot.id }));
    notificationDragRef.current = {
      structureId,
      slotId: slot.id,
      originalTime: slot.notification_time,
      lastTime: slot.notification_time,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = notificationDragRef.current;
      if (!drag) return;
      const minutes = getTimelineMinutesFromClientX(drag.structureId, event.clientX);
      if (minutes == null) return;
      const nextTime = minutesToSlotTime(minutes);
      const current = notificationSettingsByStructure[drag.structureId];
      if (!current) return;
      const duplicate = current.slots.some((slot) => slot.id !== drag.slotId && slot.notification_time === nextTime);
      if (duplicate || drag.lastTime === nextTime) return;
      drag.lastTime = nextTime;
      setNotificationSettingsByStructure((prev) => ({
        ...prev,
        [drag.structureId]: {
          ...current,
          slots: current.slots.map((slot) => slot.id === drag.slotId ? { ...slot, notification_time: nextTime } : slot)
            .sort((a, b) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time)),
        },
      }));
    };

    const handlePointerUp = async () => {
      const drag = notificationDragRef.current;
      if (!drag) return;
      notificationDragRef.current = null;
      if (drag.lastTime === drag.originalTime) return;
      try {
        setSavingNotificationStructureId(drag.structureId);
        await notificationService.updateStructureSlot(drag.structureId, drag.slotId, { notification_time: drag.lastTime });
      } catch (error: any) {
        setNotificationSettingsByStructure((prev) => {
          const current = prev[drag.structureId];
          if (!current) return prev;
          return {
            ...prev,
            [drag.structureId]: {
              ...current,
              slots: current.slots.map((slot) => slot.id === drag.slotId ? { ...slot, notification_time: drag.originalTime } : slot)
                .sort((a, b) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time)),
            },
          };
        });
        alert(error.response?.data?.detail || 'Failed to update notification time.');
      } finally {
        setSavingNotificationStructureId(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [notificationSettingsByStructure]);

  const handleToggleNotificationSlot = async (structureId: number, slot: NotificationSlot) => {
    const current = notificationSettingsByStructure[structureId];
    if (!current) return;
    setNotificationSettingsByStructure((prev) => ({
      ...prev,
      [structureId]: {
        ...current,
        slots: current.slots.map((item) => item.id === slot.id ? { ...item, is_enabled: !item.is_enabled } : item),
      },
    }));
    try {
      setSavingNotificationStructureId(structureId);
      await notificationService.updateStructureSlot(structureId, slot.id, { is_enabled: !slot.is_enabled });
    } catch (error: any) {
      setNotificationSettingsByStructure((prev) => ({ ...prev, [structureId]: current }));
      alert(error.response?.data?.detail || 'Failed to update notification time status.');
    } finally {
      setSavingNotificationStructureId(null);
    }
  };

  const handleDeleteNotificationSlot = async (structureId: number, slotId: number) => {
    const current = notificationSettingsByStructure[structureId];
    if (!current) return;
    if (!window.confirm('Delete this notification time?')) return;
    setNotificationSettingsByStructure((prev) => ({
      ...prev,
      [structureId]: {
        ...current,
        slots: current.slots.filter((slot) => slot.id !== slotId),
      },
    }));
    try {
      setSavingNotificationStructureId(structureId);
      await notificationService.deleteStructureSlot(structureId, slotId);
      setSelectedNotificationSlotByStructure((prev) => ({ ...prev, [structureId]: prev[structureId] === slotId ? null : prev[structureId] }));
    } catch (error: any) {
      setNotificationSettingsByStructure((prev) => ({ ...prev, [structureId]: current }));
      alert(error.response?.data?.detail || 'Failed to delete notification time.');
    } finally {
      setSavingNotificationStructureId(null);
    }
  };

  const handleSelectedSlotTimeChange = async (structureId: number, slot: NotificationSlot, nextTime: string) => {
    const current = notificationSettingsByStructure[structureId];
    if (!current || !nextTime || nextTime === slot.notification_time) return;
    if (current.slots.some((item) => item.id !== slot.id && item.notification_time === nextTime)) {
      alert('This structure already has that notification time.');
      return;
    }
    const optimisticSlots = current.slots
      .map((item) => item.id === slot.id ? { ...item, notification_time: nextTime } : item)
      .sort((a, b) => slotTimeToMinutes(a.notification_time) - slotTimeToMinutes(b.notification_time));
    setNotificationSettingsByStructure((prev) => ({
      ...prev,
      [structureId]: {
        ...current,
        slots: optimisticSlots,
      },
    }));
    try {
      setSavingNotificationStructureId(structureId);
      await notificationService.updateStructureSlot(structureId, slot.id, { notification_time: nextTime });
    } catch (error: any) {
      setNotificationSettingsByStructure((prev) => ({ ...prev, [structureId]: current }));
      alert(error.response?.data?.detail || 'Failed to update notification time.');
    } finally {
      setSavingNotificationStructureId(null);
    }
  };

  const renderNotificationControls = (structureId: number) => {
    const settings = notificationSettingsByStructure[structureId] || {
      auto_sms_enabled: false,
      auto_web_enabled: true,
      slots: [],
    };
    const isSaving = savingNotificationStructureId === structureId;
    const selectedSlotId = selectedNotificationSlotByStructure[structureId] ?? settings.slots[0]?.id ?? null;
    const selectedSlot = settings.slots.find((slot) => slot.id === selectedSlotId) || null;
    const whatsAppUiEnabled = !!whatsAppUiEnabledByStructure[structureId];

    return (
      <div className="mb-4 px-1 py-1">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-4 w-4 text-sky-600" />
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-600">Notifications</span>
          {isSaving && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              { label: 'SMS', active: settings.auto_sms_enabled, onClick: () => { void handleNotificationSettingChange(structureId, { auto_sms_enabled: !settings.auto_sms_enabled }); } },
              { label: 'WEB', active: settings.auto_web_enabled, onClick: () => { void handleNotificationSettingChange(structureId, { auto_web_enabled: !settings.auto_web_enabled }); } },
              { label: "Whats'app", active: whatsAppUiEnabled, onClick: () => setWhatsAppUiEnabledByStructure((prev) => ({ ...prev, [structureId]: !prev[structureId] })) },
            ].map((toggle) => (
              <div key={toggle.label} className="flex items-center gap-2.5">
                <span className="text-[13px] font-black uppercase tracking-[0.12em] text-slate-600">{toggle.label}</span>
                <button
                  type="button"
                  onClick={toggle.onClick}
                  role="switch"
                  aria-checked={toggle.active}
                  className={`relative inline-flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)] transition-colors duration-200 ${toggle.active ? 'bg-sky-500' : 'bg-slate-200'}`}
                >
                  <span
                    className={`block h-[24px] w-[24px] rounded-full bg-white shadow-[0_2px_6px_rgba(15,23,42,0.18)] transition-transform duration-200 ${toggle.active ? 'translate-x-[22px]' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-1">
            <div className="relative mb-2 h-4 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              {Array.from({ length: 13 }, (_, index) => {
                const leftPercent = (index / 12) * 100;
                const label = index === 12 ? '0' : String(index * 2);
                const edgeClass = index === 0 ? 'translate-x-0 text-left' : index === 12 ? '-translate-x-full text-right' : '-translate-x-1/2 text-center';
                return (
                  <span
                    key={index}
                    className={`absolute top-0 ${edgeClass}`}
                    style={{ left: `${leftPercent}%` }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
            <div
              ref={(node) => { timelineRefs.current[structureId] = node; }}
              className="relative h-[58px] rounded-[20px] border border-slate-200 bg-white px-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
              onClick={(event) => { void handleTimelineClick(structureId, event); }}
            >
              <div className="absolute inset-x-4 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-200" />
              {Array.from({ length: 13 }, (_, index) => (
                <div
                  key={index}
                  className="pointer-events-none absolute top-[8px] bottom-[8px] w-px bg-slate-200/90"
                  style={{ left: `calc(${(index / 12) * 100}% - 1px)` }}
                />
              ))}
              {settings.slots.map((slot) => {
                const leftPercent = (slotTimeToMinutes(slot.notification_time) / (24 * 60)) * 100;
                const isSelected = slot.id === selectedSlotId;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    data-slot-marker="true"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedNotificationSlotByStructure((prev) => ({ ...prev, [structureId]: slot.id }));
                    }}
                    onPointerDown={(event) => handleNotificationSlotPointerDown(structureId, slot, event)}
                    className={`absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[6px] border ${slot.is_enabled ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-slate-400'} ${isSelected ? 'shadow-[0_0_0_4px_rgba(59,130,246,0.14),0_6px_16px_rgba(59,130,246,0.28)]' : 'shadow-[0_4px_10px_rgba(15,23,42,0.12)]'}`}
                    style={{ left: `${leftPercent}%` }}
                    title={formatSlotTimeLabel(slot.notification_time)}
                  >
                    <Dices className="h-3 w-3" strokeWidth={2.25} />
                  </button>
                );
              })}
            </div>
          </div>

          {selectedSlot ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={(node) => { slotTimeInputRefs.current[structureId] = node; }}
                type="time"
                step={60}
                className="sr-only"
                value={selectedSlot.notification_time}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  void handleSelectedSlotTimeChange(structureId, selectedSlot, value);
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = slotTimeInputRefs.current[structureId];
                  if (!input) return;
                  if (typeof input.showPicker === 'function') input.showPicker();
                  else input.click();
                }}
                className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition-colors hover:bg-slate-200"
              >
                {formatSlotTimeLabel(selectedSlot.notification_time)}
              </button>
              <button
                type="button"
                onClick={() => { void handleToggleNotificationSlot(structureId, selectedSlot); }}
                className={`rounded-2xl px-4 py-2.5 text-sm font-black uppercase tracking-[0.14em] shadow-sm ${selectedSlot.is_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
              >
                {selectedSlot.is_enabled ? 'Disable' : 'Enable'}
              </button>
              <button
                type="button"
                onClick={() => { void handleDeleteNotificationSlot(structureId, selectedSlot.id); }}
                className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-black uppercase tracking-[0.14em] text-red-600 shadow-sm"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderCreateContractorModal = () => {
    if (!showCreateContractorModal) return null;
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/20 px-4">
        <div className="w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-200 px-8 py-6">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Enroll Contractor</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Create the contractor and assign to this structure immediately.</p>
            </div>
            <button onClick={closeCreateContractorModal} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-8 py-7">
            <form onSubmit={handleCreateAndAssignContractor} className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Name of Contractor</label>
                <input
                  required
                  type="text"
                  value={contractorCreateForm.full_name}
                  onChange={(e) => setContractorCreateForm((current) => ({ ...current, full_name: e.target.value }))}
                  className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div>
                <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Email ID</label>
                <input
                  required
                  type="email"
                  value={contractorCreateForm.email}
                  onChange={(e) => setContractorCreateForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div>
                <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Mobile Number (WhatsApp)</label>
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={contractorCreateForm.mobile_number}
                  onChange={(e) => setContractorCreateForm((current) => ({ ...current, mobile_number: digitsOnly(e.target.value) }))}
                  className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2.5 block text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Initial Password</label>
                <input
                  required
                  type="password"
                  value={contractorCreateForm.password}
                  onChange={(e) => setContractorCreateForm((current) => ({ ...current, password: e.target.value }))}
                  className="w-full rounded-xl border-2 border-slate-200 p-3.5 font-extrabold text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeCreateContractorModal} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-600 transition-colors hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={creatingAndAssigningContractor} className="flex min-w-[210px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {creatingAndAssigningContractor ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save and Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  };

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
            <p className="text-sm md:text-base text-slate-500 font-medium tracking-wide">
              {isContractor ? 'Contractor Workspace: Access assigned structures and manage plans.' : 'Monitor Dashboard: Define architectural scope and deploy contractors.'}
            </p>
         </div>
         {!isContractor && <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => setViewMode('total')}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-colors ${viewMode === 'total' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Total View
            </button>
            <button
              onClick={() => setViewMode('structures')}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-colors ${viewMode === 'structures' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'}`}
            >
              Structure View
            </button>
         </div>}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif"
        className="hidden"
        onChange={handleStructureFileUpload}
      />

      {!isContractor && effectiveViewMode === 'total' ? (
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 md:gap-6 overflow-y-auto lg:overflow-hidden pb-10 lg:pb-0">
         
         {/* COLUMN 1: PROJECTS */}
         <div className="flex flex-col flex-1 min-h-[300px] bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm shadow-slate-200/50">
            <div className="bg-slate-50 px-6 py-5 border-b border-slate-200 flex justify-between items-center shrink-0">
               <div className="flex items-center gap-3">
                  <FolderGit2 className="text-blue-600 w-6 h-6" />
                  <h2 className="font-extrabold text-slate-900 text-lg">Projects</h2>
               </div>
               <button onClick={handleAddProject} className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 no-scrollbar">
               {projects.map(p => (
                 <div key={p.id} onClick={() => setActiveProject(p.id)} 
                      className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center justify-between ${activeProject === p.id ? 'border-blue-500 bg-blue-50 shadow-md ring-4 ring-blue-500/10' : 'border-slate-200/50 hover:border-slate-300 bg-white shadow-sm'}`}>
                    <div>
                       <h3 className={`font-extrabold ${activeProject === p.id ? 'text-blue-900' : 'text-slate-800'}`}>{p.name}</h3>
                       <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full mt-2 inline-block shadow-sm border bg-green-100 text-green-800 border-green-200">Active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); void handleEditProject(p.id, p.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700">
                        <PenSquare className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); void handleDeleteProject(p.id, p.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className={`w-5 h-5 ${activeProject === p.id ? 'text-blue-500' : 'text-slate-300'}`} />
                    </div>
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
               <button onClick={handleAddPackage} className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 no-scrollbar">
               {packages.map(pkg => (
                 <div key={pkg.id} onClick={() => setActivePackage(pkg.id)} 
                      className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center justify-between ${activePackage === pkg.id ? 'border-amber-500 bg-amber-50 shadow-md ring-4 ring-amber-500/10' : 'border-slate-200/50 hover:border-slate-300 bg-white shadow-sm'}`}>
                    <h3 className={`font-extrabold ${activePackage === pkg.id ? 'text-amber-900' : 'text-slate-800'}`}>{pkg.name}</h3>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); void handleEditPackage(pkg.id, pkg.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700">
                        <PenSquare className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); void handleDeletePackage(pkg.id, pkg.name); }} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronRight className={`w-5 h-5 ${activePackage === pkg.id ? 'text-amber-500' : 'text-slate-300'}`} />
                    </div>
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
               <button onClick={handleAddStructure} className="bg-slate-900 text-white p-2 rounded-xl hover:bg-slate-800 shadow-sm transition-all active:scale-95"><Plus className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 no-scrollbar">
               {activePackage !== 0 ? (
                 structures.length > 0 ? structures.map(s => {
                    const assignedCon = contractors.find(c => c.id === s.contractor_id);
                    return (
                      <div key={s.id} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all hover:border-slate-300 hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <h3 className="text-[30px] font-black tracking-tight text-slate-900 leading-none">{s.name}</h3>
                          <div className="flex items-center gap-1">
                            <button onClick={() => void handleEditStructure(s.id, s.name)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                              <PenSquare className="h-4 w-4" />
                            </button>
                            <button onClick={() => void handleDeleteStructure(s.id, s.name)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-white bg-white px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(15,23,42,0.04)]">
                          {!isContractor && <div className="mb-4">
                            <span className="inline-flex rounded-sm border border-white bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                              Assigned Contractor
                            </span>
                          </div>}

                          {!isContractor && <div className="mb-4 flex gap-3">
                            <div className="flex-1">
                              {assignedCon ? (
                                <div className="flex h-[52px] items-center justify-between rounded-[18px] border border-white bg-white px-4 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900">
                                      <HardHat className="h-4 w-4 text-amber-400" />
                                    </div>
                                    <span className="text-sm font-extrabold text-slate-900">{assignedCon.full_name || assignedCon.email || assignedCon.username}</span>
                                  </div>
                                  <button onClick={() => void handleRevokeContractor(s.id)} title="Revoke contractor" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600">
                                    <UserMinus className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="relative">
                                  <select
                                    className="appearance-none h-[52px] w-full rounded-[18px] border-2 border-dashed border-white bg-white py-3 pl-10 pr-10 text-[12px] font-extrabold tracking-wide text-slate-600 shadow-sm transition-all hover:border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                    onChange={(e) => handleAssignContractor(s.id, Number(e.target.value))}
                                    defaultValue=""
                                  >
                                    <option value="" disabled>DEPLOY CONTRACTOR...</option>
                                    {contractors.map(c => (
                                      <option key={c.id} value={c.id}>{c.full_name || c.email || c.username}</option>
                                    ))}
                                  </select>
                                  <UserPlus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                </div>
                              )}
                            </div>

                            <button onClick={() => openCreateContractorModal(s.id)} className="h-[52px] min-w-[170px] rounded-[18px] border border-white bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] px-4 text-[12px] font-extrabold text-blue-700 shadow-sm transition-all hover:border-white hover:bg-[linear-gradient(180deg,#e7f0ff_0%,#d6e8ff_100%)]">
                              + Create Contractor
                            </button>
                          </div>}

                          {!isContractor && renderNotificationControls(s.id)}

                          <div>
                            <div className="mb-3">
                              <span className="inline-flex rounded-sm border border-white bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                                Plans
                              </span>
                            </div>

                            <div className="min-h-[94px] rounded-[18px] border border-white bg-white px-2 py-2">
                              {(drawingsByStructure[s.id] || []).length > 0 ? (
                                <div className="space-y-2">
                                  {(drawingsByStructure[s.id] || []).map((drawing) => (
                                    <div
                                      key={drawing.id}
                                      onClick={() => navigate(`/plans?structureId=${s.id}&drawingId=${drawing.id}`)}
                                      className="group/plan flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-all hover:border-slate-200 hover:bg-slate-50"
                                    >
                                      <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                                        <FileText className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                                        <span className="truncate text-sm font-bold text-slate-800 group-hover/plan:text-blue-700">
                                          {drawing.name}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/plan:opacity-100">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleEditDrawing(s.id, drawing.id, drawing.name);
                                          }}
                                          className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
                                        >
                                          <PenSquare className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteDrawing(s.id, drawing.id, drawing.name);
                                          }}
                                          disabled={deletingDrawingId === drawing.id}
                                          className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-500 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-600 disabled:opacity-60"
                                        >
                                          {deletingDrawingId === drawing.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex h-[78px] items-center justify-center">
                                  <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">No plan files uploaded yet.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex gap-3">
                          <button onClick={() => handleStructureUploadClick(s.id)} disabled={uploadingStructureId === s.id} className="flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-blue-200 bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] px-4 text-[13px] font-extrabold text-blue-700 transition-all hover:border-blue-300 hover:bg-[linear-gradient(180deg,#e7f0ff_0%,#d6e8ff_100%)] active:scale-[0.99] disabled:opacity-60">
                            {uploadingStructureId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Upload Plan
                          </button>
                          <button onClick={() => handleCreateBlankDrawing(s.id)} className="flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-[linear-gradient(180deg,#f5f7fb_0%,#ebeff5_100%)] px-4 text-[13px] font-extrabold text-slate-700 transition-all hover:border-slate-300 hover:bg-[linear-gradient(180deg,#eef2f8_0%,#e4e9f1_100%)] active:scale-[0.99]">
                            <FileText className="h-4 w-4" /> Blank Drawing
                          </button>
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
      ) : (
      <div className="flex-1 overflow-y-auto pb-10">
         {displayStructures.length > 0 ? (
           <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
             {displayStructures.map(s => {
               const assignedCon = contractors.find(c => c.id === s.contractor_id);
               return (
                 <div key={s.id} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all hover:border-slate-300 hover:shadow-[0_18px_38px_rgba(15,23,42,0.08)]">
                   <div className="mb-4 flex items-start justify-between gap-3">
                     <h3 className="text-[30px] font-black tracking-tight text-slate-900 leading-none">{s.name}</h3>
                    {!isContractor && <div className="flex items-center gap-1">
                       <button onClick={() => void handleEditStructure(s.id, s.name)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                         <PenSquare className="h-4 w-4" />
                       </button>
                       <button onClick={() => void handleDeleteStructure(s.id, s.name)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600">
                         <Trash2 className="h-4 w-4" />
                       </button>
                     </div>}
                   </div>

                   <div className="rounded-[22px] border border-white bg-white px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_rgba(15,23,42,0.04)]">
                     {!isContractor && <div className="mb-4">
                       <span className="inline-flex rounded-sm border border-white bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                         Assigned Contractor
                       </span>
                     </div>}

                     {!isContractor && <div className="mb-4 flex gap-3">
                       <div className="flex-1">
                         {assignedCon ? (
                           <div className="flex h-[52px] items-center justify-between rounded-[18px] border border-white bg-white px-4 shadow-sm">
                             <div className="flex items-center gap-3">
                               <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900">
                                 <HardHat className="h-4 w-4 text-amber-400" />
                               </div>
                               <span className="text-sm font-extrabold text-slate-900">{assignedCon.full_name || assignedCon.email || assignedCon.username}</span>
                             </div>
                             <button onClick={() => void handleRevokeContractor(s.id)} title="Revoke contractor" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600">
                               <UserMinus className="h-4 w-4" />
                             </button>
                           </div>
                         ) : (
                           <div className="relative">
                             <select
                               className="appearance-none h-[52px] w-full rounded-[18px] border-2 border-dashed border-white bg-white py-3 pl-10 pr-10 text-[12px] font-extrabold tracking-wide text-slate-600 shadow-sm transition-all hover:border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                               onChange={(e) => handleAssignContractor(s.id, Number(e.target.value))}
                               defaultValue=""
                             >
                               <option value="" disabled>DEPLOY CONTRACTOR...</option>
                               {contractors.map(c => (
                                 <option key={c.id} value={c.id}>{c.full_name || c.email || c.username}</option>
                               ))}
                             </select>
                             <UserPlus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                             <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                           </div>
                         )}
                       </div>

                       <button onClick={() => openCreateContractorModal(s.id)} className="h-[52px] min-w-[170px] rounded-[18px] border border-white bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] px-4 text-[12px] font-extrabold text-blue-700 shadow-sm transition-all hover:border-white hover:bg-[linear-gradient(180deg,#e7f0ff_0%,#d6e8ff_100%)]">
                         + Create Contractor
                       </button>
                     </div>}

                     {!isContractor && renderNotificationControls(s.id)}

                     <div>
                       <div className="mb-3">
                         <span className="inline-flex rounded-sm border border-white bg-white px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                           Plans
                         </span>
                       </div>

                       <div className="min-h-[94px] rounded-[18px] border border-white bg-white px-2 py-2">
                         {(displayDrawingsByStructure[s.id] || []).length > 0 ? (
                           <div className="space-y-2">
                             {(displayDrawingsByStructure[s.id] || []).map((drawing) => (
                               <div
                                 key={drawing.id}
                                 onClick={() => navigate(`/plans?structureId=${s.id}&drawingId=${drawing.id}`)}
                                 className="group/plan flex items-center gap-3 rounded-xl border border-transparent px-2 py-2 transition-all hover:border-slate-200 hover:bg-slate-50"
                               >
                                 <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
                                   <FileText className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                                   <span className="truncate text-sm font-bold text-slate-800 group-hover/plan:text-blue-700">
                                     {drawing.name}
                                   </span>
                                 </div>

                                 <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/plan:opacity-100">
                                   <button
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       void handleEditDrawing(s.id, drawing.id, drawing.name);
                                     }}
                                     className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800"
                                   >
                                     <PenSquare className="h-3.5 w-3.5" />
                                   </button>
                                   <button
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       void handleDeleteDrawing(s.id, drawing.id, drawing.name);
                                     }}
                                     disabled={deletingDrawingId === drawing.id}
                                     className="rounded-md border border-red-200 bg-red-50 p-1.5 text-red-500 transition-colors hover:border-red-300 hover:bg-red-100 hover:text-red-600 disabled:opacity-60"
                                   >
                                     {deletingDrawingId === drawing.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                   </button>
                                 </div>
                               </div>
                             ))}
                           </div>
                         ) : (
                           <div className="flex h-[78px] items-center justify-center">
                             <span className="rounded-sm bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">No plan files uploaded yet.</span>
                           </div>
                         )}
                       </div>
                     </div>
                   </div>

                   <div className="mt-4 flex gap-3">
                     <button onClick={() => handleStructureUploadClick(s.id)} disabled={uploadingStructureId === s.id} className="flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-blue-200 bg-[linear-gradient(180deg,#eef5ff_0%,#dfeeff_100%)] px-4 text-[13px] font-extrabold text-blue-700 transition-all hover:border-blue-300 hover:bg-[linear-gradient(180deg,#e7f0ff_0%,#d6e8ff_100%)] active:scale-[0.99] disabled:opacity-60">
                       {uploadingStructureId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Upload Plan
                     </button>
                     <button onClick={() => handleCreateBlankDrawing(s.id)} className="flex h-[48px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-[linear-gradient(180deg,#f5f7fb_0%,#ebeff5_100%)] px-4 text-[13px] font-extrabold text-slate-700 transition-all hover:border-slate-300 hover:bg-[linear-gradient(180deg,#eef2f8_0%,#e4e9f1_100%)] active:scale-[0.99]">
                       <FileText className="h-4 w-4" /> Blank Drawing
                     </button>
                   </div>
                 </div>
               );
             })}
           </div>
         ) : (
           <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
             <Building2 className="mx-auto mb-3 h-12 w-12 text-slate-300" />
             <p className="font-bold text-slate-500">
               {activePackage ? 'No structures in this package yet.' : 'Select a package to view structural targets.'}
             </p>
           </div>
         )}
      </div>
      )}
      {renderCreateContractorModal()}
    </div>
  );
}
