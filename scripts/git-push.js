const TOKEN = process.env.GH_TOKEN;
const USER = 'hendrikvz2012-collab';
const REPO = 'budget-tracker-app';
const BRANCH = 'main';
const DIR = require('path').join(__dirname, '..');
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', 'data.db', 'package-lock.json']);

function isText(full) {
  const ext = path.extname(full).toLowerCase();
  return ['.js', '.json', '.html', '.css', '.svg', '.md', '.txt', '.yml', '.yaml', '.env', '.bat',
          '.xml', '.plist', '.xcconfig', '.properties', '.gradle', '.pro', '.gitignore'].includes(ext);
}

async function run() {
  // Walk files
  const files = [];
  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else files.push({ path: rel.replace(/\\/g, '/'), full });
    }
  }
  walk(DIR, '');
  console.log('Found ' + files.length + ' files');

  const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const baseUrl = 'https://api.github.com/repos/' + USER + '/' + REPO;

  // Get latest commit
  const refRes = await fetch(baseUrl + '/git/ref/heads/' + BRANCH, { headers });
  const refData = await refRes.json();
  if (!refRes.ok) throw new Error('Ref: ' + refData.message);
  const latestSha = refData.object.sha;
  console.log('Latest commit: ' + latestSha.substring(0, 7));

  // Build new tree
  const tree = files.map(f => {
    const buf = fs.readFileSync(f.full);
    if (isText(f.full)) {
      return { path: f.path, mode: '100644', type: 'blob', content: buf.toString('utf8') };
    }
    return { path: f.path, mode: '100644', type: 'blob', content: buf.toString('base64'), encoding: 'base64' };
  });

  // Create tree
  console.log('Creating tree with ' + tree.length + ' items...');
  const treeRes = await fetch(baseUrl + '/git/trees', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tree, base_tree: latestSha })
  });
  const treeData = await treeRes.json();
  if (!treeRes.ok) throw new Error('Tree: ' + treeData.message);
  console.log('Tree: ' + treeData.sha.substring(0, 7));

  // Create commit
  const commitRes = await fetch(baseUrl + '/git/commits', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Cleanup temp scripts and finalize',
      tree: treeData.sha,
      parents: [latestSha]
    })
  });
  const commitData = await commitRes.json();
  if (!commitRes.ok) throw new Error('Commit: ' + commitData.message);
  console.log('Commit: ' + commitData.sha.substring(0, 7));

  // Update branch ref
  const updateRes = await fetch(baseUrl + '/git/refs/heads/' + BRANCH, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: commitData.sha, force: true })
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok) throw new Error('Update ref: ' + updateData.message);

  console.log('\nUpdated: https://github.com/' + USER + '/' + REPO);
}

run().catch(err => { console.error('Error: ' + err.message); process.exit(1); });
