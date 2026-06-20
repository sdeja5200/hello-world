// Thin bootstrap. Registers process-level error handlers BEFORE the heavier
// application modules are imported, so that any failure during import (e.g.
// the Prisma query-engine failing to load) is printed clearly instead of the
// process dying silently with no flushed output. The real app lives in
// ./server.ts and is loaded via dynamic import below.

process.on('uncaughtException', (err) => {
  console.error('[boot] FATAL uncaughtException during startup:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[boot] FATAL unhandledRejection during startup:', err);
  process.exit(1);
});

console.log('[boot] bootstrap starting; loading application…');

import('./server.js')
  .then(() => console.log('[boot] application module loaded'))
  .catch((err) => {
    console.error('[boot] FATAL: failed to load application module:', err);
    process.exit(1);
  });
