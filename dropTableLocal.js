const Database = require('better-sqlite3');
const db = new Database(
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/856caed372b24c8e61588afa39b8c13d8b946a3153570749f5a54eed2c68e98e.sqlite',
);

db.exec('DROP TABLE IF EXISTS projects');
