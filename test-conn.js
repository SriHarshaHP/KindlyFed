const url = 'https://mcnocnedrzfduqzhjrlr.supabase.co/rest/v1/';
console.log('Fetching', url);
fetch(url, { method: 'GET' })
  .then(res => {
    console.log('Status:', res.status);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
setTimeout(() => {
  console.error('Timeout after 10s');
  process.exit(1);
}, 10000);
