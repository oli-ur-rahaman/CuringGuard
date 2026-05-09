import { Eye, MapPin, Trash2 } from 'lucide-react';

type ProgressMediaItem = {
  file: File;
  source: string;
  capturedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type ProgressMediaListProps = {
  items: ProgressMediaItem[];
  onPreview: (item: ProgressMediaItem) => void;
  onRemove: (index: number) => void;
};

export default function ProgressMediaList({ items, onPreview, onRemove }: ProgressMediaListProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      {items.map((item, index) => {
        const isVideo = item.file.type.startsWith('video/');
        const hasLocation = item.latitude != null && item.longitude != null;
        return (
          <div key={`${item.file.name}-${index}-${item.file.size}`} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-700">{item.file.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span>{isVideo ? 'Video' : 'Image'}</span>
                <span>{item.source.replace(/-/g, ' ')}</span>
                {item.capturedAt && <span>{new Date(item.capturedAt).toLocaleString()}</span>}
                {hasLocation && (
                  <span className="inline-flex items-center gap-1 text-sky-600">
                    <MapPin className="h-3 w-3" />
                    Tagged
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onPreview(item)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                title="Preview"
              >
                <Eye className="h-4 w-4 text-blue-500" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50"
                title="Remove"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
