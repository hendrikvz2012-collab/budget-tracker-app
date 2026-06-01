const token = process.env.GH_TOKEN;
fetch('https://api.github.com/repos/hendrikvz2012-collab/budget-tracker-app', {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer ' + token }
}).then(r => {
  console.log('Delete status:', r.status);
  if (r.status === 204) console.log('Repo deleted');
  else r.json().then(d => console.log(d));
});
