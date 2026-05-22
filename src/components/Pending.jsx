import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Clock, ShieldAlert, LogOut, RefreshCw, CheckCircle, FileText } from 'lucide-react';

export default function Pending({ profile, onSignOut, onRefreshProfile }) {
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const checkStatus = async () => {
    setChecking(true);
    setErrorMsg('');
    try {
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single();

      if (error) throw error;

      if (updatedProfile.is_approved) {
        onRefreshProfile(updatedProfile);
      } else {
        // Still pending
        setErrorMsg('Your account is still awaiting approval by the Admin.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not verify status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
      
      {/* Decorative waiting illustration */}
      <div className="mx-auto w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center relative">
        <Clock className="w-12 h-12 text-emerald-600 animate-pulse" />
        <span className="absolute bottom-1 right-1 w-6 h-6 bg-amber-400 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-bold">
          !
        </span>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold text-slate-800">Verification Pending</h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          Welcome, <span className="font-bold text-slate-700">{profile.org_name}</span>! Your registration is currently under review by our administrative team.
        </p>
      </div>

      {/* Stepper detail */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-left space-y-3">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Review Pipeline</h4>
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            ✓
          </div>
          <span className="text-xs text-slate-600">Email & Profile Created</span>
        </div>
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            ✓
          </div>
          <span className="text-xs text-slate-600 flex items-center">
            Aadhaar Uploaded
            {profile.aadhaar_url && (
              <a 
                href={profile.aadhaar_url} 
                target="_blank" 
                rel="noreferrer" 
                className="ml-1 text-[10px] text-emerald-600 hover:underline flex items-center"
              >
                (<FileText className="w-2.5 h-2.5 mr-0.5" /> view doc)
              </a>
            )}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold flex-shrink-0 animate-ping absolute" />
          <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold flex-shrink-0 relative">
            …
          </div>
          <span className="text-xs text-slate-700 font-bold">Awaiting Admin Verification</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Interactive buttons */}
      <div className="flex gap-3">
        <button
          onClick={checkStatus}
          disabled={checking}
          className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center space-x-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
          <span>{checking ? 'Checking...' : 'Refresh Status'}</span>
        </button>

        <button
          onClick={onSignOut}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-3 rounded-xl text-xs transition-all flex items-center justify-center"
        >
          <LogOut className="w-3.5 h-3.5 mr-1 text-slate-500" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
