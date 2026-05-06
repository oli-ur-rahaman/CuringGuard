import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Camera, Loader2, Plus, Presentation, Upload, Video, X } from 'lucide-react';
import { progressService, systemService } from '../services/api';
import ElementPresentationOverlay from '../components/ElementPresentationOverlay';

type GanttDay = {
  date: string;
  did_cure_today: boolean;
  entry_id: number;
};

type ProgressRow = {
  drawing_element_id: string;
  plan_name: string;
  page_name: string;
  element_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  elapsed_days: number;
  is_completed: boolean;
  today_status: 'added' | 'pending';
  gantt_days: GanttDay[];
};

type ProgressStructureGroup = {
  structure_id: number;
  structure_name: string;
  rows: ProgressRow[];
};

type ProgressMediaItem = {
  file: File;
  source: 'manual' | 'camera-photo' | 'camera-video';
  capturedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'];
const formatShortDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
};

const localIsoDate = (input = new Date()) => {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToIso = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const value = new Date(year, (month || 1) - 1, day || 1);
  value.setDate(value.getDate() + days);
  return localIsoDate(value);
};

const isoToday = () => localIsoDate();

async function validateMediaFiles(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
        throw new Error(`Unsupported image format for "${file.name}". Use JPG, PNG, WEBP, BMP, or GIF.`);
      }
      continue;
    }
    if (file.type.startsWith('video/')) {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement('video');
        const objectUrl = URL.createObjectURL(file);
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          const durationSeconds = video.duration;
          URL.revokeObjectURL(objectUrl);
          resolve(durationSeconds);
        };
        video.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`Unable to read video duration for ${file.name}`));
        };
        video.src = objectUrl;
      });
      if (duration > 120) {
        throw new Error(`Video "${file.name}" is longer than 2 minutes.`);
      }
      continue;
    }
    throw new Error(`Unsupported file type for "${file.name}". Only image and video files are allowed.`);
  }
}

function GanttBar({ row }: { row: ProgressRow }) {
  const totalDays = Math.max(row.total_days || 0, 1);
  const progressMap = new Map(row.gantt_days.map((entry) => [entry.date, entry.did_cure_today]));
  const startDate = new Date(`${row.start_date}T00:00:00`);
  const today = new Date(`${isoToday()}T00:00:00`);
  const todayOffset = Math.max(Math.min(Math.floor((today.getTime() - startDate.getTime()) / 86400000), totalDays - 1), 0);

  return (
    <div className="min-w-[360px]">
      <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        <span>{formatShortDate(row.start_date)}</span>
        <span>{formatShortDate(row.end_date)}</span>
      </div>
      <div className="relative h-10 overflow-hidden rounded-xl border border-slate-300 bg-white">
        <div className="flex h-full">
          {Array.from({ length: totalDays }).map((_, index) => {
            const cellDate = addDaysToIso(row.start_date, index);
            const hasPositiveProgress = progressMap.get(cellDate) === true;
            return (
              <div
                key={cellDate}
                title={`${cellDate} • ${hasPositiveProgress ? 'Progress added' : 'No progress'}`}
                className={`h-full border-r border-slate-200 ${hasPositiveProgress ? 'bg-sky-500' : 'bg-white'}`}
                style={{ width: `${100 / totalDays}%` }}
              />
            );
          })}
        </div>
        {!row.is_completed && today >= startDate && (
          <div
            className="absolute bottom-0 top-0 w-[2px] bg-red-500"
            style={{ left: `calc(${((todayOffset + 1) / totalDays) * 100}% - 1px)` }}
          />
        )}
      </div>
      <div className="mt-2 text-sm font-black text-slate-800">
        {`${row.elapsed_days}/${row.total_days}`}
        {row.is_completed && <span className="ml-2 text-emerald-700">(Completed)</span>}
      </div>
    </div>
  );
}

export default function CuringProgress() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [groups, setGroups] = useState<ProgressStructureGroup[]>([]);
  const [activeRow, setActiveRow] = useState<ProgressRow | null>(null);
  const [didCureToday, setDidCureToday] = useState<'yes' | 'no'>('yes');
  const [remark, setRemark] = useState('');
  const [mediaFiles, setMediaFiles] = useState<ProgressMediaItem[]>([]);
  const [manualFileEntryEnabled, setManualFileEntryEnabled] = useState(true);
  const [serverTimeOffsetHours, setServerTimeOffsetHours] = useState(0);
  const [serverNowUtc, setServerNowUtc] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [cameraError, setCameraError] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [presentationElementId, setPresentationElementId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const discardCameraResultRef = useRef(false);

  const loadRows = async () => {
    try {
      setLoading(true);
      const [response, settingsResponse] = await Promise.all([
        progressService.getRows(),
        systemService.getSettings(),
      ]);
      setGroups(response.structures || []);
      setManualFileEntryEnabled(!!settingsResponse.manual_file_entry_enabled);
      setServerTimeOffsetHours(Number(settingsResponse.server_time_offset_hours || 0));
      setServerNowUtc(settingsResponse.server_now_utc || null);
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to load curing progress.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const stopCameraSession = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    mediaChunksRef.current = [];
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setRecording(false);
    setCameraLoading(false);
  };

  useEffect(() => () => {
    stopCameraSession();
  }, []);

  useEffect(() => {
    if (!cameraModalOpen) {
      stopCameraSession();
      setCameraError('');
      return;
    }

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported on this device/browser.');
        return;
      }

      try {
        setCameraLoading(true);
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: cameraMode === 'video',
        });
        streamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          await liveVideoRef.current.play();
        }
      } catch (error: any) {
        setCameraError(error?.message || 'Unable to access camera.');
      } finally {
        setCameraLoading(false);
      }
    };

    void startCamera();
  }, [cameraModalOpen, cameraMode]);

  const getCurrentCaptureLocation = async () => {
    if (!navigator.geolocation) {
      return { latitude: null, longitude: null, timestamp: null };
    }
    return new Promise<{ latitude: number | null; longitude: number | null; timestamp: number | null }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            timestamp: position.timestamp,
          });
        },
        () => {
          resolve({ latitude: null, longitude: null, timestamp: null });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  };

  const formatOffsetTimestamp = (baseUtcMs: number, offsetHours: number) => {
    const shifted = new Date(baseUtcMs + offsetHours * 3600000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shifted.getUTCDate()).padStart(2, '0');
    const hours = String(shifted.getUTCHours()).padStart(2, '0');
    const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
    const seconds = String(shifted.getUTCSeconds()).padStart(2, '0');
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = String(Math.abs(offsetHours)).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${absHours}:00`;
  };

  const resolveFallbackTimestamp = () => {
    const greenwichPlusSix = formatOffsetTimestamp(Date.now(), 6);
    if (greenwichPlusSix) return greenwichPlusSix;

    if (serverNowUtc) {
      const parsedServerNow = Date.parse(serverNowUtc);
      if (!Number.isNaN(parsedServerNow)) {
        return formatOffsetTimestamp(parsedServerNow, serverTimeOffsetHours);
      }
    }

    return new Date().toISOString();
  };

  const resolveMandatoryCaptureContext = async () => {
    const location = await getCurrentCaptureLocation();
    if (location.latitude == null || location.longitude == null) {
      alert('Location access is required before taking photo or video. Turn on browser/site geolocation and try again.');
      return null;
    }
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      capturedAt: location.timestamp ? formatOffsetTimestamp(location.timestamp, 6) : resolveFallbackTimestamp(),
    };
  };

  const ensureLocationEnabledBeforeCapture = async () => {
    const location = await getCurrentCaptureLocation();
    if (location.latitude == null || location.longitude == null) {
      alert('Please enable browser/site geolocation before taking photo or video, then try again.');
      return false;
    }
    return true;
  };

  const openProgressModal = (row: ProgressRow) => {
    setActiveRow(row);
    setDidCureToday('yes');
    setRemark('');
    setMediaFiles([]);
  };

  const appendFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    try {
      await validateMediaFiles(incoming);
      setMediaFiles((current) => [
        ...current,
        ...incoming.map((file) => ({
          file,
          source: 'manual' as const,
          capturedAt: null,
          latitude: null,
          longitude: null,
        })),
      ]);
    } catch (error: any) {
      alert(error.message || 'Invalid media file.');
    }
  };

  const openCameraCapture = async (mode: 'photo' | 'video') => {
    const allowed = await ensureLocationEnabledBeforeCapture();
    if (!allowed) return;
    discardCameraResultRef.current = false;
    setCameraMode(mode);
    setCameraModalOpen(true);
  };

  const closeCameraModal = () => {
    discardCameraResultRef.current = true;
    setCameraModalOpen(false);
  };

  const capturePhoto = async () => {
    const video = liveVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      alert('Camera is not ready yet.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      alert('Unable to capture photo from camera.');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      alert('Unable to capture photo from camera.');
      return;
    }

    const captureContext = await resolveMandatoryCaptureContext();
    if (!captureContext) return;
    const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setMediaFiles((current) => [
      ...current,
      {
        file,
        source: 'camera-photo',
        capturedAt: captureContext.capturedAt,
        latitude: captureContext.latitude,
        longitude: captureContext.longitude,
      },
    ]);
    discardCameraResultRef.current = true;
    closeCameraModal();
  };

  const toggleVideoRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    const stream = streamRef.current;
    if (!stream) {
      alert('Camera is not ready yet.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      alert('Video recording is not supported on this device/browser.');
      return;
    }

    const mimeType =
      (MediaRecorder.isTypeSupported('video/webm;codecs=vp9') && 'video/webm;codecs=vp9') ||
      (MediaRecorder.isTypeSupported('video/webm;codecs=vp8') && 'video/webm;codecs=vp8') ||
      (MediaRecorder.isTypeSupported('video/webm') && 'video/webm') ||
      '';

    try {
      mediaChunksRef.current = [];
      const captureContext = await resolveMandatoryCaptureContext();
      if (!captureContext) return;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        if (discardCameraResultRef.current) {
          setRecording(false);
          return;
        }
        try {
          const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'video/webm' });
          const file = new File([blob], `camera-video-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
          await validateMediaFiles([file]);
          setMediaFiles((current) => [
            ...current,
            {
              file,
              source: 'camera-video',
              capturedAt: captureContext.capturedAt,
              latitude: captureContext.latitude,
              longitude: captureContext.longitude,
            },
          ]);
          discardCameraResultRef.current = true;
          closeCameraModal();
        } catch (error: any) {
          alert(error.message || 'Unable to save captured video.');
        } finally {
          setRecording(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (error: any) {
      alert(error?.message || 'Unable to start video recording.');
    }
  };

  const submitTodayProgress = async () => {
    if (!activeRow) return;
    const formData = new FormData();
    formData.append('drawing_element_id', activeRow.drawing_element_id);
    formData.append('progress_date', isoToday());
    formData.append('did_cure_today', didCureToday);
    formData.append('remark', remark);
    formData.append('media_metadata_json', JSON.stringify(mediaFiles.map((item) => ({
      name: item.file.name,
      source: item.source,
      capturedAt: item.capturedAt ?? null,
      latitude: item.latitude ?? null,
      longitude: item.longitude ?? null,
    }))));
    mediaFiles.forEach((item) => formData.append('files', item.file));

    try {
      setSubmitting(true);
      await progressService.createEntry(formData);
      setActiveRow(null);
      await loadRows();
      alert('Today progress added successfully.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to save today progress.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full flex-col overflow-y-auto px-5 py-4 md:px-8 md:py-8 xl:px-10">
      <div className="mb-8 flex flex-col gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
          <CalendarRange className="h-8 w-8 text-blue-600" /> Curing Progress
        </h1>
        <p className="text-sm font-medium tracking-wide text-slate-500 md:text-base">
          Daily curing updates with progress evidence and element-wise timeline visibility.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center text-sm font-medium italic text-slate-400 shadow-sm">
              No elements with start dates are available for curing progress yet.
            </div>
          )}

          {groups.map((group) => (
            <section key={group.structure_id} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
                <div className="text-xl font-black tracking-tight text-slate-900">{group.structure_name}</div>
                <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  {group.rows.length} elements
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1260px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-white">
                      <th className="w-[6%] px-6 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">SL No</th>
                      <th className="w-[16%] px-4 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Plan - Page</th>
                      <th className="w-[16%] px-4 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Element Name</th>
                      <th className="w-[36%] px-4 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Gantt Chart</th>
                      <th className="w-[12%] px-4 py-4 text-[11px] font-black uppercase tracking-widest text-slate-400">Today&apos;s Progress</th>
                      <th className="w-[14%] px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.rows.map((row, index) => (
                      <tr key={row.drawing_element_id} className="align-top transition-colors hover:bg-slate-50/60">
                        <td className="px-6 py-5 text-sm font-black text-slate-700">{index + 1}</td>
                        <td className="px-4 py-5">
                          <div className="font-black text-slate-900">{row.plan_name}</div>
                          <div className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{row.page_name}</div>
                        </td>
                        <td className="px-4 py-5 text-sm font-black text-slate-900">{row.element_name}</td>
                        <td className="px-4 py-5">
                          <GanttBar row={row} />
                        </td>
                        <td className="px-4 py-5">
                          <button
                            onClick={() => openProgressModal(row)}
                            disabled={row.is_completed}
                            className={`rounded-xl px-4 py-2 text-sm font-black shadow-sm transition-colors ${row.is_completed ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400' : row.today_status === 'added' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}
                          >
                            {row.is_completed ? 'Completed' : row.today_status === 'added' ? 'Added' : 'Pending'}
                          </button>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <button
                            type="button"
                            onClick={() => setPresentationElementId(row.drawing_element_id)}
                            title="Presentation"
                            className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Presentation className="h-4 w-4 text-blue-500" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {activeRow && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 px-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">Today&apos;s Progress</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">{activeRow.element_name} • {activeRow.plan_name} / {activeRow.page_name}</p>
              </div>
              <button onClick={() => setActiveRow(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Did cured today?</label>
                <select
                  value={didCureToday}
                  onChange={(e) => setDidCureToday(e.target.value as 'yes' | 'no')}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Remark</label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"
                  placeholder="Add your progress note"
                />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-500">Evidence</label>
                <div className="flex flex-wrap gap-3">
                  {manualFileEntryEnabled && (
                    <>
                      <input
                        ref={uploadInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.mp4,.webm,.mov,.avi,image/jpeg,image/png,image/webp,image/bmp,image/gif,video/mp4,video/webm,video/quicktime,video/x-msvideo"
                        multiple
                        className="hidden"
                        onChange={(e) => { void appendFiles(e.target.files); e.currentTarget.value = ''; }}
                      />
                      <button
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                      >
                        <Upload className="h-4 w-4 text-blue-500" />
                        Upload Photo / Video
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { void openCameraCapture('photo'); }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    <Camera className="h-4 w-4 text-blue-500" />
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => { void openCameraCapture('video'); }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    <Video className="h-4 w-4 text-blue-500" />
                    Record Video
                  </button>
                </div>
                <p className="mt-2 text-xs font-medium text-slate-400">Multiple files allowed. Videos must be 2 minutes or shorter.</p>
                {mediaFiles.length > 0 && (
                  <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {mediaFiles.map((item, index) => (
                      <div key={`${item.file.name}-${index}`} className="text-sm font-bold text-slate-600">
                        {item.file.name}
                        {item.capturedAt && <span className="ml-2 text-xs font-semibold text-slate-400">captured {new Date(item.capturedAt).toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveRow(null)}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void submitTodayProgress(); }}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Save Progress
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900">
                  {cameraMode === 'photo' ? 'Take Photo' : 'Record Video'}
                </h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Camera capture opens directly here and saves into today&apos;s progress evidence.
                </p>
              </div>
              <button onClick={closeCameraModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-950">
              <div className="relative aspect-video w-full">
                <video ref={liveVideoRef} autoPlay playsInline muted={cameraMode === 'photo'} className="h-full w-full object-cover" />
                {cameraLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 px-6 text-center text-sm font-bold text-white">
                    {cameraError}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCameraModal}
                className="rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              {cameraMode === 'photo' ? (
                <button
                  type="button"
                  onClick={() => { void capturePhoto(); }}
                  disabled={cameraLoading || !!cameraError}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  Capture Photo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { void toggleVideoRecording(); }}
                  disabled={cameraLoading || !!cameraError}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 ${recording ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800'}`}
                >
                  {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {recording ? 'Stop Recording' : 'Start Recording'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <ElementPresentationOverlay
        open={!!presentationElementId}
        drawingElementId={presentationElementId}
        onClose={() => setPresentationElementId(null)}
      />
    </div>
  );
}
