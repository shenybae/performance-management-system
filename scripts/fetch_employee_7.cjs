#!/usr/bin/env node
(async () => {
  try {
    const url = 'http://localhost:3000/api/employees/7';
    const res = await fetch(url);
    const txt = await res.text();
    console.log(txt);
  } catch (err) {
    console.error('Fetch failed:', err);
    process.exit(1);
  }
})();
