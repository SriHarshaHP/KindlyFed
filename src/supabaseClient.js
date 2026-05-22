import { createClient } from '@supabase/supabase-js';

// Retrieve from environment variables, or fallback to localStorage
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseUrl = (envUrl && envUrl !== 'YOUR_SUPABASE_URL') ? envUrl : (localStorage.getItem('supabase_url') || '');
let supabaseAnonKey = (envKey && envKey !== 'YOUR_SUPABASE_ANON_KEY') ? envKey : (localStorage.getItem('supabase_anon_key') || '');

export const isSupabaseConfigured = () => {
  return (
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('https://') &&
    supabaseAnonKey.length > 20
  );
};

export const getSupabaseConfig = () => {
  return { supabaseUrl, supabaseAnonKey };
};

export const saveSupabaseConfig = (url, key) => {
  localStorage.setItem('supabase_url', url.trim());
  localStorage.setItem('supabase_anon_key', key.trim());
  window.location.reload();
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_anon_key');
  window.location.reload();
};

// Initialize Supabase client
// If not configured, we initialize with placeholder credentials to prevent app crash
export const supabase = createClient(
  isSupabaseConfigured() ? supabaseUrl : 'https://placeholder-project.supabase.co',
  isSupabaseConfigured() ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
);
