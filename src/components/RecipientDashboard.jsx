import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Phone, MapPin, Compass, Package, CheckSquare, RefreshCw, Navigation, Navigation2, LogOut, Camera, Loader2, Trophy, CheckCircle2, Upload } from 'lucide-react';
import canvasConfetti from 'canvas-confetti';
import L from 'leaflet';

// Leaflet Icon Setup
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function ChangeMapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 14);
  }, [center, map]);
  return null;
}

// ─── Camera / GPS helpers (Capacitor-aware with browser fallback) ────────────

async function capturePhoto() {
  // Try Capacitor Camera plugin (on native device/emulator)
  try {
    const { Camera: CapCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await CapCamera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });
    return photo.dataUrl; // base64 data URL
  } catch {
    // Fallback: file input for browser dev environment
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file selected'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
}

async function getCurrentLocation() {
  // Try Capacitor Geolocation plugin first
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    // Fallback: browser geolocation
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }
}

async function dataUrlToFile(dataUrl, filename) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

// Distance calculation helper (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return '0.0';
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
};

// ─────────────────────────────────────────────────────────────────────────────

export default function RecipientDashboard({ profile, onSignOut, onShowLeaderboard }) {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' | 'my-claims'
  const [allDonations, setAllDonations] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  // Current Location tracking state (Social Workers filter by 5km)
  const [currentCoords, setCurrentCoords] = useState(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [locationError, setLocationError] = useState('');

  // Delivery modal state
  const [deliveryModal, setDeliveryModal] = useState(null); // donation object or null
  const [deliveryStep, setDeliveryStep] = useState('idle'); // 'idle' | 'capturing' | 'locating' | 'uploading' | 'done'
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedLocation, setCapturedLocation] = useState(null);
  const [deliveryError, setDeliveryError] = useState('');

  const recipientCoords = profile.location_coords || { lat: 12.9716, lng: 77.5946 };
  const isSocialWorker = profile.user_type === 'Social Worker';
  const activeCoords = (isSocialWorker && currentCoords) ? currentCoords : recipientCoords;

  const detectCurrentLocation = async () => {
    setLocatingUser(true);
    setLocationError('');
    try {
      const coords = await getCurrentLocation();
      setCurrentCoords(coords);
    } catch (err) {
      console.error('Error detecting current location:', err);
      setLocationError(err.message || 'GPS location access denied or timed out.');
    } finally {
      setLocatingUser(false);
    }
  };

  useEffect(() => {
    fetchDonations();
    fetchMyClaims();
    if (isSocialWorker) {
      detectCurrentLocation();
    }

    const channel = supabase
      .channel('realtime-donations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, () => {
        fetchDonations();
        fetchMyClaims();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchDonations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`*, donor:donor_id (id, org_name, phone, email, user_type, location_coords)`)
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllDonations(data || []);
    } catch (err) {
      console.error('Error fetching donations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter donations reactively based on role and 5km radius (for Social Worker)
  const donations = React.useMemo(() => {
    return allDonations.filter(item => {
      if (!item.donor) return false;
      if (profile.user_type === 'Social Worker') {
        if (item.donor.user_type !== 'Restaurant') return false;
        if (!item.donor.location_coords?.lat || !item.donor.location_coords?.lng) return false;
        if (!activeCoords?.lat || !activeCoords?.lng) return false;
        // Filter by 5km radius of active coords
        const dist = parseFloat(calculateDistance(
          activeCoords.lat,
          activeCoords.lng,
          item.donor.location_coords.lat,
          item.donor.location_coords.lng
        ));
        return dist <= 5.0;
      }
      if (profile.user_type === 'Orphanage') {
        return item.donor.user_type === 'Grocery Shop';
      }
      return false;
    });
  }, [allDonations, currentCoords, recipientCoords, isSocialWorker]);

  const hasExternalDonations = React.useMemo(() => {
    if (!isSocialWorker) return false;
    // Check if there are any restaurant donations in the system at all
    return allDonations.some(item => item.donor?.user_type === 'Restaurant');
  }, [allDonations, isSocialWorker]);

  const fetchMyClaims = async () => {
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`*, donor:donor_id (org_name, phone, email, location_coords)`)
        .eq('recipient_id', profile.id)
        .in('status', ['claimed', 'delivered'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyClaims(data || []);
    } catch (err) {
      console.error('Error fetching claims:', err);
    }
  };

  const handleClaim = async (donation) => {
    setClaimingId(donation.id);
    try {
      const { error } = await supabase
        .from('donations')
        .update({ status: 'claimed', recipient_id: profile.id })
        .eq('id', donation.id);

      if (error) throw error;

      canvasConfetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setSelectedDonation({ ...donation, status: 'claimed', recipient_id: profile.id });
      fetchDonations();
      fetchMyClaims();
    } catch (err) {
      alert('Failed to claim resource: ' + err.message);
    } finally {
      setClaimingId(null);
    }
  };

  // ── Delivery flow ──────────────────────────────────────────────────────────

  const openDeliveryModal = (donation) => {
    setDeliveryModal(donation);
    setDeliveryStep('idle');
    setCapturedPhoto(null);
    setCapturedLocation(null);
    setDeliveryError('');
  };

  const handleCapturePhoto = async () => {
    setDeliveryStep('capturing');
    setDeliveryError('');
    try {
      const dataUrl = await capturePhoto();
      setCapturedPhoto(dataUrl);
      setDeliveryStep('idle');
    } catch (err) {
      setDeliveryError('Could not capture photo: ' + err.message);
      setDeliveryStep('idle');
    }
  };

  const handleCaptureLocation = async () => {
    setDeliveryStep('locating');
    setDeliveryError('');
    try {
      const coords = await getCurrentLocation();
      setCapturedLocation(coords);
      setDeliveryStep('idle');
    } catch (err) {
      setDeliveryError('Could not get location: ' + err.message);
      setDeliveryStep('idle');
    }
  };

  const handleSubmitDelivery = async () => {
    if (!capturedPhoto) { setDeliveryError('Please capture a delivery photo first.'); return; }
    if (!capturedLocation) { setDeliveryError('Please capture your current GPS location first.'); return; }

    setDeliveryStep('uploading');
    setDeliveryError('');
    try {
      // 1. Upload photo to Supabase Storage
      const file = await dataUrlToFile(capturedPhoto, `delivery_${deliveryModal.id}_${Date.now()}.jpg`);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('delivery-proofs')
        .upload(`${profile.id}/${file.name}`, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('delivery-proofs').getPublicUrl(uploadData.path);
      const photoUrl = urlData.publicUrl;

      // 2. Update donation record atomically
      const { error: updateError } = await supabase
        .from('donations')
        .update({
          status: 'delivered',
          delivery_photo_url: photoUrl,
          delivery_coords: capturedLocation,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', deliveryModal.id)
        .eq('recipient_id', profile.id);

      if (updateError) throw updateError;

      // 3. Celebrate!
      canvasConfetti({ particleCount: 200, spread: 100, origin: { y: 0.5 }, colors: ['#10b981', '#8b5cf6', '#f59e0b'] });
      setDeliveryStep('done');
      fetchMyClaims();
    } catch (err) {
      setDeliveryError('Delivery submission failed: ' + err.message);
      setDeliveryStep('idle');
    }
  };

  // ──────────────────────────────────────────────────────────────────────────

  const targetDonorType = profile.user_type === 'Social Worker' ? 'Restaurants' : 'Grocery Shops';

  return (
    <div className="w-full max-w-4xl bg-slate-50 min-h-[85vh] rounded-3xl overflow-hidden flex flex-col border border-slate-100 shadow-xl">

      {/* Delivery Verification Modal */}
      {deliveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
              <h3 className="font-extrabold text-base">Verify Delivery</h3>
              <p className="text-emerald-100 text-[11px] mt-0.5 truncate">Order: {deliveryModal.items}</p>
            </div>

            <div className="p-5 space-y-4">
              {deliveryStep === 'done' ? (
                <div className="flex flex-col items-center py-6 space-y-3 text-center">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                  <p className="font-extrabold text-emerald-800 text-lg">Delivery Verified!</p>
                  <p className="text-xs text-slate-500">Your delivery count has been updated. Keep up the great work!</p>
                  <button
                    onClick={() => { setDeliveryModal(null); setDeliveryStep('idle'); }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
                  >Close</button>
                </div>
              ) : (
                <>
                  {/* Step 1: Photo */}
                  <div className={`rounded-2xl border-2 p-4 transition-all ${capturedPhoto ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-300 bg-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-700">Step 1: Capture Photo</p>
                        <p className="text-[10px] text-slate-500">Photo proof of delivery</p>
                      </div>
                      {capturedPhoto
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <Camera className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      }
                    </div>
                    {capturedPhoto && (
                      <img src={capturedPhoto} alt="Delivery proof" className="mt-3 w-full h-28 object-cover rounded-xl border border-emerald-200" />
                    )}
                    <button
                      onClick={handleCapturePhoto}
                      disabled={deliveryStep !== 'idle'}
                      className="mt-3 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
                    >
                      {deliveryStep === 'capturing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                      <span>{capturedPhoto ? 'Retake Photo' : 'Open Camera'}</span>
                    </button>
                  </div>

                  {/* Step 2: Location */}
                  <div className={`rounded-2xl border-2 p-4 transition-all ${capturedLocation ? 'border-emerald-400 bg-emerald-50' : 'border-dashed border-slate-300 bg-slate-50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-700">Step 2: Capture GPS Location</p>
                        <p className="text-[10px] text-slate-500">Geotag proof of delivery site</p>
                      </div>
                      {capturedLocation
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      }
                    </div>
                    {capturedLocation && (
                      <p className="text-[10px] font-mono text-emerald-700 mt-2 bg-emerald-100 p-1.5 rounded-lg">
                        {capturedLocation.lat.toFixed(5)}, {capturedLocation.lng.toFixed(5)}
                      </p>
                    )}
                    <button
                      onClick={handleCaptureLocation}
                      disabled={deliveryStep !== 'idle'}
                      className="mt-3 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
                    >
                      {deliveryStep === 'locating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                      <span>{capturedLocation ? 'Re-capture GPS' : 'Get GPS Location'}</span>
                    </button>
                  </div>

                  {deliveryError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-600 text-[10px] font-semibold">
                      {deliveryError}
                    </div>
                  )}

                  {/* Submit */}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSubmitDelivery}
                      disabled={deliveryStep === 'uploading' || !capturedPhoto || !capturedLocation}
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md"
                    >
                      {deliveryStep === 'uploading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      <span>{deliveryStep === 'uploading' ? 'Submitting...' : 'Submit Delivery Proof'}</span>
                    </button>
                    <button
                      onClick={() => setDeliveryModal(null)}
                      disabled={deliveryStep === 'uploading'}
                      className="border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold px-4 py-2 rounded-xl text-xs transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-400/20">
              {profile.user_type} (Recipient)
            </span>
            <h1 className="text-xl font-extrabold tracking-tight mt-1">{profile.org_name}</h1>
            <p className="text-emerald-100 text-[11px] mt-0.5">Matched Donors: <span className="font-bold underline">{targetDonorType}</span></p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Leaderboard button (Social Workers only) */}
            {isSocialWorker && (
              <button
                onClick={onShowLeaderboard}
                className="bg-violet-500/80 hover:bg-violet-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center space-x-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Leaderboard</span>
              </button>
            )}
            <button
              onClick={onSignOut}
              className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center"
            >
              <LogOut className="w-3.5 h-3.5 mr-1" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex bg-emerald-950/20 rounded-xl p-1 mt-6 border border-white/10 max-w-md">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'feed' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Active Feed ({donations.length})</span>
          </button>
          <button
            onClick={() => { setActiveTab('claims'); fetchMyClaims(); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'claims' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>My Claims ({myClaims.length})</span>
          </button>
        </div>
      </header>

      {/* Main split dashboard */}
      <div className="flex-1 md:flex overflow-hidden max-h-[65vh]">

        {/* Left: Lists */}
        <div className="md:w-5/12 p-4 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {activeTab === 'feed' ? 'Available Resources' : 'Your History'}
            </h3>
            <button onClick={() => { fetchDonations(); fetchMyClaims(); if (isSocialWorker) detectCurrentLocation(); }} className="text-[10px] text-slate-500 hover:text-emerald-600 flex items-center space-x-0.5">
              <RefreshCw className="w-3 h-3" /><span>Refresh</span>
            </button>
          </div>

          {activeTab === 'feed' ? (
            <div className="space-y-3">
              {isSocialWorker && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3 text-xs space-y-2 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-emerald-800 flex items-center">
                      <Compass className={`w-3.5 h-3.5 mr-1 ${locatingUser ? 'animate-spin text-emerald-600' : 'text-emerald-500'}`} />
                      {locatingUser ? 'Detecting location...' : 'Current Location Active'}
                    </span>
                    <button
                      type="button"
                      onClick={detectCurrentLocation}
                      disabled={locatingUser}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] transition-all flex items-center space-x-1"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Update GPS</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Only displaying restaurants within a <strong>5km radius</strong>.
                  </p>
                  {locationError && (
                    <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-1.5 font-semibold">
                      ⚠️ {locationError}
                    </div>
                  )}
                  {currentCoords ? (
                    <div className="text-[9px] font-mono text-emerald-700 bg-white border border-emerald-100 rounded-lg p-1.5 flex justify-between items-center">
                      <span>GPS: {currentCoords.lat.toFixed(5)}, {currentCoords.lng.toFixed(5)}</span>
                      <span className="bg-emerald-100 text-emerald-800 px-1 rounded font-bold uppercase">5km Lock</span>
                    </div>
                  ) : (
                    <div className="text-[9px] font-mono text-slate-500 bg-white border border-slate-200 rounded-lg p-1.5">
                      GPS: Using registered profile location (fallback)
                    </div>
                  )}
                </div>
              )}

              {loading && donations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Loading feed...</div>
              ) : donations.length === 0 ? (
                hasExternalDonations ? (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-4">
                    <Compass className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-pulse" />
                    <p className="text-xs font-bold text-slate-700">No restaurants within 5km</p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      We found active food donations in the system, but they are further than 5km from your current coordinates.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Package className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    <p className="text-[11px] text-slate-500 font-medium">No donations available right now.</p>
                  </div>
                )
              ) : (
                donations.map((item) => {
                  const dist = calculateDistance(activeCoords.lat, activeCoords.lng, item.donor?.location_coords?.lat, item.donor?.location_coords?.lng);
                  return (
                    <button key={item.id} onClick={() => setSelectedDonation(item)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all flex space-x-3 ${
                        selectedDonation?.id === item.id ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="w-12 h-12 bg-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                        {item.photo_url ? <img src={item.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-bold">FOOD</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{item.items}</h4>
                        <p className="text-[10px] text-slate-500 truncate">{item.donor?.org_name}</p>
                        <div className="flex justify-between items-center mt-1 text-[9px] font-bold">
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Qty: {item.quantity}</span>
                          <span className="text-slate-500 flex items-center"><Navigation2 className="w-2.5 h-2.5 mr-0.5" /> {dist} km</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {myClaims.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CheckSquare className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-[11px] text-slate-500 font-medium">You haven't claimed any items yet.</p>
                </div>
              ) : (
                myClaims.map((item) => (
                  <button key={item.id} onClick={() => setSelectedDonation(item)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all flex space-x-3 ${
                      selectedDonation?.id === item.id ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-12 h-12 bg-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                      {item.delivery_photo_url ? <img src={item.delivery_photo_url} alt="" className="w-full h-full object-cover" />
                        : item.photo_url ? <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-bold">CLAIM</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{item.items}</h4>
                      <p className="text-[10px] text-slate-500 truncate">{item.donor?.org_name}</p>
                      {item.status === 'delivered' ? (
                        <p className="text-[9px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded w-max mt-1">✓ Delivered</p>
                      ) : (
                        <p className="text-[9px] text-amber-700 font-bold bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded w-max mt-1">Claimed – Pending Delivery</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: Map & Detail */}
        <div className="md:w-7/12 flex flex-col h-full bg-slate-100 relative">
          <div className="flex-1 min-h-[220px]">
            <MapContainer center={[activeCoords.lat, activeCoords.lng]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[activeCoords.lat, activeCoords.lng]}>
                <Popup><div className="text-xs font-bold">Your Location ({profile.org_name})</div></Popup>
              </Marker>
              {donations.map((item) => {
                const lat = item.donor?.location_coords?.lat;
                const lng = item.donor?.location_coords?.lng;
                if (!lat || !lng) return null;
                return (
                  <Marker key={item.id} position={[lat, lng]} eventHandlers={{ click: () => setSelectedDonation(item) }}>
                    <Popup>
                      <div className="text-xs p-1">
                        <p className="font-bold text-slate-800">{item.items}</p>
                        <p className="text-[10px] text-slate-500">{item.donor?.org_name}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
              {selectedDonation?.donor?.location_coords ? (
                <>
                  <Polyline
                    positions={[
                      [activeCoords.lat, activeCoords.lng],
                      [selectedDonation.donor.location_coords.lat, selectedDonation.donor.location_coords.lng]
                    ]}
                    color="rgb(16, 185, 129)" dashArray="5, 10" weight={3}
                  />
                  <ChangeMapCenter center={[
                    (activeCoords.lat + selectedDonation.donor.location_coords.lat) / 2,
                    (activeCoords.lng + selectedDonation.donor.location_coords.lng) / 2
                  ]} />
                </>
              ) : (
                <ChangeMapCenter center={[activeCoords.lat, activeCoords.lng]} />
              )}
            </MapContainer>
          </div>

          {/* Selected donation detail */}
          {selectedDonation ? (
            <div className="bg-white border-t border-slate-200 p-4 shadow-lg space-y-3 z-10">
              <div className="flex gap-3">
                <div className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                  {selectedDonation.delivery_photo_url ? (
                    <img src={selectedDonation.delivery_photo_url} alt="" className="w-full h-full object-cover" />
                  ) : selectedDonation.photo_url ? (
                    <img src={selectedDonation.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">PIC</div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">{selectedDonation.items}</h4>
                      <p className="text-[10px] text-slate-500 font-medium">Donor: {selectedDonation.donor?.org_name}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">Qty: {selectedDonation.quantity}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 line-clamp-2 mt-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    {selectedDonation.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {selectedDonation.status === 'delivered' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-[10px] space-y-1">
                  <p className="font-extrabold text-xs flex items-center space-x-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /><span>Delivery Verified & Logged!</span></p>
                  {selectedDonation.delivery_coords && (
                    <p className="text-[9px] font-mono text-slate-600">
                      GPS: {selectedDonation.delivery_coords.lat?.toFixed(5)}, {selectedDonation.delivery_coords.lng?.toFixed(5)}
                    </p>
                  )}
                </div>
              ) : selectedDonation.status === 'claimed' && selectedDonation.recipient_id === profile.id ? (
                <div className="space-y-2">
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-[10px] space-y-1">
                    <p className="font-extrabold text-xs">✓ Claimed! Contact donor to coordinate pickup:</p>
                    <div className="flex justify-between font-bold text-slate-800 mt-1">
                      <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1 text-emerald-600" /> {selectedDonation.donor?.phone}</span>
                      <span className="text-slate-500">Distance: {calculateDistance(activeCoords.lat, activeCoords.lng, selectedDonation.donor?.location_coords?.lat, selectedDonation.donor?.location_coords?.lng)} km</span>
                    </div>
                  </div>
                  {/* Mark as Delivered button (Social Workers only) */}
                  {isSocialWorker && (
                    <button
                      onClick={() => openDeliveryModal(selectedDonation)}
                      className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 shadow-sm"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Mark as Delivered (Camera + GPS)</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleClaim(selectedDonation)}
                    disabled={claimingId !== null}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-1 shadow-sm disabled:opacity-50"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{claimingId ? 'Claiming...' : 'Pick Up / Claim Resource'}</span>
                  </button>
                  <button onClick={() => setSelectedDonation(null)} className="border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold px-3 py-2 rounded-xl text-xs transition-all">Cancel</button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/95 border-t border-slate-200 p-4 text-center text-slate-400 text-[10px] font-medium py-6">
              Select an available donation pin on the map or from the feed list to view path routes and claim pick-ups.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
