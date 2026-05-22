import React, { useState } from 'react';
import { saveSupabaseConfig, getSupabaseConfig } from '../supabaseClient';
import { Database, Key, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SupabaseConfigModal() {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.supabaseUrl || '');
  const [key, setKey] = useState(currentConfig.supabaseAnonKey || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.startsWith('https://')) {
      setError('Supabase URL must start with https://');
      return;
    }
    if (key.length < 20) {
      setError('Please enter a valid Supabase Anonymous Key.');
      return;
    }
    setError('');
    saveSupabaseConfig(url, key);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden transform transition-all">
        <div className="p-6 bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
          <div className="flex items-center space-x-3">
            <Database className="w-8 h-8 animate-pulse" />
            <div>
              <h2 className="text-xl font-bold">Configure Supabase Backend</h2>
              <p className="text-emerald-100 text-xs mt-0.5">Please connect your free-tier database instance</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>
              If you haven't configured environment variables, enter your project details here. They will be saved in your browser's local storage.
            </span>
          </div>

          {error && (
            <div className="text-red-600 text-xs font-semibold bg-red-50 border border-red-200 p-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Supabase Project URL
            </label>
            <div className="relative">
              <Database className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-project-id.supabase.co"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Supabase Anon/Public Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <textarea
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all resize-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 text-sm mt-6"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Connect & Launch App</span>
          </button>
        </form>
      </div>
    </div>
  );
}
