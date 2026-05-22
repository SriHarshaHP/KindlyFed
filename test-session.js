import { createClient } from '@supabase/supabase-js';

const url = 'https://mcnocnedrzfduqzhjrlr.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jbm9jbmVkcnpmZHVxemhqcmxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjc4NzUsImV4cCI6MjA5NTAwMzg3NX0.bYdvd_mTlzDIAUPd0rWnM51Ukgl4x4Edt2Jt_XBD6DY';

const supabase = createClient(url, key);

console.log('Testing getSession...');
supabase.auth.getSession()
  .then(res => {
    console.log('getSession success:', res.data);
    process.exit(0);
  })
  .catch(err => {
    console.error('getSession error:', err);
    process.exit(1);
  });
setTimeout(() => {
  console.error('Timeout after 10s');
  process.exit(1);
}, 10000);
