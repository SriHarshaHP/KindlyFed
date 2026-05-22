import { createClient } from '@supabase/supabase-js';

const url = 'https://placeholder.supabase.co';
const key = 'placeholder';

const supabase = createClient(url, key);

console.log('Testing getSession on placeholder...');
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
