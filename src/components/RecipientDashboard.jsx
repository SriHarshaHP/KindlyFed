import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Phone, MapPin, Compass, Package, CheckSquare, RefreshCw, Navigation, Navigation2, HelpCircle, LogOut } from 'lucide-react';
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

// Helper component to center map on selected donation
function ChangeMapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 14);
    }
  }, [center, map]);
  return null;
}

export default function RecipientDashboard({ profile, onSignOut }) {
  const [activeTab, setActiveTab] = useState('feed'); // 'feed' or 'my-claims'
  const [donations, setDonations] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  // Parse recipient coords
  const recipientCoords = profile.location_coords || { lat: 12.9716, lng: 77.5946 };

  useEffect(() => {
    fetchDonations();
    fetchMyClaims();

    // Enable Supabase Realtime Subscription for instantaneous UI sync
    const channel = supabase
      .channel('realtime-donations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'donations'
      }, (payload) => {
        console.log('Realtime change noticed:', payload);
        fetchDonations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDonations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          donor:donor_id (
            id,
            org_name,
            phone,
            email,
            user_type,
            location_coords
          )
        `)
        .eq('status', 'available')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter client-side based on donor/recipient pairing rules:
      // - Restaurant -> Social Worker
      // - Grocery Shop -> Orphanage
      const filtered = (data || []).filter(item => {
        if (!item.donor) return false;
        if (profile.user_type === 'Social Worker') {
          return item.donor.user_type === 'Restaurant';
        } else if (profile.user_type === 'Orphanage') {
          return item.donor.user_type === 'Grocery Shop';
        }
        return false;
      });

      setDonations(filtered);
    } catch (err) {
      console.error('Error fetching donations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyClaims = async () => {
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          donor:donor_id (
            org_name,
            phone,
            email,
            location_coords
          )
        `)
        .eq('recipient_id', profile.id)
        .eq('status', 'claimed')
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
        .update({
          status: 'claimed',
          recipient_id: profile.id
        })
        .eq('id', donation.id);

      if (error) throw error;

      // Celebrate!
      canvasConfetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Update local listing
      setSelectedDonation({
        ...donation,
        status: 'claimed',
        recipient_id: profile.id
      });

      fetchDonations();
      fetchMyClaims();
    } catch (err) {
      alert('Failed to claim resource: ' + err.message);
    } finally {
      setClaimingId(null);
    }
  };

  // Distance calculator helper
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return '0.0';
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
  };

  const targetDonorType = profile.user_type === 'Social Worker' ? 'Restaurants' : 'Grocery Shops';

  return (
    <div className="w-full max-w-4xl bg-slate-50 min-h-[85vh] rounded-3xl overflow-hidden flex flex-col border border-slate-100 shadow-xl">
      
      {/* Header bar */}
      <header className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6">
        <div className="flex justify-between items-start">
          <div>
            <span className="bg-emerald-500/30 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-emerald-400/20">
              {profile.user_type} (Recipient)
            </span>
            <h1 className="text-xl font-extrabold tracking-tight mt-1">{profile.org_name}</h1>
            <p className="text-emerald-100 text-[11px] mt-0.5">Matched Donors: Receiving only from <span className="font-bold underline">{targetDonorType}</span></p>
          </div>
          <button
            onClick={onSignOut}
            className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all flex items-center"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            <span>Sign Out</span>
          </button>
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
            <span>Active Food Feed ({donations.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('claims');
              fetchMyClaims();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 ${
              activeTab === 'claims' ? 'bg-white text-emerald-800 shadow' : 'text-emerald-100 hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>My Claimed Goods ({myClaims.length})</span>
          </button>
        </div>
      </header>

      {/* Main split dashboard content */}
      <div className="flex-1 md:flex overflow-hidden max-h-[65vh]">
        
        {/* Left Side: Lists */}
        <div className="md:w-5/12 p-4 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {activeTab === 'feed' ? 'Available Resources' : 'Your History'}
            </h3>
            <button
              onClick={() => { fetchDonations(); fetchMyClaims(); }}
              className="text-[10px] text-slate-500 hover:text-emerald-600 flex items-center space-x-0.5"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          {activeTab === 'feed' ? (
            /* Active feed listings */
            <div className="space-y-3">
              {loading && donations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Loading feed...</div>
              ) : donations.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Package className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-[11px] text-slate-500 font-medium">No donations available right now.</p>
                </div>
              ) : (
                donations.map((item) => {
                  const dist = calculateDistance(
                    recipientCoords.lat, recipientCoords.lng,
                    item.donor?.location_coords?.lat, item.donor?.location_coords?.lng
                  );
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedDonation(item)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all flex space-x-3 ${
                        selectedDonation?.id === item.id 
                          ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' 
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="w-12 h-12 bg-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                        {item.photo_url ? (
                          <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-bold">FOOD</div>
                        )}
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
            /* Claimed history list */
            <div className="space-y-3">
              {myClaims.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <CheckSquare className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="text-[11px] text-slate-500 font-medium">You haven't claimed any items yet.</p>
                </div>
              ) : (
                myClaims.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedDonation(item)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all flex space-x-3 ${
                      selectedDonation?.id === item.id 
                        ? 'border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500' 
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-12 h-12 bg-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                      {item.photo_url ? (
                        <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-bold">CLAIM</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-800 truncate">{item.items}</h4>
                      <p className="text-[10px] text-slate-500 truncate">{item.donor?.org_name}</p>
                      <p className="text-[9px] text-amber-700 font-bold bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded w-max mt-1">Claimed successfully</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Side: Map & Selection Detail */}
        <div className="md:w-7/12 flex flex-col h-full bg-slate-100 relative">
          
          {/* Map Viewer */}
          <div className="flex-1 min-h-[220px]">
            <MapContainer 
              center={[recipientCoords.lat, recipientCoords.lng]} 
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}/.png"
                // Standard fallback url for OpenStreetMap tiles
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              {/* Recipient's Own Home Pin */}
              <Marker position={[recipientCoords.lat, recipientCoords.lng]}>
                <Popup>
                  <div className="text-xs font-bold">Your Location ({profile.org_name})</div>
                </Popup>
              </Marker>

              {/* Active Match Pin markers */}
              {donations.map((item) => {
                const lat = item.donor?.location_coords?.lat;
                const lng = item.donor?.location_coords?.lng;
                if (!lat || !lng) return null;
                return (
                  <Marker 
                    key={item.id} 
                    position={[lat, lng]}
                    eventHandlers={{
                      click: () => setSelectedDonation(item)
                    }}
                  >
                    <Popup>
                      <div className="text-xs p-1">
                        <p className="font-bold text-slate-800">{item.items}</p>
                        <p className="text-[10px] text-slate-500">{item.donor?.org_name}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Show line route if donation is selected */}
              {selectedDonation && selectedDonation.donor?.location_coords && (
                <>
                  <Polyline 
                    positions={[
                      [recipientCoords.lat, recipientCoords.lng],
                      [selectedDonation.donor.location_coords.lat, selectedDonation.donor.location_coords.lng]
                    ]}
                    color="rgb(16, 185, 129)"
                    dashArray="5, 10"
                    weight={3}
                  />
                  <ChangeMapCenter 
                    center={[
                      (recipientCoords.lat + selectedDonation.donor.location_coords.lat) / 2,
                      (recipientCoords.lng + selectedDonation.donor.location_coords.lng) / 2
                    ]} 
                  />
                </>
              )}
            </MapContainer>
          </div>

          {/* Selected Donation overlay card details */}
          {selectedDonation ? (
            <div className="bg-white border-t border-slate-200 p-4 shadow-lg space-y-3 z-10">
              <div className="flex gap-3">
                <div className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                  {selectedDonation.photo_url ? (
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
                    <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded-full">
                      Qty: {selectedDonation.quantity}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 line-clamp-2 mt-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                    {selectedDonation.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Reveal Donor phone and details upon claims */}
              {selectedDonation.status === 'claimed' ? (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-[10px] space-y-1">
                  <p className="font-extrabold text-xs">✓ Resource Successfully Claimed!</p>
                  <p className="font-medium text-slate-700">Please contact the donor to coordinate pickup:</p>
                  <div className="flex justify-between font-bold text-slate-800 mt-1">
                    <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1 text-emerald-600" /> {selectedDonation.donor?.phone}</span>
                    <span className="text-slate-500">Distance: {calculateDistance(recipientCoords.lat, recipientCoords.lng, selectedDonation.donor?.location_coords?.lat, selectedDonation.donor?.location_coords?.lng)} km</span>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleClaim(selectedDonation)}
                    disabled={claimingId !== null}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center space-x-1 shadow-sm disabled:opacity-50"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{claimingId ? 'Claiming Goods...' : 'Pick Up / Claim Resource'}</span>
                  </button>
                  <button
                    onClick={() => setSelectedDonation(null)}
                    className="border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold px-3 py-2 rounded-xl text-xs transition-all"
                  >
                    Cancel
                  </button>
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
