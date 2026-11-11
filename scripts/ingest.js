// npm run ingest            → rebuild everything (docs + website + Drive + knowledge/)
// npm run ingest:drive      → only refresh the Drive folder
// Then the running server picks it up automatically (it watches the index file).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runIngest } = require('../lib/ingest');

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : undefined;

runIngest({ only })
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
