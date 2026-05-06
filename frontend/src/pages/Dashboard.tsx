import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, Clock3, Loader2, MessageSquareText, Phone, Presentation } from 'lucide-react';
import { authService, hierarchyService, notificationService, progressService } from '../services/api';
import ElementPresentationOverlay from '../components/ElementPresentationOverlay';

type GanttDay = {
  date: string;
  did_cure_today: boolean;
  entry_id: number;
};

type ActiveRow = {
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
  gantt_days: GanttDay[];
};

type ActiveGroup = {
  structure_id: number;
  structure_name: string;
  rows: ActiveRow[];
};

type DashboardSummary = {
  today_status: { cured_count: number; active_count: number };
  yesterday_status: { cured_count: number; active_count: number };
  elements_status: { started_count: number; total_declared: number };
  active_groups: ActiveGroup[];
  active_rows: ActiveRow[];
};

type StructureDraft = {
  structure_id: number;
  structure_name: string;
  contractor_id: number | null;
  contractor_name: string | null;
  contractor_mobile_number: string | null;
  message: string;
};

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

function GanttBar({ row }: { row: ActiveRow }) {
  const totalDays = Math.max(row.total_days || 0, 1);
  const progressMap = new Map(row.gantt_days.map((entry) => [entry.date, entry.did_cure_today]));
  const startDate = new Date(`${row.start_date}T00:00:00`);
  const today = new Date();
  const todayIso = localIsoDate(today);
  const markerDate = new Date(`${todayIso}T00:00:00`);
  const todayOffset = Math.max(Math.min(Math.floor((markerDate.getTime() - startDate.getTime()) / 86400000), totalDays - 1), 0);

  return (
    <div className="min-w-[320px]">
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
                title={`${cellDate} · ${hasPositiveProgress ? 'Progress added' : 'No progress'}`}
                className={`h-full border-r border-slate-200 ${hasPositiveProgress ? 'bg-sky-500' : 'bg-white'}`}
                style={{ width: `${100 / totalDays}%` }}
              />
            );
          })}
        </div>
        {!row.is_completed && markerDate >= startDate && (
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

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [messageSaving, setMessageSaving] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [structures, setStructures] = useState<any[]>([]);
  const [selectedStructureId, setSelectedStructureId] = useState<number>(0);
  const [draft, setDraft] = useState<StructureDraft | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [presentationElementId, setPresentationElementId] = useState<string | null>(null);
  const currentUser = authService.getCurrentUser();
  const isMonitor = currentUser?.role === 'monitor';
  const isContractor = currentUser?.role === 'contractor';
  const selectedStructure = useMemo(
    () => structures.find((structure) => structure.id === selectedStructureId) || null,
    [structures, selectedStructureId],
  );

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const summaryResponse = await progressService.getDashboardSummary();
      setSummary(summaryResponse);

      if (isMonitor && currentUser?.user_id) {
        const projects = await hierarchyService.getProjects(currentUser.user_id);
        const packageLists = await Promise.all(projects.map((project: any) => hierarchyService.getPackages(project.id)));
        const packages = packageLists.flat();
        const structureLists = await Promise.all(packages.map((pkg: any) => hierarchyService.getStructures(pkg.id)));
        const allStructures = structureLists.flat().filter((structure: any) => structure.contractor_id);
        setStructures(allStructures);
      }
    } catch (error) {
      console.error('Failed to load dashboard data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (!selectedStructureId || !isMonitor) {
      setDraft(null);
      setCustomMessage('');
      return;
    }
    const loadDraft = async () => {
      try {
        const response = await notificationService.getStructureDraft(selectedStructureId);
        setDraft(response);
        setCustomMessage(response.message || '');
      } catch (error: any) {
        setDraft(null);
        setCustomMessage('');
        alert(error.response?.data?.detail || 'Failed to load structure SMS draft.');
      }
    };
    void loadDraft();
  }, [selectedStructureId, isMonitor]);

  const selectedActiveRows = useMemo(() => {
    const rows = summary?.active_rows || [];
    if (!selectedStructureId) return [];
    return rows.filter((row) => row.structure_id === selectedStructureId);
  }, [summary, selectedStructureId]);

  const handleSendCustomMessage = async () => {
    if (!draft?.contractor_id) {
      alert('Select a structure with assigned contractor first.');
      return;
    }
    const trimmedMessage = customMessage.trim();
    if (!trimmedMessage) {
      alert('Type a custom message first.');
      return;
    }

    try {
      setMessageSaving(true);
      await notificationService.sendCustomMessage({
        contractor_id: draft.contractor_id,
        structure_id: draft.structure_id,
        message: trimmedMessage,
      });
      alert('Instruction sent successfully.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to send instruction.');
    } finally {
      setMessageSaving(false);
    }
  };

  if (loading || !summary) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
          <p className="font-medium text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto px-5 py-4 md:px-8 md:py-8 xl:px-10">
      <div className="mb-8 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Project Overview</h1>
          <p className="mt-2 text-base font-medium text-slate-500">Live curing health, active elements, and contractor communication.</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Sync Status</p>
          <div className="flex items-center justify-end gap-2 font-medium text-green-600">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Live from Field
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Clock3 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Today&apos;s Status (cured/active element)</p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {summary.today_status.cured_count}/{summary.today_status.active_count}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <CalendarRange className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Elements (start date set/total declared)</p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {summary.elements_status.started_count}/{summary.elements_status.total_declared}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Yesterday&apos;s Status (cured/active element)</p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                {summary.yesterday_status.cured_count}/{summary.yesterday_status.active_count}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <h3 className="text-lg font-black text-slate-900">Active Curing Elements</h3>
          <p className="mt-1 text-sm font-medium text-slate-500">Elements whose curing period includes today.</p>
        </div>

        <div className="space-y-8 p-6">
          {summary.active_groups.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm font-medium italic text-slate-400">
              No active curing elements for today.
            </div>
          ) : (
            summary.active_groups.map((group) => (
              <section key={group.structure_id} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-white px-6 py-5">
                  <div className="text-xl font-black tracking-tight text-slate-900">{group.structure_name}</div>
                  <div className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{group.rows.length} active elements</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1240px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/60">
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
                            <span className={`inline-flex rounded-xl border px-4 py-2 text-sm font-black shadow-sm ${row.today_status === 'added' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                              {row.today_status === 'added' ? 'Added' : 'Pending'}
                            </span>
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
            ))
          )}
        </div>
      </div>

      {isMonitor && !isContractor && (
        <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
              <h3 className="text-lg font-black text-slate-900">Custom SMS Instruction</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Select a structure, load the drafted SMS, then edit if needed before sending.</p>
            </div>
            <div className="space-y-5 p-6">
              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-400">Target Structure</label>
                <select
                  value={selectedStructureId || ''}
                  onChange={(e) => setSelectedStructureId(Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                >
                  <option value="">Select structure</option>
                  {structures.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
                    </option>
                  ))}
                </select>
              </div>

              {draft && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <Phone className="h-4 w-4 text-blue-500" />
                    {draft.contractor_name || 'No contractor assigned'}
                  </div>
                  <div className="mt-1 text-sm font-bold text-slate-500">
                    {draft.contractor_mobile_number || 'No mobile number'}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-[11px] font-black uppercase tracking-widest text-slate-400">Message</label>
                <textarea
                  rows={5}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Drafted SMS will appear here after selecting a structure..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => { void handleSendCustomMessage(); }}
                  disabled={messageSaving || !draft?.contractor_id}
                  className="inline-flex h-[48px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {messageSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                  Send Message
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
              <h3 className="text-lg font-black text-slate-900">Scheduled Elements</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {selectedStructure ? selectedStructure.name : 'Select a structure to load only today-scheduled elements.'}
              </p>
            </div>
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">SL</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Elements</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Start</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">End</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-400">Today&apos;s Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedActiveRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm font-medium italic text-slate-400">
                        {selectedStructure ? 'No scheduled elements for today.' : 'Select a structure to view scheduled elements.'}
                      </td>
                    </tr>
                  ) : (
                    selectedActiveRows.map((row, index) => (
                      <tr key={row.drawing_element_id} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-4 py-4 text-sm font-black text-slate-700">{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-black text-slate-900">{row.element_name}</div>
                          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{row.structure_name}</div>
                        </td>
                        <td className="px-4 py-4 text-sm font-black text-slate-700">{formatShortDate(row.start_date)}</td>
                        <td className="px-4 py-4 text-sm font-black text-slate-700">{formatShortDate(row.end_date)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-xl border px-3 py-1.5 text-xs font-black shadow-sm ${row.today_status === 'added' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                            {row.today_status === 'added' ? 'Added' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
