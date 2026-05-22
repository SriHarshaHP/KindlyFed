import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { supabase } from '../supabaseClient';
import { User, Mail, Phone, Lock, FileText, MapPin, Upload, Compass, HelpCircle, Loader2 } from 'lucide-react';
import L from 'leaflet';

// Fix for default Leaflet icon paths in Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Map click event listener to update marker position
function MapClickHandler({ setPosition }) {
  const map = useMapEvents({
    click(e) {
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      map.flyTo(e.latlng, map.getZoom());
    },
  });
  return null;
}

// Map center flying update helper
function ChangeMapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, 14);
    }
  }, [center, map]);
  return null;
}

export default function Register({ onViewChange, onSetUser }) {
  // Form states
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState('Restaurant');
  
  // Location states (Default: Bangalore center)
  const [position, setPosition] = useState({ lat: 12.9716, lng: 77.5946 });
  
  // Aadhaar File Upload states
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  
  // UI UX States
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Handle file select
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setFilePreview(URL.createObjectURL(selectedFile));
    }
  };

  // Get current device location
  const handleGetLocation = async () => {
    setLocating(true);
    setErrorMsg('');
    try {
      let coords;
      // Try Capacitor Geolocation plugin first
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // Fallback: browser geolocation
        coords = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('Geolocation not supported by browser.'));
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => reject(new Error(err.message || 'GPS permission denied or timeout.')),
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }
      setPosition(coords);
    } catch (err) {
      setErrorMsg('Could not fetch location: ' + err.message);
    } finally {
      setLocating(false);
    }
  };

  // Auto fill demo data helper
  const handleFillDemo = () => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const demoNames = {
      'Restaurant': `Green Garden Bistro ${randomId}`,
      'Grocery Shop': `Spices & Grains Mart ${randomId}`,
      'Social Worker': `Grace Outreach Initiative ${randomId}`,
      'Orphanage': `Shining Hope Childrens Home ${randomId}`
    };
    
    setOrgName(demoNames[userType]);
    setEmail(`demo_${userType.toLowerCase().replace(' ', '_')}_${randomId}@example.com`);
    setPhone(`98765${randomId}21`);
    setPassword('demoPass123!');
    
    // Set a slightly offset coordinate from Bangalore center
    setPosition({
      lat: 12.9716 + (Math.random() - 0.5) * 0.05,
      lng: 77.5946 + (Math.random() - 0.5) * 0.05
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (!file) {
      setErrorMsg('Please upload your Aadhaar card photo for verification.');
      setLoading(false);
      return;
    }

    try {
      let user = null;
      let authData = null;

      // Check if we are already logged in with the same email
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (activeSession?.user && activeSession.user.email?.toLowerCase() === email.toLowerCase()) {
        user = activeSession.user;
        authData = { user, session: activeSession };
      } else {
        // If logged in with a different user, sign out first
        if (activeSession?.user) {
          await supabase.auth.signOut();
        }

        // 1. Sign up user via Supabase Auth
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          // If user already registered, check if they have a profile
          const isAlreadyReg = signUpError.message.toLowerCase().includes('already') || 
                               signUpError.message.toLowerCase().includes('exists');
          if (isAlreadyReg) {
            // Attempt to sign in to verify credentials and complete registration
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (!signInError && signInData.user) {
              // Check if profile exists
              const { data: existingProfile, error: profileErr } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', signInData.user.id)
                .maybeSingle();

              if (!existingProfile) {
                // Profile is missing, we can reuse this auth session to complete registration
                user = signInData.user;
                authData = signInData;
              } else {
                throw new Error('This email is already registered and has a profile. Please log in.');
              }
            } else {
              // Sign in failed (wrong password etc), throw original signup error
              throw signUpError;
            }
          } else {
            throw signUpError;
          }
        } else {
          user = signUpData.user;
          authData = signUpData;
        }
      }

      if (!user) throw new Error('Failed to obtain user session.');

      // 2. Upload Aadhaar photo to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_aadhaar_${Date.now()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('aadhaar-photos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL of Aadhaar photo
      const { data: { publicUrl } } = supabase.storage
        .from('aadhaar-photos')
        .getPublicUrl(filePath);

      // 3. Create entry in public.profiles table
      const { error: profileError } = await supabase.from('profiles').insert([
        {
          id: user.id,
          org_name: orgName,
          email: email,
          phone: phone,
          user_type: userType,
          aadhaar_url: publicUrl,
          location_coords: { lat: position.lat, lng: position.lng },
          is_approved: false
        }
      ]);

      if (profileError) throw profileError;

      setSuccessMsg('Registration successful! Please check your email for confirmation (if configured) and await Admin approval.');
      
      // Auto-login or redirect to pending verification screen
      // If we are signed in, set user and profile in App
      if (authData.session) {
        onSetUser(user, {
          id: user.id,
          org_name: orgName,
          email,
          phone,
          user_type: userType,
          aadhaar_url: publicUrl,
          location_coords: { lat: position.lat, lng: position.lng },
          is_approved: false
        });
      } else {
        // Wait 3 seconds and redirect to login
        setTimeout(() => {
          onViewChange('login');
        }, 3000);
      }
    } catch (err) {
      console.error(err);
      let errMsg = err.message || 'An error occurred during registration.';
      if (errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('email rate limit')) {
        errMsg = (
          <span>
            <strong>Email Rate Limit Exceeded:</strong> Supabase limits signups when email confirmation is enabled. 
            To disable this, go to your <strong>Supabase Dashboard ➔ Authentication ➔ Providers ➔ Email</strong>, and toggle <strong>OFF</strong> "Confirm email" (or "Double confirmation").
          </span>
        );
      }
      setErrorMsg(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden md:flex">
      
      {/* Informative Side Panel */}
      <div className="md:w-5/12 bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white flex flex-col justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight mb-2">Join the Bridge</h2>
          <p className="text-emerald-100 text-xs leading-relaxed">
            Register your organization to bridge the gap between surplus resource providers and verified recipients.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-start space-x-3 text-xs">
              <Compass className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Locational Precision</p>
                <p className="text-emerald-200">Pin your premises on the map so donors/recipients can navigate to you.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 text-xs">
              <FileText className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Secured Auditing</p>
                <p className="text-emerald-200">Aadhaar card upload is mandatory to maintain recipient authenticity.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 md:mt-0 pt-6 border-t border-emerald-500/30">
          <p className="text-xs text-emerald-200">Already registered?</p>
          <button
            onClick={() => onViewChange('login')}
            className="mt-2 text-sm font-bold underline hover:text-white"
          >
            Log In to your Account
          </button>
        </div>
      </div>

      {/* Main Registration Form */}
      <form onSubmit={handleRegister} className="md:w-7/12 p-8 space-y-5 overflow-y-auto max-h-[85svh]">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">Create Account</h3>
          <button
            type="button"
            onClick={handleFillDemo}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg border border-slate-200 transition-all flex items-center space-x-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Fill Demo Data</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-semibold">
            {successMsg}
          </div>
        )}

        <div className="space-y-3">
          {/* Org Name */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Organization Name</label>
            <div className="relative">
              <User className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Hope Feeding Center"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>
          </div>

          {/* Email & Phone grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-slate-400 w-3.5 h-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@org.org"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 text-slate-400 w-3.5 h-3.5" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit phone"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* User Type & Password grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Account Role</label>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 font-medium"
              >
                <option value="Restaurant">Donor: Restaurant</option>
                <option value="Grocery Shop">Donor: Grocery Shop</option>
                <option value="Social Worker">Recipient: Social Worker</option>
                <option value="Orphanage">Recipient: Orphanage</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Secure Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-slate-400 w-3.5 h-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* Aadhaar File Upload */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Aadhaar Card Copy (Upload Image)
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/10 rounded-2xl p-4 cursor-pointer transition-all">
                <Upload className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-[10px] text-slate-500 font-medium text-center">
                  {file ? file.name : "Select or drag Aadhaar photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {filePreview && (
                <div className="w-16 h-16 border border-slate-200 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
                  <img src={filePreview} alt="Aadhaar Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {/* Map Location Picker */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500">
                Premises Location (Map Pin)
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={locating}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-lg text-[9px] border border-emerald-200 transition-all flex items-center space-x-1 disabled:opacity-50"
                >
                  {locating ? (
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                  ) : (
                    <Compass className="w-3 h-3 text-emerald-600" />
                  )}
                  <span>Use Current Location</span>
                </button>
                <span className="text-[9px] text-emerald-600 font-bold flex items-center">
                  <MapPin className="w-3 h-3 mr-0.5" />
                  {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
                </span>
              </div>
            </div>
            
            <div 
              className="w-full h-44 rounded-2xl overflow-hidden border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <MapContainer 
                center={[position.lat, position.lng]} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[position.lat, position.lng]} />
                <MapClickHandler setPosition={setPosition} />
                <ChangeMapCenter center={[position.lat, position.lng]} />
              </MapContainer>
            </div>
            <p className="text-[9px] text-slate-400 mt-1">
              Click anywhere on the map or click "Use Current Location" to set the exact coordinates of your organization.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-3 rounded-2xl transition-all shadow-md flex items-center justify-center space-x-2 text-xs mt-4 disabled:opacity-50"
        >
          <span>{loading ? 'Submitting Registration...' : 'Register Organization'}</span>
        </button>
      </form>
    </div>
  );
}
