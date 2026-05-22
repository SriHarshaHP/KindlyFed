import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { PlusCircle, ListOrdered, CheckCircle2, Circle, Upload, Package, Clipboard, HelpCircle, LogOut } from 'lucide-react';
import canvasConfetti from 'canvas-confetti';

export default function DonorDashboard({ profile, onSignOut }) {
  const [activeTab, setActiveTab] = useState('post'); // 'post' or 'list'
  
  // Post donation form states
  const [items, setItems] = useState('');
  const [quantity, setQuantity] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  
  // Dashboard listing states
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchMyDonations();
  }, []);

  const fetchMyDonations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          recipient:recipient_id (
            org_name,
            phone,
            email
          )
        `)
        .eq('donor_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDonations(data || []);
    } catch (err) {
      console.error('Error fetching donations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFilePreview(URL.createObjectURL(selectedFile));
    }
  };

  const handleFillDemoDonation = () => {
    const randomId = Math.floor(100 + Math.random() * 900);
    if (profile.user_type === 'Restaurant') {
      setItems(`Biryani & Curry Packs (${randomId})`);
      setQuantity('15 Packs');
      setDescription('Freshly packed chicken biryani and vegetable curry. Best consumed within 4 hours.');
    } else {
      setItems(`Fresh Tomatoes & Potatoes (${randomId})`);
      setQuantity('20 Kg');
      setDescription('Unsold surplus fresh organic vegetables from our grocery shelves.');
    }
  };

  const handlePostDonation = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let photoUrl = null;

      // 1. Upload photo if present
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${profile.id}_donation_${Date.now()}.${fileExt}`;
        const filePath = `public/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('donation-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('donation-photos')
          .getPublicUrl(filePath);

        photoUrl = publicUrl;
      }

      // 2. Insert donation into Supabase
      const { error: insertError } = await supabase
        .from('donations')
        .insert([
          {
            donor_id: profile.id,
            items,
            quantity,
            description,
            photo_url: photoUrl,
            status: 'available',
            recipient_id: null
          }
        ]);

      if (insertError) throw insertError;

      // Confetti effect on successful post
      canvasConfetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.8 }
      });

      setSuccessMsg('Donation posted successfully! It is now visible to matched recipients.');
      
      // Reset form
      setItems('');
      setQuantity('');
      setDescription('');
      setFile(null);
      setFilePreview(null);
      
      // Refresh list
      fetchMyDonations();
      
      // Switch tab after short delay
      setTimeout(() => {
        setActiveTab('list');
        setSuccessMsg('');
      }, 1500);

    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Error posting donation.');
    } finally {
      setFormLoading(false);
    }
  };

  const targetRecipient = profile.user_type === 'Restaurant' ? 'Social Workers' : 'Orphanages';

  return (
    <div className="w-full max-w-xl bg-white rounded-3xl overflow-hidden flex flex-col border border-slate-100 shadow-xl min-h-[85vh]">
      
      {/* Donor Header */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-400/20">
              {profile.user_type} (Donor)
            </span>
            <h1 className="text-xl font-extrabold tracking-tight mt-1">{profile.org_name}</h1>
            <p className="text-emerald-100 text-[11px] mt-0.5">Connected Bridge: Directing to <span className="font-bold underline">{targetRecipient}</span></p>
          </div>
          <button
            onClick={onSignOut}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Tabs switcher */}
        <div className="flex bg-emerald-950/20 rounded-xl p-1 mt-6 border border-white/10">
          <button
            onClick={() => setActiveTab('post')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'post' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            <span>Post Donation</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('list');
              fetchMyDonations();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'list' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>My Listings ({donations.length})</span>
          </button>
        </div>
      </header>

      {/* Main Tab content */}
      <main className="flex-1 p-6 overflow-y-auto max-h-[60vh]">
        {activeTab === 'post' ? (
          <form onSubmit={handlePostDonation} className="space-y-4">
            
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">Add Resource Details</h3>
              <button
                type="button"
                onClick={handleFillDemoDonation}
                className="text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-2 py-1 rounded-md font-bold transition-all"
              >
                Auto-Fill Demo Food
              </button>
            </div>

            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                {successMsg}
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] text-emerald-800 leading-normal flex items-start space-x-2">
              <Clipboard className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>
                Based on your role as a <strong>{profile.user_type}</strong>, this resource listing will be restricted and shown only to registered <strong>{targetRecipient}</strong>.
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Resource Name / Items</label>
                <div className="relative">
                  <Package className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                    placeholder="e.g. Vegetable Pulav or Unsold Apples"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Quantity</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 10 kg, 12 packets, feeds 15 people"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Description / Shelf Life / Notes</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Include any food safety details or ideal pick up timings..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Photo Upload (Optional)</label>
                <div className="flex items-center space-x-4">
                  <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 rounded-2xl p-4 cursor-pointer transition-all">
                    <Upload className="w-5 h-5 text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-500 font-medium text-center">
                      {file ? file.name : "Select resource photo"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {filePreview && (
                    <div className="w-16 h-16 border border-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                      <img src={filePreview} alt="Resource preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={formLoading}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-2xl transition-all shadow-md flex items-center justify-center text-xs mt-6"
            >
              <span>{formLoading ? 'Listing Resource...' : 'Post Donation'}</span>
            </button>

          </form>
        ) : (
          /* List of past donations */
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Loading listings...
              </div>
            ) : donations.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500 font-medium">You haven't listed any resources yet.</p>
              </div>
            ) : (
              donations.map((donation) => (
                <div key={donation.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between shadow-sm">
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 bg-slate-200 rounded-xl overflow-hidden flex-shrink-0 border border-slate-100">
                      {donation.photo_url ? (
                        <img src={donation.photo_url} alt="Donation" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[10px] font-bold uppercase">
                          No Pic
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{donation.items}</h4>
                        <span className={`inline-flex items-center text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          donation.status === 'claimed'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {donation.status === 'claimed' ? (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                              <span>Claimed</span>
                            </>
                          ) : (
                            <>
                              <Circle className="w-2.5 h-2.5 mr-0.5 fill-emerald-800" />
                              <span>Available</span>
                            </>
                          )}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Quantity: <span className="font-bold text-slate-700">{donation.quantity}</span></p>
                      <p className="text-[10px] text-slate-600 line-clamp-2 mt-1">{donation.description}</p>
                    </div>
                  </div>

                  {/* Recipient Details if Claimed */}
                  {donation.status === 'claimed' && donation.recipient && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 bg-amber-50/50 p-2 rounded-xl text-[10px] text-slate-700">
                      <p className="font-bold text-amber-900">Claimed By:</p>
                      <p className="font-semibold text-slate-800 mt-0.5">{donation.recipient.org_name}</p>
                      <p className="text-slate-500 mt-0.5">Phone: {donation.recipient.phone} | {donation.recipient.email}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
