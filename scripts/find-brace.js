const fs = require('fs');
const src = fs.readFileSync('public/app.js', 'utf8');
const lines = src.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Skip comments and strings roughly
  const cleaned = line.replace(/\/\/.*/, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
  depth += (cleaned.match(/\{/g) || []).length;
  depth -= (cleaned.match(/\}/g) || []).length;
  if (depth < 0) {
    console.log('Line', i+1, 'DEPTH NEGATIVE:', depth);
    console.log('  ' + line.trim());
    break;
  }
}
console.log('Final depth:', depth);
if (depth > 0) {
  // Find the last function/block that's unclosed
  let d = 0;
  let lastOpen = -1;
  for (let i = 0; i < lines.length; i++) {
    const cleaned = lines[i].replace(/\/\/.*/, '').replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '').replace(/`[^`]*`/g, '');
    const opens = (cleaned.match(/\{/g) || []).length;
    if (opens > 0) d += opens;
    if (d === depth && depth > 0) {
      console.log('Likely unclosed block started around line', i+1);
      console.log('  ' + lines[i].trim());
      break;
    }
    d -= (cleaned.match(/\}/g) || []).length;
  }
}
