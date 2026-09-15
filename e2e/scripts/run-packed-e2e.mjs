import { runPackedE2E } from './packed-e2e.mjs';

const playwrightArguments = process.argv.slice(2);
if (playwrightArguments[0] === '--') playwrightArguments.shift();

await runPackedE2E({
  keepTemporaryRoot: process.env.PHASE_E2E_KEEP_TEMP === '1',
  playwrightArguments,
});
