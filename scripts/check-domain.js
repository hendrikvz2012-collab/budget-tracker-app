const names = ['stash', 'vault', 'ledgr', 'balancr', 'budge', 'spar', 'purse', 'fundr', 'moniz', 'coinkeep', 'payflow', 'budgify', 'spendr'];

async function check(n) {
  try {
    const r = await fetch('https://api.domainsrs.com/v1/check?domain=' + n + '.co.za');
    if (r.ok) {
      const d = await r.json();
      console.log(n + '.co.za: ' + (d.available ? '✅ AVAILABLE' : '❌ taken'));
    } else {
      console.log(n + '.co.za: ❓ ' + r.status);
    }
  } catch (e) {
    console.log(n + '.co.za: ⚠️ ' + e.message);
  }
}

(async () => {
  for (const n of names) await check(n);
})();
