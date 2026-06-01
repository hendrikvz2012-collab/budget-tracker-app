const token = process.env.GH_TOKEN;
fetch('https://api.github.com/user', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json()).then(d => {
  console.log(d.login || 'ERROR: ' + d.message);
});
