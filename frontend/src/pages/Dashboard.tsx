import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Loader2, MessageSquareText, Send } from 'lucide-react';
import { authService, curingService, notificationService, userService } from '../services/api';

export default function Dashboard() {
  const [elements, setElements] = useState<any[]>([]);
  const [contractors, setContractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageSaving, setMessageSaving] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState<number>(0);
  const [customMessage, setCustomMessage] = useState('');
  const currentUser = authService.getCurrentUser();
  const isMonitor = currentUser?.role === 'monitor';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [data, contractorData] = await Promise.all([
          curingService.getElements(),
          isMonitor ? userService.getUsers(undefined, 'contractor') : Promise.resolve([]),
        ]);
        setElements(data);
        setContractors(contractorData);
      } catch (error) {
        console.error("Failed to fetch elements", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <p className="text-slate-500 font-medium">Loading Field Data...</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  
  const activeCuring = elements.filter(el => 
    el.poured_date && new Date(el.curing_end_date) > now
  );

  const completed = elements.filter(el => 
    el.poured_date && new Date(el.curing_end_date) <= now
  );

  const actionRequired = activeCuring.filter(el => {
    const endDate = new Date(el.curing_end_date);
    const diff = endDate.getTime() - now.getTime();
    return diff < (1000 * 60 * 60 * 24 * 2); // Within 48 hours for warning
  });

  const selectedContractor = useMemo(
    () => contractors.find((contractor) => contractor.id === selectedContractorId) || null,
    [contractors, selectedContractorId]
  );

  const handlePing = async (contractorId: number, elementId: string) => {
    try {
      await userService.pingUser(contractorId, `URGENT: Curing monitor for ${elementId} requires immediate attention.`);
      alert("Ping notification sent via Green Heritage IT SMS.");
    } catch (error) {
      alert("Failed to send notification.");
    }
  };

  const handleSendCustomMessage = async () => {
    if (!selectedContractorId) {
      alert('Select a contractor first.');
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
        contractor_id: selectedContractorId,
        message: trimmedMessage,
      });
      setCustomMessage('');
      alert('Instruction sent successfully.');
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to send instruction.');
    } finally {
      setMessageSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Project Overview</h1>
          <p className="text-slate-500 mt-2">Active Curing Monitoring for Phase 1 Substructure</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Sync Status</p>
          <div className="flex items-center gap-2 text-green-600 font-medium">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Live from Field
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start transition-all hover:shadow-md">
          <div className="p-3 rounded-lg bg-blue-50 text-blue-600">
            <Clock className="w-8 h-8" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-500">Active Curing Elements</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{activeCuring.length}</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-start transition-all hover:shadow-md">
          <div className="p-3 rounded-lg bg-green-50 text-green-600">
            <span className="flex items-center justify-center"><CheckCircle2 className="w-8 h-8" /></span>
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-slate-500">Completed Elements</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{completed.length}</p>
          </div>
        </div>

        <div className={`bg-white rounded-xl border p-6 shadow-sm flex items-start transition-all hover:shadow-md ${actionRequired.length > 0 ? 'border-red-200 ring-1 ring-red-100' : 'border-slate-200'}`}>
          <div className={`p-3 rounded-lg ${actionRequired.length > 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="ml-4">
            <p className={`text-sm font-medium ${actionRequired.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>Requires Action Soon</p>
            <p className={`text-3xl font-bold mt-1 ${actionRequired.length > 0 ? 'text-red-700' : 'text-slate-900'}`}>{actionRequired.length}</p>
          </div>
        </div>
      </div>

      {/* Needs Attention Panel */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">Critical Curing Elements</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 uppercase">Field Tracking</span>
        </div>
        <div className="divide-y divide-slate-200">
          {actionRequired.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500 italic">
              No critical curing actions required at this time.
            </div>
          ) : (
            actionRequired.map((el) => {
              const endDate = new Date(el.curing_end_date);
              const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              
              return (
                <div key={el.element_id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${daysLeft <= 1 ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                    <div>
                      <p className="font-medium text-slate-900">{el.element_type} - {el.element_id}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Ends on {endDate.toLocaleDateString()} ({daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining)
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handlePing(el.contractor_id, el.element_id)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-md transition-all active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                    Ping Contractor
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isMonitor && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Custom SMS Instruction</h3>
              <p className="text-sm text-slate-500 mt-1">Send direct curing instructions to a contractor. Sender name will be your full name.</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 uppercase">SMS + Web</span>
          </div>
          <div className="p-6 grid grid-cols-1 xl:grid-cols-[320px_1fr_auto] gap-4 items-start">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Target Contractor</label>
              <select
                value={selectedContractorId || ''}
                onChange={(e) => setSelectedContractorId(Number(e.target.value || 0))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              >
                <option value="">Select contractor</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>
                    {contractor.full_name || contractor.username}
                  </option>
                ))}
              </select>
              {selectedContractor && (
                <p className="mt-2 text-xs font-bold text-slate-500">
                  {selectedContractor.mobile_number || 'No mobile number'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Message</label>
              <textarea
                rows={3}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Type custom curing instruction for the selected contractor..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <button
              onClick={() => { void handleSendCustomMessage(); }}
              disabled={messageSaving}
              className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {messageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquareText className="w-4 h-4" />}
              Send Message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
