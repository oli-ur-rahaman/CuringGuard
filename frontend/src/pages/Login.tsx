import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Loader2, AlertCircle, Eye, EyeOff, Phone, KeyRound, BadgeAlert, X } from 'lucide-react';
import { authService } from '../services/api';
import logoFinal from '../assets/logo_final.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotStage, setForgotStage] = useState<'mobile' | 'otp' | 'reset'>('mobile');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotMobileNumber, setForgotMobileNumber] = useState('');
  const [forgotRequestId, setForgotRequestId] = useState<number | null>(null);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const navigate = useNavigate();

  const resetForgotPasswordState = () => {
    setForgotStage('mobile');
    setForgotLoading(false);
    setForgotError('');
    setForgotSuccess('');
    setForgotUsername('');
    setForgotMobileNumber('');
    setForgotRequestId(null);
    setForgotOtp('');
    setForgotResetToken('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const openForgotPassword = () => {
    resetForgotPasswordState();
    setForgotPasswordOpen(true);
  };

  const closeForgotPassword = () => {
    setForgotPasswordOpen(false);
    resetForgotPasswordState();
  };

  const normalizeDigits = (value: string, maxLength: number) => value.replace(/\D/g, '').slice(0, maxLength);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authService.login(username, password);
      // Simple role check from token or response
      const token = data.access_token;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(window.atob(base64));
      
      if (payload.role === 'superadmin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      if (!err.response) {
        setError(`Cannot reach backend server from this device. Open the app using your PC Wi‑Fi IP and make sure port 8000 is reachable.`);
      } else {
        setError(err.response?.data?.detail || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setForgotError('Login ID / email is required.');
      return;
    }
    if (!/^\d{11}$/.test(forgotMobileNumber)) {
      setForgotError('Mobile number must be exactly 11 digits.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const result = await authService.requestPasswordResetOtp(forgotUsername.trim(), forgotMobileNumber);
      setForgotRequestId(result.request_id);
      setForgotStage('otp');
      setForgotSuccess(result.message);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotRequestId) {
      setForgotError('Password reset request is missing. Start again.');
      return;
    }
    if (!/^\d{6}$/.test(forgotOtp)) {
      setForgotError('OTP must be exactly 6 digits.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const result = await authService.verifyPasswordResetOtp(forgotRequestId, forgotMobileNumber, forgotOtp);
      setForgotResetToken(result.reset_token);
      setForgotStage('reset');
      setForgotSuccess(result.message);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || 'Failed to verify OTP.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotPasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotRequestId || !forgotResetToken) {
      setForgotError('Password reset session is invalid. Start again.');
      return;
    }
    if (newPassword.length < 6) {
      setForgotError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setForgotError('Passwords do not match.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const result = await authService.resetPasswordWithOtp(forgotRequestId, forgotMobileNumber, forgotResetToken, newPassword);
      setForgotSuccess(result.message);
      window.setTimeout(() => {
        closeForgotPassword();
      }, 1200);
    } catch (err: any) {
      setForgotError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* LOGO AREA */}
        <div className="text-center mb-8">
          <img src={logoFinal} alt="CuringGuard Logo" className="w-48 h-auto mx-auto mb-4 drop-shadow-sm" />
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Curing<span className="text-blue-600">Guard</span></h1>
        </div>

        {/* LOGIN FORM */}
        <div className="bg-white border border-gray-200 rounded-[2.5rem] p-8 md:p-10 shadow-xl">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 ml-1">Username / ID</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-gray-900 font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all placeholder:text-gray-400" 
                  placeholder="Enter your root ID"
                  required
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 ml-1">Master Password</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-2xl py-4 pl-12 pr-12 text-gray-900 font-bold focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all placeholder:text-gray-400" 
                  placeholder="••••••••"
                  required
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl flex items-center gap-3 text-sm font-bold animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg mt-4"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'AUTHENTICATE ACCESS'}
            </button>

            <div className="flex items-center justify-between gap-4 px-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setSignUpOpen(true)}
                className="text-slate-500 transition-colors hover:text-blue-600"
              >
                Sign up
              </button>
              <button
                type="button"
                onClick={openForgotPassword}
                className="text-slate-500 transition-colors hover:text-blue-600"
              >
                Forgot password?
              </button>
            </div>
          </form>
        </div>
      </div>

      {signUpOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Sign up</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">New accounts are created by phone confirmation.</p>
              </div>
              <button
                type="button"
                onClick={() => setSignUpOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
              Please call <span className="font-black text-blue-600">01410248821</span> for sign up.
            </div>
            <button
              type="button"
              onClick={() => setSignUpOpen(false)}
              className="mt-6 w-full rounded-2xl bg-blue-600 py-3 text-sm font-black text-white transition-colors hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Forgot password</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {forgotStage === 'mobile' && 'Enter the registered mobile number to receive an OTP.'}
                  {forgotStage === 'otp' && 'Enter the 6-digit OTP sent to your phone.'}
                  {forgotStage === 'reset' && 'Set a new password for this account.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForgotPassword}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {forgotError && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-600">
                <BadgeAlert className="h-5 w-5 shrink-0" />
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                {forgotSuccess}
              </div>
            )}

            {forgotStage === 'mobile' && (
              <form onSubmit={handleForgotPasswordMobileSubmit} className="space-y-5">
                <div>
                  <label className="mb-3 ml-1 block text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Login ID / Email</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={forgotUsername}
                      onChange={(e) => setForgotUsername(e.target.value)}
                      className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-4 pl-12 pr-4 font-bold text-gray-900 transition-all placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      placeholder="Enter your login ID"
                      required
                    />
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-3 ml-1 block text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Mobile Number</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={forgotMobileNumber}
                      onChange={(e) => setForgotMobileNumber(normalizeDigits(e.target.value, 11))}
                      className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-4 pl-12 pr-4 font-bold text-gray-900 transition-all placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      placeholder="01XXXXXXXXX"
                      required
                    />
                    <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'SEND OTP'}
                </button>
              </form>
            )}

            {forgotStage === 'otp' && (
              <form onSubmit={handleForgotPasswordOtpSubmit} className="space-y-5">
                <div>
                  <label className="mb-3 ml-1 block text-[11px] font-extrabold uppercase tracking-widest text-gray-500">OTP</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(normalizeDigits(e.target.value, 6))}
                      className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-4 pl-12 pr-4 font-bold tracking-[0.35em] text-gray-900 transition-all placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      placeholder="000000"
                      required
                    />
                    <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForgotStage('mobile')}
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'VERIFY OTP'}
                  </button>
                </div>
              </form>
            )}

            {forgotStage === 'reset' && (
              <form onSubmit={handleForgotPasswordResetSubmit} className="space-y-5">
                <div>
                  <label className="mb-3 ml-1 block text-[11px] font-extrabold uppercase tracking-widest text-gray-500">New Password</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-4 pl-12 pr-4 font-bold text-gray-900 transition-all placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      placeholder="At least 6 characters"
                      required
                    />
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-3 ml-1 block text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Confirm Password</label>
                  <div className="relative">
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 py-4 pl-12 pr-4 font-bold text-gray-900 transition-all placeholder:text-gray-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
                      placeholder="Repeat the password"
                      required
                    />
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {forgotLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'RESET PASSWORD'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
