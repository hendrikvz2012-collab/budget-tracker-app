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
  const baseUrl = `https://api.github.com/repos/${USER}/${REPO}`;

  // First, create an empty root tree to bootstrap the repo
  // Use the Contents API to create README.md first
  console.log('Creating initial README...');
  const initRes = await fetch(baseUrl + '/contents/README.md', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'Initial commit',
      content: Buffer.from('# Budget Tracker\n\nMoney management app with PayPal payouts.\n').toString('base64'),
      branch: BRANCH
    })
  });
  const initData = await initRes.json();
  if (!initRes.ok) throw new Error('Init: ' + initData.message);
  console.log('Initial commit: ' + initData.commit.sha.substring(0, 7));

  // Now get the latest commit SHA
  const refRes = await fetch(baseUrl + '/git/ref/heads/' + BRANCH, { headers });
  const refData = await refRes.json();
  const latestSha = refData.object.sha;
  console.log('Latest commit: ' + latestSha.substring(0, 7));

  // Build new tree with ALL files
  const tree = files.map(f => {
    const buf = fs.readFileSync(f.full);
    if (isText(f.full)) {
      return { path: f.path, mode: '100644', type: 'blob', content: buf.toString('utf8') };
    }
    return { path: f.path, mode: '100644', type: 'blob', content: buf.toString('base64'), encoding: 'base64' };
  });

  // Create tree on top of existing base
  console.log('Creating tree with ' + tree.length + ' items...');
  const treeRes = await fetch(baseUrl + '/git/trees', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tree, base_tree: latestSha })
  });
  const treeData = await treeRes.json();
  if (!treeRes.ok) {
    // Try without base_tree
    console.log('Tree with base_tree failed, trying without...');
    const treeRes2 = await fetch(baseUrl + '/git/trees', {
      method: 'POST',
      headers,
      body: JSON.stringify({ tree })
    });
    const treeData2 = await treeRes2.json();
    if (!treeRes2.ok) throw new Error('Tree: ' + treeData2.message);
    console.log('Tree (no base): ' + treeData2.sha.substring(0, 7));
    var finalTreeSha = treeData2.sha;
  } else {
    console.log('Tree: ' + treeData.sha.substring(0, 7));
    var finalTreeSha = treeData.sha;
  }

  // Create commit
  const commitRes = await fetch(baseUrl + '/git/commits', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Add all application files',
      tree: finalTreeSha,
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

  console.log('\nPushed ' + files.length + ' files to https://github.com/' + USER + '/' + REPO);
  console.log('\nNext: https://render.com -> New Web Service -> Connect this repo');
}

run().catch(err => { console.error('Error: ' + err.message); process.exit(1); });
