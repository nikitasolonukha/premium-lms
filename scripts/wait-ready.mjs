const url = new URL('/api/ready', process.env.E2E_URL ?? 'http://localhost:3000');
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('CI wait is local-only');
let ready = false;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (response.ok && (await response.json()).status === 'ok') {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('Local readiness did not become healthy');
console.log('Local production server readiness PASS.');
