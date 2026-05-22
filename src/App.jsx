import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, clearSupabaseConfig } from './supabaseClient';
import SupabaseConfigModal from './components/SupabaseConfigModal';
import Login from './components/Login';
import Register from './components/Register';
import Pending from './components/Pending';
import AdminDashboard from './components/AdminDashboard';
import DonorDashboard from './components/DonorDashboard';
import RecipientDashboard from './components/RecipientDashboard';
import { Database, ShieldCheck, HelpCircle, Loader } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // Router states: 'login' | 'register' | 'pending' | 'admin' | 'donor' | 'recipient'
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(!isSupabaseConfigured());

  useEffect(() => {
    if (configMissing) {
      setLoading(false);
      return;
    }

    // Check active auth session with a timeout fallback
    const initSession = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        
        // Timeout after 8 seconds to prevent infinite spinners if DB is hung
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timed out.')), 8000)
        );
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (session?.user) {
          setUser(session.user);
          await loadUserProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Session init error (DB might be hung):', err);
        
        setLoading(false);
        setUser(null);
        setProfile(null);
        setView('login');
        
        if (err.message?.includes('timed out')) {
          const currentUrl = localStorage.getItem('supabaseUrl') || import.meta.env.VITE_SUPABASE_URL || 'UNKNOWN';
          const reset = window.confirm(`Database connection timed out.\\n\\nThe app tried to connect to:\\n${currentUrl}\\n\\nIf this URL is incorrect or the database is asleep, click OK to reset your settings and enter them again in the popup dialog.`);
          if (reset) {
            clearSupabaseConfig();
          }
        }
      }
    };

    initSession();

    // Listen for Auth status changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth status change event:', event);
      if (session?.user) {
        setUser(session.user);
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setView('login');
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [configMissing]);

  const loadUserProfile = async (uid) => {
    setLoading(true);
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
        
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timed out.')), 8000)
      );

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);

      if (error) {
        setView('register');
      } else {
        setProfile(data);
        routeUser(data);
      }
    } catch (err) {
      console.error('Error loading profile (DB might be hung):', err);
      setView('login');
      if (err.message?.includes('timed out')) {
        alert('Database connection timed out while loading profile. Please check for infinite RLS recursion policies in Supabase.');
      }
    } finally {
      setLoading(false);
    }
  };

  const routeUser = (p) => {
    if (!p) {
      setView('login');
      return;
    }
    
    // Redirect to moderation screen if not approved yet
    if (!p.is_approved && p.user_type !== 'Admin') {
      setView('pending');
      return;
    }

    // Role-based routing logic
    if (p.user_type === 'Admin') {
      setView('admin');
    } else if (p.user_type === 'Restaurant' || p.user_type === 'Grocery Shop') {
      setView('donor');
    } else if (p.user_type === 'Social Worker' || p.user_type === 'Orphanage') {
      setView('recipient');
    } else {
      setView('login');
    }
  };

  const handleSetUser = (u, p) => {
    setUser(u);
    setProfile(p);
    routeUser(p);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setView('login');
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshProfile = (updatedProfile) => {
    setProfile(updatedProfile);
    routeUser(updatedProfile);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-between antialiased selection:bg-emerald-500 selection:text-white">
      
      {/* Background visual gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/20 via-slate-900 to-slate-950 pointer-events-none z-0"></div>

      {/* Connection Indicator Bar */}
      <div className="relative z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 text-[10px] text-slate-400 py-1.5 px-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Database className={`w-3.5 h-3.5 ${configMissing ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}`} />
          <span>
            {configMissing 
              ? 'Supabase Backend Offline' 
              : 'Supabase Backend Connected'
            }
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setConfigMissing(true)}
            className="hover:text-white transition-all underline font-bold"
          >
            Database Settings
          </button>
          {profile && (
            <span className="flex items-center text-emerald-500 font-bold">
              <ShieldCheck className="w-3 h-3 mr-0.5" />
              Verified Profile: {profile.org_name}
            </span>
          )}
        </div>
      </div>

      {/* Screen Loader / Main View Wrapper */}
      <div className="flex-1 flex items-center justify-center p-4 z-10 relative">
        {configMissing ? (
          <SupabaseConfigModal />
        ) : loading ? (
          <div className="flex flex-col items-center space-y-3">
            <Loader className="w-8 h-8 text-emerald-500 animate-spin" />
            <span className="text-xs text-slate-400 font-medium">Synchronizing session credentials...</span>
          </div>
        ) : (
          /* Route matching switch */
          <>
            {view === 'login' && (
              <Login onViewChange={setView} onSetUser={handleSetUser} />
            )}
            {view === 'register' && (
              <Register onViewChange={setView} onSetUser={handleSetUser} />
            )}
            {view === 'pending' && (
              <Pending 
                profile={profile} 
                onSignOut={handleSignOut} 
                onRefreshProfile={handleRefreshProfile} 
              />
            )}
            {view === 'admin' && (
              <AdminDashboard onSignOut={handleSignOut} />
            )}
            {view === 'donor' && (
              <DonorDashboard profile={profile} onSignOut={handleSignOut} />
            )}
            {view === 'recipient' && (
              <RecipientDashboard profile={profile} onSignOut={handleSignOut} />
            )}
          </>
        )}
      </div>

      {/* Footer bar */}
      <footer className="relative z-10 bg-slate-950/60 border-t border-slate-800/40 text-[9px] text-slate-600 text-center py-2.5">
        <p>Community Resource Sharing Bridge © 2026. Made with OpenStreetMap & Supabase.</p>
      </footer>
    </div>
  );
}
