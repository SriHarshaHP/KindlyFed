import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Trophy, Medal, RefreshCw, ArrowLeft, Star, TrendingUp, Award } from 'lucide-react';

// Cache duration: 60 seconds
const CACHE_DURATION_MS = 60 * 1000;
let leaderboardCache = null;
let cacheTimestamp = null;

const RANK_CONFIG = [
  { bg: 'from-yellow-400 to-amber-500',  border: 'border-yellow-400',  text: 'text-yellow-600',  badge: '🥇', label: 'Gold'   },
  { bg: 'from-slate-400 to-slate-500',   border: 'border-slate-400',   text: 'text-slate-500',   badge: '🥈', label: 'Silver' },
  { bg: 'from-amber-600 to-orange-600',  border: 'border-amber-600',   text: 'text-amber-700',   badge: '🥉', label: 'Bronze' },
];

export default function LeaderboardView({ profile, onBack }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchLeaderboard = useCallback(async (force = false) => {
    // Return from cache if still valid and not forced
    if (!force && leaderboardCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
      setWorkers(leaderboardCache);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, org_name, donation_count, location_coords, created_at')
        .eq('user_type', 'Social Worker')
        .eq('is_approved', true)
        .order('donation_count', { ascending: false })
        .limit(50);

      if (error) throw error;

      leaderboardCache = data || [];
      cacheTimestamp = Date.now();
      setWorkers(leaderboardCache);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();

    // Auto-refresh leaderboard every 60 seconds
    const interval = setInterval(() => fetchLeaderboard(true), CACHE_DURATION_MS);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const myRank = workers.findIndex(w => w.id === profile?.id) + 1;
  const myEntry = workers.find(w => w.id === profile?.id);

  return (
    <div className="w-full max-w-6xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[85vh] border border-slate-100">
      
      {/* Header bar */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 relative overflow-hidden">
        {/* Background shimmer */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(8)].map((_, i) => (
            <div key={i}
              className="absolute rounded-full bg-white"
              style={{
                width: `${20 + i * 10}px`, height: `${20 + i * 10}px`,
                top: `${10 + i * 8}%`, left: `${i * 12}%`, opacity: 0.3 - i * 0.02
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex justify-between items-start">
          <div>
            <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-400/20">
              Social Worker Gamification
            </span>
            <div className="flex items-center space-x-2 mt-1">
              <Trophy className="w-5 h-5 text-yellow-300" />
              <h1 className="text-xl font-extrabold tracking-tight">Social Worker Leaderboard</h1>
            </div>
            <p className="text-emerald-100 text-[11px] mt-0.5">Ranked by verified donation deliveries</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onBack}
              className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>

        {/* My rank badge */}
        {myEntry && (
          <div className="relative z-10 mt-4 bg-white/15 rounded-2xl p-3.5 border border-white/20 flex items-center justify-between max-w-md backdrop-blur-sm">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 bg-emerald-500/30 rounded-xl flex items-center justify-center">
                <Star className="w-4 h-4 text-yellow-300" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-100 font-semibold uppercase">Your Position</p>
                <p className="text-sm font-extrabold">{myEntry.org_name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-yellow-300">#{myRank}</p>
              <p className="text-[10px] text-emerald-100">{myEntry.donation_count || 0} deliveries</p>
            </div>
          </div>
        )}
      </header>

      {/* Controls bar */}
      <div className="bg-slate-50 px-6 py-3 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 font-semibold">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          <span>
            {lastUpdated
              ? `Updated ${Math.round((Date.now() - lastUpdated) / 1000)}s ago`
              : 'Loading...'}
          </span>
        </div>
        <button
          onClick={() => fetchLeaderboard(true)}
          disabled={loading}
          className="flex items-center space-x-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Rankings</span>
        </button>
      </div>

      {/* Leaderboard list container */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-3">
        {loading && workers.length === 0 ? (
          <div className="flex flex-col items-center py-20 space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
            <p className="text-sm text-slate-500 font-medium">Loading rankings...</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="flex flex-col items-center py-20 space-y-3 text-center">
            <Award className="w-12 h-12 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">No deliveries recorded yet!</p>
            <p className="text-xs text-slate-400 max-w-xs">Be the first to deliver a claimed donation and claim the #1 spot.</p>
          </div>
        ) : (
          workers.map((worker, index) => {
            const rank = index + 1;
            const isMe = worker.id === profile?.id;
            const rankCfg = RANK_CONFIG[index] || null;

            return (
              <div
                key={worker.id}
                className={`relative rounded-2xl p-4 flex items-center space-x-4 border transition-all ${
                  isMe
                    ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-300/25 shadow-sm'
                    : 'bg-white border-slate-100 shadow-sm hover:shadow-md'
                }`}
              >
                {/* Rank number / medal */}
                <div className={`w-10 h-10 flex-shrink-0 rounded-xl flex flex-col items-center justify-center text-center font-black ${
                  rankCfg
                    ? `bg-gradient-to-br ${rankCfg.bg} text-white shadow-md`
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  {rankCfg ? (
                    <span className="text-lg leading-none">{rankCfg.badge}</span>
                  ) : (
                    <span className="text-sm">{rank}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <p className={`text-sm font-extrabold truncate ${isMe ? 'text-emerald-950' : 'text-slate-800'}`}>
                      {worker.org_name}
                    </p>
                    {isMe && (
                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        YOU
                      </span>
                    )}
                  </div>
                  {rankCfg && (
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{rankCfg.label} Rank</p>
                  )}
                </div>

                {/* Donation count */}
                <div className="text-right flex-shrink-0">
                  <p className={`text-xl font-black ${isMe ? 'text-emerald-600' : rank <= 3 ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {worker.donation_count || 0}
                  </p>
                  <p className="text-[9px] text-slate-400 font-bold">deliveries</p>
                </div>

                {/* Progress bar relative to #1 */}
                {workers[0]?.donation_count > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-b-2xl transition-all duration-700 ${isMe ? 'bg-emerald-500' : 'bg-emerald-500/25'}`}
                      style={{ width: `${((worker.donation_count || 0) / workers[0].donation_count) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer note */}
      <div className="bg-white border-t border-slate-100 p-4 text-center">
        <p className="text-[10px] text-slate-400 font-medium">
          Rankings refresh automatically every 60 seconds. Complete more deliveries to climb the board!
        </p>
      </div>
    </div>
  );
}
