#!/usr/bin/env node
/**
 * Schwab API Client (lite) — SPX/VIX spot quotes + EM
 *
 * Minimal client exposing only spot/VIX/EM data.
 * Uses schwab-client-js for OAuth2 token management and API calls.
 * Requires SCHWAB_APP_KEY, SCHWAB_SECRET, SCHWAB_REFRESH_TOKEN,
 * SCHWAB_CALLBACK_URL in scripts/.env.
 *
 * CLI:
 *   node scripts/schwab-lite.js auth      # Run OAuth flow, get refresh token
 *   node scripts/schwab-lite.js quotes    # Print SPX/VIX quotes
 */

require('dotenv').config({ path: __dirname + '/.env' });

const { MarketApiClient } = require('schwab-client-js');

// ── Helpers ──────────────────────────────────────────

function hasCreds() {
  return !!(process.env.SCHWAB_APP_KEY && process.env.SCHWAB_SECRET && process.env.SCHWAB_REFRESH_TOKEN);
}

function getClient() {
  if (!hasCreds()) {
    throw new Error(
      'Missing Schwab credentials. Set SCHWAB_APP_KEY, SCHWAB_SECRET, ' +
      'SCHWAB_REFRESH_TOKEN in scripts/.env. Run `npx schwab-authorize` to get a refresh token.'
    );
  }
  return new MarketApiClient();
}

// ── Quotes ───────────────────────────────────────────

async function fetchQuotes() {
  const client = getClient();
  const data = await client.quotes('$SPX,$VIX');

  const spxQuote = data['$SPX']?.quote || data['$SPX'] || {};
  const vixQuote = data['$VIX']?.quote || data['$VIX'] || {};

  const spot = spxQuote.lastPrice ?? spxQuote.last ?? null;
  const vix = vixQuote.lastPrice ?? vixQuote.last ?? null;

  // VIX-derived EM: Spot x (VIX/100) x sqrt(1/252)
  const em = (spot && vix) ? Math.round(spot * (vix / 100) * Math.sqrt(1 / 252) * 100) / 100 : null;

  return {
    spot,
    vix,
    em,
    spot_change: spxQuote.netChange ?? null,
    spot_pct_change: spxQuote.netPercentChange ?? null,
    vix_change: vixQuote.netChange ?? null,
    spot_timestamp: spxQuote.quoteTime ?? spxQuote.tradeTime ?? new Date().toISOString(),
  };
}

// ── CLI ──────────────────────────────────────────────

async function cli() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
  Schwab API Client (lite) — SPX/VIX only
  ${'─'.repeat(40)}

  Commands:
    auth          Run OAuth flow (via schwab-authorize)
    quotes        Print SPX/VIX quotes + EM

  Setup:
    1. Register at developer.schwab.com
    2. Add to scripts/.env:
       SCHWAB_APP_KEY=your_app_key
       SCHWAB_SECRET=your_secret
       SCHWAB_CALLBACK_URL=https://127.0.0.1:5556
    3. Run: npx schwab-authorize
    4. Copy SCHWAB_REFRESH_TOKEN to scripts/.env
`);
    return;
  }

  if (command === 'auth') {
    console.log('\nRunning Schwab OAuth authorization...');
    console.log('This will open a browser window for Schwab login.\n');
    const { execSync } = require('child_process');
    try {
      execSync('npx schwab-authorize', { stdio: 'inherit', cwd: __dirname });
    } catch (e) {
      console.error('Auth failed:', e.message);
      console.log('\nAlternative: run `npx manual-authorize` for a manual flow.');
    }
    return;
  }

  if (command === 'quotes') {
    console.log('\nFetching SPX/VIX quotes...\n');
    const q = await fetchQuotes();
    console.log('SPX Spot:   ' + (q.spot ?? 'N/A'));
    console.log('SPX Change: ' + (q.spot_change ?? 'N/A') + ' (' + (q.spot_pct_change ?? 'N/A') + '%)');
    console.log('VIX:        ' + (q.vix ?? 'N/A'));
    console.log('VIX Change: ' + (q.vix_change ?? 'N/A'));
    console.log('EM:         ' + (q.em ?? 'N/A'));
    console.log('Timestamp:  ' + q.spot_timestamp);
    console.log('');
    return;
  }

  console.log('Unknown command: ' + command + '. Run `node scripts/schwab-lite.js help` for usage.');
}

// ── Exports ──────────────────────────────────────────

module.exports = { fetchQuotes, hasCreds };

if (require.main === module) {
  cli().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
