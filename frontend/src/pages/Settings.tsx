import React, { useState } from 'react';
import { Settings as SettingsIcon, KeyRound, Loader2 } from 'lucide-react';
import { authService, systemService, userService } from '../services/api';

export default function Settings() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [manualFileEntryEnabled, setManualFileEntryEnabled] = useState(true);
  const currentUser = authService.getCurrentUser();
  const isSuperadmin = currentUser?.role === 'superadmin';

  React.useEffect(() => {
    if (!isSuperadmin) return;
    const loadSystemSettings = async () => {
      try {
        const response = await systemService.getSettings();
        setManualFileEntryEnabled(!!response.manual_file_entry_enabled);
      } catch {
        // Keep current value on load failure.
      }
    };
    void loadSystemSettings();
  }, [isSuperadmin]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", type: "error" });
      return;
    }
    if (password.length < 6) {
      setMessage({ text: "Password must be at least 6 characters.", type: "error" });
      return;
    }

    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      // We will need the current logged in user's ID. 
      // The backend needs an endpoint to change own password, or we use update_user if it allows it.
      // Wait, currently update_user requires ID. 
      // To simplify, let's just make a call to a new endpoint or update_user if the backend accepts it.
      // Actually, since we don't have the user ID easily available in the frontend state without decoding the token,
      // let's decode the token to get the user_id.
      const token = localStorage.getItem('token');
      if (!token) throw new Error("No token found");
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(window.atob(base64));
      
      await userService.update_user(payload.user_id, { password });
      setMessage({ text: "Password updated successfully!", type: "success" });
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || "Failed to update password.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleManualFileEntryToggle = async () => {
    try {
      setSettingsLoading(true);
      const nextValue = !manualFileEntryEnabled;
      const response = await systemService.updateSettings({ manual_file_entry_enabled: nextValue });
      setManualFileEntryEnabled(!!response.manual_file_entry_enabled);
      setMessage({ text: 'System setting updated successfully.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.response?.data?.detail || 'Failed to update system setting.', type: 'error' });
    } finally {
      setSettingsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1200px] mx-auto h-[calc(100vh-4rem)] flex flex-col overflow-y-auto">
      <div className="mb-6 md:mb-8 shrink-0">
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-blue-600" /> System Settings
        </h1>
        <p className="text-sm md:text-base text-slate-500 font-medium tracking-wide mt-1">
          Manage your personal account profile and security credentials.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-10 shadow-sm max-w-2xl">
        <h2 className="text-xl font-extrabold text-slate-900 mb-6 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-blue-600" /> Security & Password
        </h2>
        
        {message.text && (
          <div className={`p-4 rounded-xl mb-6 font-bold text-sm ${message.type === 'error' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-5">
          <div>
            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">New Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password..." 
              className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
            />
          </div>
          <div>
            <label className="block text-[11px] font-extrabold text-slate-500 uppercase tracking-widest mb-2.5">Confirm Password</label>
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password..." 
              className="w-full border-2 border-slate-200 rounded-xl p-3.5 font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
            />
          </div>
          <button 
            type="submit" 
            disabled={loading || !password || !confirmPassword}
            className="w-full py-4 rounded-xl bg-blue-600 text-white font-black shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'UPDATE PASSWORD'}
          </button>
        </form>
      </div>

      {isSuperadmin && (
        <div className="mt-6 bg-white border border-slate-200 rounded-3xl p-6 md:p-10 shadow-sm max-w-2xl">
          <h2 className="text-xl font-extrabold text-slate-900 mb-6">Progress Upload Control</h2>
          <div className="flex items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Manual File Entry</div>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Turn manual photo/video upload on or off in the curing progress modal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { void handleManualFileEntryToggle(); }}
              disabled={settingsLoading}
              className={`inline-flex min-w-[92px] items-center justify-center rounded-full px-4 py-2 text-sm font-black transition-colors ${manualFileEntryEnabled ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {settingsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : manualFileEntryEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
