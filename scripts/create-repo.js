const TOKEN = process.env.GH_TOKEN;
const USER = 'hendrikvz2012-collab';
const REPO = 'budget-tracker-app';

async function run() {
  // Delete existing repo
  console.log('Deleting old repo...');
  await fetch(`https://api.github.com/repos/${USER}/${REPO}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  // Wait a moment for GitHub to process
  await new Promise(r => setTimeout(r, 2000));

  // Recreate with README so main branch exists
  console.log('Creating repo with README...');
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: REPO,
      description: 'Budget Tracker App',
      private: false,
      auto_init: true
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Create: ' + data.message);
  console.log('Repo created: ' + data.html_url);
}

run().catch(err => { console.error('Error: ' + err.message); process.exit(1); });
