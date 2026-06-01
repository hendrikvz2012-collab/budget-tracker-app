const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const configPath = path.join(__dirname, '..', 'mobile-config.json');
const appJsPath = path.join(__dirname, '..', 'public', 'app.js');

if (!fs.existsSync(configPath)) {
  console.error('❌ mobile-config.json not found. Create it with: { "apiUrl": "https://your-backend.com" }');
  process.exit(1);
}

let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
// Env var takes precedence (used by CI)
const apiUrl = process.env.MOBILE_API_URL || config.apiUrl;

if (!apiUrl || apiUrl === 'https://your-deployed-backend.com') {
  console.warn('⚠  Update mobile-config.json with your deployed backend URL before publishing.');
}

let appJs = fs.readFileSync(appJsPath, 'utf8');
const original = appJs;

// Replace the default API_BASE
appJs = appJs.replace("const API_BASE = '';", `const API_BASE = '${apiUrl}';`);
fs.writeFileSync(appJsPath, appJs, 'utf8');

console.log(`🔗 API_BASE set to: ${apiUrl}`);

try {
  execSync('npx cap copy', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  console.log('✅ Synced to native platforms.');
} finally {
  // Always restore the original
  fs.writeFileSync(appJsPath, original, 'utf8');
  console.log('↩  API_BASE restored for web.');
}
