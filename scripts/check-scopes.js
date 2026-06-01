const token = process.env.GH_TOKEN;
// Check what scopes the token has
const res = await fetch('https://api.github.com/user', {
  headers: { 'Authorization': 'Bearer ' + token }
});
console.log('Status:', res.status);
const headers = {};
for (const [k, v] of res.headers) headers[k] = v;
console.log('X-OAuth-Scopes:', headers['x-oauth-scopes']);
console.log('X-Accepted-OAuth-Scopes:', headers['x-accepted-oauth-scopes']);
const data = await res.json();
console.log('User:', data.login);
