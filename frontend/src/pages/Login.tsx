import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authService } from '../services/api';
import logoFinal from '../assets/logo_final.png';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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
          </form>
        </div>
      </div>
    </div>
  );
}
