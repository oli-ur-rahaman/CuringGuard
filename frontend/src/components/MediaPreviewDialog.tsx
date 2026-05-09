import { useEffect, useMemo } from 'react';
import { ExternalLink, MapPin, X } from 'lucide-react';

type PreviewItem = {
  file: File;
  capturedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type MediaPreviewDialogProps = {
  item: PreviewItem | null;
  onClose: () => void;
};

export default function MediaPreviewDialog({ item, onClose }: MediaPreviewDialogProps) {
  const objectUrl = useMemo(() => (item ? URL.createObjectURL(item.file) : ''), [item]);

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  if (!item) return null;

  const isVideo = item.file.type.startsWith('video/');
  const hasLocation = item.latitude != null && item.longitude != null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-3 sm:p-6">
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[24px] bg-slate-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 text-white sm:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-black sm:text-base">{item.file.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/65 sm:text-sm">
              {item.capturedAt && <span>{new Date(item.capturedAt).toLocaleString()}</span>}
              {hasLocation && (
                <button
                  type="button"
                  onClick={() => window.open(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`, '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-white transition-colors hover:bg-white/20"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Open Map
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3 sm:p-6">
          {isVideo ? (
            <video src={objectUrl} controls playsInline className="max-h-full max-w-full rounded-2xl bg-black object-contain" />
          ) : (
            <img src={objectUrl} alt={item.file.name} className="max-h-full max-w-full rounded-2xl object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
