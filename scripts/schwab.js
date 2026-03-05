#!/usr/bin/env node
/**
 * Schwab API Client — SPX/VIX quotes
 *
 * Fetches SPX spot, VIX, and computes VIX-derived EM.
 * Requires SCHWAB_APP_KEY, SCHWAB_SECRET, SCHWAB_REFRESH_TOKEN in .env.
 *
 * CLI:
 *   node scripts/schwab.js quotes   # Print SPX/VIX quotes
 */

require('dotenv').config({ path: __dirname + '/.env' });

const { MarketApiClient } = require('schwab-client-js');

function hasCreds() {
  return !!(process.env.SCHWAB_APP_KEY && process.env.SCHWAB_SECRET && process.env.SCHWAB_REFRESH_TOKEN);
}

function getClient() {
  if (!hasCreds()) {
    throw new Error(
      'Missing Schwab credentials. Set SCHWAB_APP_KEY, SCHWAB_SECRET, ' +
      'SCHWAB_REFRESH_TOKEN in .env. Run `npx schwab-authorize` to get a refresh token.'
    );
  }
  return new MarketApiClient();
}

async function fetchQuotes() {
  const client = getClient();
  const data = await client.quotes('$SPX,$VIX');

  const spxQuote = data['$SPX']?.quote || data['$SPX'] || {};
  const vixQuote = data['$VIX']?.quote || data['$VIX'] || {};

  const spot = spxQuote.lastPrice ?? spxQuote.last ?? null;
  const vix = vixQuote.lastPrice ?? vixQuote.last ?? null;

  // VIX-derived EM: Spot × (VIX/100) × √(1/252)
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

// ── CLI ─────────────────────────────────────────────

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'quotes') {
    fetchQuotes().then(q => {
      console.log(`SPX: ${q.spot}  VIX: ${q.vix}  EM: ${q.em}`);
      if (q.spot_change != null) console.log(`Change: ${q.spot_change > 0 ? '+' : ''}${q.spot_change} (${q.spot_pct_change > 0 ? '+' : ''}${q.spot_pct_change?.toFixed(2)}%)`);
    }).catch(e => { console.error(e.message); process.exit(1); });
  } else {
    console.log('Usage: node scripts/schwab.js quotes');
  }
}

module.exports = { fetchQuotes, hasCreds };
