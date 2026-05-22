import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, UserCheck, UserX, Image, Phone, MapPin, ExternalLink, Mail, Loader } from 'lucide-react';

export default function AdminDashboard({ onSignOut }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (err) {
      console.error('Error fetching pending users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    setActioningId(id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: true })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state
      setPendingUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert('Error approving user: ' + err.message);
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id) => {
    if (!confirm('Are you sure you want to reject and delete this registration?')) return;
    setActioningId(id);
    try {
      // In a robust schema, we delete the profile row (which cascades or simply rejects)
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Note: In Supabase, deleting from the profiles table does not delete the auth user unless
      // you have a trigger, but they won't be able to log in without a profile anyway.
      setPendingUsers(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert('Error rejecting user: ' + err.message);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl bg-slate-50 min-h-[85vh] rounded-3xl overflow-hidden flex flex-col border border-slate-100 shadow-xl">
      {/* Header bar */}
      <header className="bg-slate-900 text-white p-6 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Admin Approval Portal</h1>
            <p className="text-slate-400 text-xs font-semibold">Moderation and Identity Verification</p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-4 py-2 rounded-xl text-xs transition-all"
        >
          Sign Out
        </button>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 p-6 overflow-y-auto max-h-[75vh]">
        {loading ? (
          <div className="flex flex-col justify-center items-center h-64 space-y-3">
            <Loader className="w-8 h-8 text-emerald-600 animate-spin" />
            <span className="text-xs text-slate-500 font-medium">Retrieving pending registrations...</span>
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto my-12">
            <UserCheck className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-700">All Caught Up!</h3>
            <p className="text-xs text-slate-500 mt-1">There are no pending registrations requiring review at this time.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between">
                
                {/* Org Identity details */}
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full mb-1">
                        {user.user_type}
                      </span>
                      <h3 className="text-sm font-extrabold text-slate-800">{user.org_name}</h3>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center space-x-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{user.email}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{user.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-700">
                        Lat: {user.location_coords?.lat?.toFixed(4)}, Lng: {user.location_coords?.lng?.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {/* Aadhaar image preview */}
                  <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 group">
                    {user.aadhaar_url ? (
                      <>
                        <img 
                          src={user.aadhaar_url} 
                          alt="Aadhaar doc" 
                          className="w-full h-32 object-cover transition-all group-hover:scale-105"
                        />
                        <button
                          onClick={() => setSelectedDoc(user.aadhaar_url)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-all"
                        >
                          <Image className="w-4 h-4 mr-1" /> Inspect Aadhaar
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-32 flex items-center justify-center text-slate-400 text-xs">
                        No Document Uploaded
                      </div>
                    )}
                  </div>
                </div>

                {/* Approve/Reject footer buttons */}
                <div className="border-t border-slate-100 bg-slate-50 p-4 flex gap-3">
                  <button
                    onClick={() => handleApprove(user.id)}
                    disabled={actioningId !== null}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-1 shadow-sm disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Approve User</span>
                  </button>
                  <button
                    onClick={() => handleReject(user.id)}
                    disabled={actioningId !== null}
                    className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center shadow-sm disabled:opacity-50"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </main>

      {/* Large Image inspection modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 p-2 shadow-2xl">
            <img src={selectedDoc} alt="Aadhaar Zoom" className="w-full h-auto max-h-[80vh] object-contain rounded-2xl mx-auto" />
            <div className="absolute top-4 right-4 flex space-x-2">
              <a 
                href={selectedDoc} 
                target="_blank" 
                rel="noreferrer"
                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-all"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => setSelectedDoc(null)}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-full text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
