(async () => {
  try {
    const base = 'http://localhost:3000';
    const creds = { email: 'john.doe@example.com', password: 'demo_employee_pass' };

    async function doLogin() {
      const res = await fetch(`${base}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
      const txt = await res.text();
      console.log('login -> status', res.status, 'body:', txt);
      if (res.ok) return JSON.parse(txt).token;
      return null;
    }

    const token1 = await doLogin();
    const token2 = await doLogin();
    console.log('token1:', token1);
    console.log('token2:', token2);

    // Test using token1
    if (token1) {
      const r = await fetch(`${base}/api/account-info`, { headers: { Authorization: `Bearer ${token1}` } });
      console.log('/api/account-info with token1 ->', r.status, await r.text());
    }
    if (token2) {
      const r2 = await fetch(`${base}/api/account-info`, { headers: { Authorization: `Bearer ${token2}` } });
      console.log('/api/account-info with token2 ->', r2.status, await r2.text());
    }
  } catch (e) {
    console.error('Test script error', e);
    process.exit(1);
  }
})();
