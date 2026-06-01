const TOKEN = process.env.GH_TOKEN;
const USER = 'hendrikvz2012-collab';
const REPO = 'budget-tracker-app';

async function run() {
  // Check for content
  const res = await fetch(`https://api.github.com/repos/${USER}/${REPO}/contents/`, {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  if (res.ok) {
    const data = await res.json();
    console.log('Repo contents (' + data.length + ' items):');
    data.forEach(d => console.log(' - ' + d.name + ' (' + d.type + ')'));
  } else {
    const data = await res.json();
    console.log('Status: ' + res.status + ' - ' + data.message);
    
    // Try getting the default branch ref
    const refRes = await fetch(`https://api.github.com/repos/${USER}/${REPO}/git/ref/heads/main`, {
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    if (refRes.ok) {
      const ref = await refRes.json();
      console.log('Branch main exists: ' + ref.object.sha.substring(0, 7));
    } else {
      const refData = await refRes.json();
      console.log('Branch main: ' + refRes.status + ' - ' + refData.message);
    }
  }
}

run().catch(err => { console.error('Error: ' + err.message); });
