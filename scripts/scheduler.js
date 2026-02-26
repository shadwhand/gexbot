#!/usr/bin/env node
/**
 * SPX Data Scheduler
 *
 * Runs during market hours (9:30 AM – 4:00 PM ET).
 * Every 10 minutes:
 *   - Fetches GEX/CEX/DEX/VEX/Positioning from optionsdepth.com
 *   - Fetches SPX spot, VIX, EM from 0dtespx.com
 *   - Merges into latest_data.json
 *   - Saves timestamped snapshot
 */

require('dotenv').config({ path: __dirname + '/.env' });
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { launchOptions, wait, nowET, isMarketHours, formatTimeET, snapshotDir } = require('./shared');
const { ensureLoggedIn, extractAllData, CONFIG: odConfig } = require('./fetch_data');
const { fetch0dte, PROFILE_DIR: zeroProfileDir } = require('./fetch_0dte');

const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MARKET_START_OFFSET = 4; // minutes after 9:30 to wait; ticks at :X4 (:04, :14, :24, ...)
const BASE_DIR = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(BASE_DIR, 'latest_data.json');

let odBrowser = null;
let odPage = null;
let zdteBrowser = null;
let zdtePage = null;
let intervalHandle = null;

function log(msg) {
  const time = formatTimeET(new Date());
  console.log(`[${time}] ${msg}`);
}

async function launchODBrowser() {
  log('Launching optionsdepth browser...');
  odBrowser = await puppeteer.launch(launchOptions(odConfig.chromeProfilePath));
  odPage = await odBrowser.newPage();
  odPage.setDefaultTimeout(odConfig.timeout);
  await ensureLoggedIn(odPage);
  log('optionsdepth browser ready');
}

async function launch0DTEBrowser() {
  log('Launching 0dtespx browser...');
  zdteBrowser = await puppeteer.launch(launchOptions(zeroProfileDir));
  zdtePage = await zdteBrowser.newPage();
  zdtePage.setDefaultTimeout(45000);
  log('0dtespx browser ready');
}

async function fetchOD() {
  try {
    if (!odBrowser || !odBrowser.isConnected()) {
      log('OD browser disconnected — relaunching...');
      await launchODBrowser();
    }
    log('Fetching optionsdepth data...');
    const result = await extractAllData(odPage);
    log('optionsdepth: OK (' + Object.keys(result.data).length + ' metrics)');
    return result;
  } catch (err) {
    log('optionsdepth ERROR: ' + err.message);
    // One relaunch attempt
    try {
      if (odBrowser) await odBrowser.close().catch(() => {});
      await launchODBrowser();
      const result = await extractAllData(odPage);
      log('optionsdepth: OK after relaunch');
      return result;
    } catch (e) {
      log('optionsdepth relaunch failed: ' + e.message);
      return null;
    }
  }
}

async function fetch0DTE() {
  try {
    if (!zdteBrowser || !zdteBrowser.isConnected()) {
      log('0dte browser disconnected — relaunching...');
      await launch0DTEBrowser();
    }
    log('Fetching 0dtespx data...');
    const { data } = await fetch0dte(zdtePage);
    log('0dtespx: SPX=' + (data.spx || '?') + ' VIX=' + (data.vix || '?') + ' EM=' + (data.em || '?'));
    return data;
  } catch (err) {
    log('0dtespx ERROR: ' + err.message);
    // One relaunch attempt
    try {
      if (zdteBrowser) await zdteBrowser.close().catch(() => {});
      await launch0DTEBrowser();
      const { data } = await fetch0dte(zdtePage);
      log('0dtespx: OK after relaunch');
      return data;
    } catch (e) {
      log('0dtespx relaunch failed: ' + e.message);
      return null;
    }
  }
}

async function tick() {
  const now = nowET();
  if (!isMarketHours(now)) {
    log('Outside market hours — skipping');
    return;
  }

  log('=== TICK START ===');

  // Fetch both sources in parallel
  const [odResult, zdteResult] = await Promise.all([fetchOD(), fetch0DTE()]);

  // Load existing data to preserve manual fields
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (e) {}

  const timestamp = new Date().toISOString();
  const merged = {
    timestamp,
    date: timestamp.split('T')[0],
    time_et: formatTimeET(new Date()),
    spot: zdteResult?.spx || odResult?.spot || existing.spot || null,
    vix: zdteResult?.vix || existing.vix || null,
    em: zdteResult?.em || existing.em || null,
    vwap: existing.vwap || null, // manual only
    data: odResult?.data || existing.data || {},
  };

  // Write latest_data.json
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(merged, null, 2));
  log('Wrote latest_data.json');

  // Save snapshot
  const snapDir = snapshotDir(BASE_DIR);
  const timeStr = formatTimeET(new Date()).replace(/:/g, '-').substring(0, 5);
  const snapPath = path.join(snapDir, timeStr + '.json');
  fs.writeFileSync(snapPath, JSON.stringify(merged, null, 2));
  log('Snapshot: ' + snapPath);

  // Summary
  log('--- Summary ---');
  log('Spot: ' + (merged.spot || '?') + ' | VIX: ' + (merged.vix || '?') + ' | EM: ' + (merged.em || '?'));
  const metrics = Object.keys(merged.data);
  log('Metrics: ' + metrics.join(', '));
  log('=== TICK END ===\n');
}

async function shutdown() {
  log('Shutting down...');
  if (intervalHandle) clearInterval(intervalHandle);
  if (odBrowser) await odBrowser.close().catch(() => {});
  if (zdteBrowser) await zdteBrowser.close().catch(() => {});
  log('Browsers closed. Done.');
  process.exit(0);
}

async function main() {
  console.log('\n SPX Data Scheduler');
  console.log(' ' + '-'.repeat(40));
  console.log(' Interval: 10 minutes (ticks at :04, :14, :24, :34, :44, :54)');
  console.log(' Market hours: 9:34 AM – 4:00 PM ET\n');

  // Graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const now = nowET();
  if (!isMarketHours(now)) {
    const day = now.getDay();
    if (day === 0 || day === 6) {
      log('Weekend — markets closed. Exiting.');
      process.exit(0);
    }
    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMinute = 570 + MARKET_START_OFFSET; // 9:35 AM
    if (minutes < startMinute) {
      const waitMs = (startMinute - minutes) * 60 * 1000;
      log('Pre-market. Waiting ' + Math.round(waitMs / 60000) + ' min until 9:34 AM ET...');
      await wait(waitMs);
    } else {
      log('After hours — markets closed. Exiting.');
      process.exit(0);
    }
  }

  // Launch both browsers
  try {
    await launchODBrowser();
  } catch (e) {
    log('Failed to launch OD browser: ' + e.message);
    log('Continuing with 0dte only...');
  }

  try {
    await launch0DTEBrowser();
  } catch (e) {
    log('Failed to launch 0dte browser: ' + e.message);
    log('Continuing with OD only...');
  }

  // Initial fetch
  await tick();

  // Align next tick to the :X4 schedule (e.g. :04, :14, :24, :34, :44, :54)
  const nowMins = nowET().getMinutes();
  const offset = MARKET_START_OFFSET % 10; // 5
  const minsIntoCycle = ((nowMins - offset) % 10 + 10) % 10;
  const delayToNext = minsIntoCycle === 0 ? 10 : (10 - minsIntoCycle);
  const alignMs = delayToNext * 60 * 1000;

  log('Next tick in ~' + delayToNext + ' min (aligning to :X5 schedule). Ctrl+C to stop.');

  setTimeout(async () => {
    await tick();
    // Then every 10 minutes
    intervalHandle = setInterval(async () => {
      const now = nowET();
      if (!isMarketHours(now)) {
        log('Market closed. Shutting down.');
        await shutdown();
        return;
      }
      await tick();
    }, INTERVAL_MS);
  }, alignMs);
}

main().catch(err => {
  console.error('Scheduler fatal error:', err);
  process.exit(1);
});
