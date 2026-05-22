import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, ShieldAlert, KeyRound, Info } from 'lucide-react';

export default function Login({ onViewChange, onSetUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Authenticate with Supabase Auth
      let authData;
      let authError;
      
      try {
        const res = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        authData = res.data;
        authError = res.error;
      } catch (err) {
        authError = err;
      }

      // If sign in fails, and credentials match the admin defaults, auto-provision the admin account!
      if (authError && email === 'admin@gmail.com' && password === 'ADMINISSOG') {
        console.log('Admin account does not exist. Auto-provisioning admin user...');
        
        // Sign up admin user
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error('Admin signup returned empty user.');

        // Insert Admin Profile (DB trigger on_profile_insert will guarantee Admin privileges)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: signUpData.user.id,
              org_name: 'Bridge Admin',
              email: email,
              phone: '9999999999',
              user_type: 'Admin',
              aadhaar_url: null,
              location_coords: { lat: 12.9716, lng: 77.5946 },
              is_approved: true
            }
          ]);

        if (profileError) throw profileError;

        // Sign in again to get session
        const loginRes = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (loginRes.error) throw loginRes.error;
        authData = loginRes.data;
        authError = null;
      } else if (authError) {
        throw authError;
      }

      const user = authData.user;
      if (!user) throw new Error('Auth returned null user.');

      // 2. Fetch the corresponding profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error('Profile details not found. Please register.');
      }

      // Check if user is approved (Admin is auto-approved by database trigger)
      onSetUser(user, profile);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail('admin@gmail.com');
    setPassword('ADMINISSOG');
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
      
      {/* Visual Header banner */}
      <div className="p-8 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-center">
        <h2 className="text-3xl font-black tracking-tight">Resource Bridge</h2>
        <p className="text-emerald-100 text-xs mt-1">Connecting resource donors with verified local orphanages and social workers.</p>
      </div>

      <form onSubmit={handleLogin} className="p-8 space-y-5">
        <h3 className="text-lg font-bold text-slate-800 text-center">Account Sign In</h3>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Email field */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="org@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center space-x-2 text-sm disabled:opacity-50"
        >
          <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
        </button>

        {/* Separator / Demo helper */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs font-semibold uppercase">
            <span className="bg-white px-2 text-slate-400">Sandbox Testing</span>
          </div>
        </div>

        {/* Quick seed helpers */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleFillAdmin}
            className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-2 transition-all"
          >
            <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
            <span>Load Admin Credentials</span>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pt-2 text-xs">
          <span className="text-slate-500">Need an account? </span>
          <button
            type="button"
            onClick={() => onViewChange('register')}
            className="font-bold text-emerald-600 hover:text-emerald-700 underline"
          >
            Register Organization
          </button>
        </div>
      </form>
    </div>
  );
}
