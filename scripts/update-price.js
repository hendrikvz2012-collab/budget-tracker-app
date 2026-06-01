const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, '..', 'data.db');
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  db.run("UPDATE app_settings SET value = '2.50' WHERE key = 'sub_price'");
  fs.writeFileSync(dbPath, db.export());
  console.log('DB updated: subscription price = $2.50');
}
main();
