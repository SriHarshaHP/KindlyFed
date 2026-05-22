import React, { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import Login from './components/Login';
import Register from './components/Register';
import Pending from './components/Pending';
import AdminDashboard from './components/AdminDashboard';
import DonorDashboard from './components/DonorDashboard';
import RecipientDashboard from './components/RecipientDashboard';
import LeaderboardView from './components/LeaderboardView';
import { Database, ShieldCheck, Loader, AlertTriangle, WifiOff } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // Router states: 'login' | 'register' | 'pending' | 'admin' | 'donor' | 'recipient' | 'leaderboard'
  const [view, setView] = useState('login');
  const [loading, setLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(!isSupabaseConfigured());
  const [dbStatus, setDbStatus] = useState(isSupabaseConfigured() ? 'checking' : 'error');
  const [prevView, setPrevView] = useState('recipient'); // track where to go back from leaderboard

  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const isLoadingProfileRef = useRef(false);

  // Keep refs in sync with state to avoid stale closure issues in auth listeners
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (configMissing) {
      setLoading(false);
      setDbStatus('error');
      return;
    }

    // Check active auth session with a timeout fallback
    const initSession = async () => {
      let slowTimer;
      try {
        setDbStatus('checking');
        const sessionPromise = supabase.auth.getSession();
        
        // After 5s, mark it as slow but keep waiting
        slowTimer = setTimeout(() => {
          setDbStatus('slow');
        }, 5000);

        // Timeout after 25 seconds to prevent infinite spinners
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timed out.')), 25000)
        );
        
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
        clearTimeout(slowTimer);
        setDbStatus('connected');
        
        if (session?.user) {
          userRef.current = session.user;
          setUser(session.user);
          await loadUserProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        clearTimeout(slowTimer);
        console.error('Session init error (DB might be hung):', err);
        setDbStatus('timeout');
        setLoading(false);
        userRef.current = null;
        profileRef.current = null;
        setUser(null);
        setProfile(null);
        setView('login');
      }
    };

    initSession();

    // Listen for Auth status changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth status change event:', event, 'session user:', session?.user?.id);
      
      if (event === 'SIGNED_OUT') {
        userRef.current = null;
        profileRef.current = null;
        setUser(null);
        setProfile(null);
        setView('login');
        setLoading(false);
        isLoadingProfileRef.current = false;
        return;
      }

      if (session?.user) {
        const userId = session.user.id;
        
        // Sync user ref and state
        if (userId !== userRef.current?.id) {
          userRef.current = session.user;
          setUser(session.user);
        }

        // Check if we need to load profile
        if (userId !== profileRef.current?.id) {
          if (!isLoadingProfileRef.current) {
            await loadUserProfile(userId);
          }
        } else {
          // Profile is already correct and matches user, ensure we are not stuck in loading
          setLoading(false);
        }
      } else {
        // No session
        userRef.current = null;
        profileRef.current = null;
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
    if (isLoadingProfileRef.current) return;
    isLoadingProfileRef.current = true;
    
    // Only show full-screen spinner if profile is not already loaded
    if (!profileRef.current) {
      setLoading(true);
    }
    
    setDbStatus('checking');
    let slowTimer;
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
        
      slowTimer = setTimeout(() => {
        setDbStatus('slow');
      }, 5000);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timed out.')), 25000)
      );

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);
      clearTimeout(slowTimer);

      if (error) {
        setDbStatus('connected');
        setView('register');
      } else {
        setDbStatus('connected');
        profileRef.current = data;
        setProfile(data);
        routeUser(data);
      }
    } catch (err) {
      clearTimeout(slowTimer);
      console.error('Error loading profile (DB might be hung):', err);
      setDbStatus('timeout');
      setView('login');
    } finally {
      isLoadingProfileRef.current = false;
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
    userRef.current = u;
    profileRef.current = p;
    setUser(u);
    setProfile(p);
    routeUser(p);
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      userRef.current = null;
      profileRef.current = null;
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
    profileRef.current = updatedProfile;
    setProfile(updatedProfile);
    routeUser(updatedProfile);
  };

  const handleShowLeaderboard = () => {
    setPrevView(view);
    setView('leaderboard');
  };

  const handleLeaderboardBack = () => {
    setView(prevView);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-between antialiased selection:bg-emerald-500 selection:text-white">
      
      {/* Background visual gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/20 via-slate-900 to-slate-950 pointer-events-none z-0"></div>

      {/* Connection Indicator Bar */}
      {(dbStatus !== 'connected' || profile) && (
        <div className="relative z-10 bg-slate-950/85 backdrop-blur-md border-b border-slate-800 text-[10px] text-slate-400 py-2 px-4 flex justify-between items-center transition-all duration-300">
          <div className="flex items-center space-x-2">
            {dbStatus === 'checking' && (
              <>
                <Loader className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                <span>Connecting to database...</span>
              </>
            )}
            {dbStatus === 'slow' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="text-amber-400">Database is waking up (Supabase cold-start)...</span>
              </>
            )}
            {dbStatus === 'timeout' && (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-500 animate-bounce" />
                <span className="text-red-400 font-semibold">Connection Timed Out</span>
              </>
            )}
            {dbStatus === 'error' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-amber-400">Backend Offline</span>
              </>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {profile && (
              <span className="flex items-center text-emerald-500 font-bold">
                <ShieldCheck className="w-3 h-3 mr-0.5" />
                Verified Profile: {profile.org_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Connection Warning Banner */}
      {dbStatus === 'timeout' && (
        <div className="relative z-10 bg-red-950/80 border-b border-red-800/50 text-xs text-red-200 py-3 px-4 flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0 backdrop-blur-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>
              The connection to <strong>{localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || 'Supabase'}</strong> timed out. 
              If the database was asleep, it may still be waking up.
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                window.location.reload();
              }}
              className="bg-red-900/60 hover:bg-red-800 text-white font-bold px-3 py-1 rounded-lg text-[10px] transition-all border border-red-700"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Screen Loader / Main View Wrapper */}
      <div className="flex-1 flex items-center justify-center p-4 z-10 relative">
        {configMissing ? (
          <div className="bg-white rounded-3xl p-8 max-w-md shadow-xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <Database className="w-6 h-6 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">Configuration Missing</h2>
            <p className="text-sm text-slate-500">
              Supabase environment variables are not configured. Please add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to your <strong>.env.local</strong> file.
            </p>
          </div>
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
              <RecipientDashboard
                profile={profile}
                onSignOut={handleSignOut}
                onShowLeaderboard={handleShowLeaderboard}
              />
            )}
            {view === 'leaderboard' && profile?.user_type === 'Social Worker' && (
              <LeaderboardView
                profile={profile}
                onBack={handleLeaderboardBack}
              />
            )}
          </>
        )}
      </div>

      {/* Footer bar */}
      <footer className="relative z-10 bg-slate-950/60 border-t border-slate-800/40 text-[9px] text-slate-600 text-center py-2.5">
        <p>KindlyFed © 2026. Made with OpenStreetMap & Supabase.</p>
      </footer>
    </div>
  );
}
