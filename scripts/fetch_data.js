#!/usr/bin/env node
/**
 * SPX Options Depth Data Fetcher
 */

require('dotenv').config({ path: __dirname + '/.env' });
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetch0dte } = require('./fetch_0dte');
const { fetchQuotes, hasCreds: hasSchwabCreds } = require('./schwab');

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function findChromeUserDataDir() {
  const home = os.homedir();
  const candidates = {
    darwin: [
      path.join(home, 'Library/Application Support/Google/Chrome'),
      path.join(home, 'Library/Application Support/Chromium'),
    ],
    win32: [
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/User Data'),
    ],
    linux: [
      path.join(home, '.config/google-chrome'),
      path.join(home, '.config/chromium'),
    ],
  };
  for (const p of (candidates[process.platform] || [])) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function computeStrikeRange(spot, em) {
  // Priority: env STRIKE_FLOOR/CEIL > env SPOT/EM > auto-fetched spot/em
  if (process.env.STRIKE_FLOOR || process.env.STRIKE_CEIL) {
    return {
      floor: parseInt(process.env.STRIKE_FLOOR || '6700'),
      ceil: parseInt(process.env.STRIKE_CEIL || '7000'),
    };
  }
  const s = parseInt(process.env.SPOT) || spot;
  const e = parseInt(process.env.EM) || em;
  if (s && e) {
    const floor = Math.floor((s - 2 * e) / 5) * 5;
    const ceil = Math.ceil((s + 2 * e) / 5) * 5;
    return { floor, ceil };
  }
  return { floor: 6700, ceil: 7000 };
}

const CONFIG = {
  url: 'https://app.optionsdepth.com/depth-view?tab=table',
  loginUrl: 'https://app.optionsdepth.com',
  email: process.env.OD_EMAIL,
  password: process.env.OD_PASSWORD,
  loginMethod: process.env.LOGIN_METHOD || 'google',
  outputPath: process.env.OUTPUT_PATH || path.join(__dirname, '../latest_data.json'),
  strikeFloor: null, // set in main() after 0dte fetch
  strikeCeil: null,
  columnIndex: parseInt(process.env.COLUMN_INDEX || '1'),
  timeout: 30000,
  chromePath: findChrome(),
  chromeUserDataDir: findChromeUserDataDir(),
};

function launchOptions() {
  // Use a dedicated scraper profile to avoid conflicts with running Chrome
  const scraperProfileDir = path.join(__dirname, '..', '.chrome-scraper-profile');
  const opts = {
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--new-window',
      '--disable-blink-features=AutomationControlled',
      '--user-data-dir=' + scraperProfileDir,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (CONFIG.chromePath) opts.executablePath = CONFIG.chromePath;
  return opts;
}

const EXTRACT_TABLE = (label, strikeFloor, strikeCeil, colIdx, aggregate = false) => `
  (() => {
    const rows = Array.from(document.querySelectorAll('tr[data-index]'));
    const data = rows.map(row => {
      const cells = row.querySelectorAll('td');
      const strike = cells[0]?.textContent.trim();
      let value;
      if (${aggregate}) {
        // Sum all non-strike columns
        let sum = 0;
        let found = false;
        for (let i = 1; i < cells.length; i++) {
          const txt = cells[i]?.querySelector('div')?.textContent.trim()
                    || cells[i]?.textContent.trim();
          if (txt) {
            const num = parseFloat(txt.replace(/,/g, ''));
            if (!isNaN(num)) { sum += num; found = true; }
          }
        }
        value = found ? String(sum) : null;
      } else {
        value = cells[${colIdx}]?.querySelector('div')?.textContent.trim()
                  || cells[${colIdx}]?.textContent.trim();
      }
      return { strike: parseInt(strike), value };
    }).filter(r => r.strike && r.strike >= ${strikeFloor} && r.strike <= ${strikeCeil} && r.value);
    return { label: '${label}', rows: data };
  })()
`;

const wait = ms => new Promise(r => setTimeout(r, ms));

// Navigate with a fallback — don't rely on networkidle2 with real Chrome profiles
async function goto(page, url) {
  console.log('  Navigating to: ' + url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeout });
  } catch (e) {
    // domcontentloaded timed out — page may still be usable
    console.log('  (navigation timeout — continuing anyway)');
  }
  await wait(3000); // Let JS frameworks render
}

async function ensureLoggedIn(page) {
  console.log('Step 1: Opening optionsdepth...');
  await goto(page, CONFIG.loginUrl);

  console.log('Step 2: Checking login state...');
  const currentUrl = page.url();
  console.log('  URL: ' + currentUrl);

  const loggedIn = await page.evaluate(() =>
    !document.querySelector('input[type="email"]') &&
    !window.location.href.includes('login') &&
    !window.location.href.includes('auth') &&
    !window.location.href.includes('sign-in')
  ).catch(() => false);

  if (loggedIn) {
    console.log('  Already logged in ✓');
    return;
  }

  console.log('  Not logged in — starting auth flow...');
  if (CONFIG.loginMethod === 'google') {
    await loginWithGoogle(page);
  } else {
    await loginWithEmail(page);
  }
}

async function loginWithGoogle(page) {
  console.log('  Looking for Google sign-in button...');

  const googleSelectors = [
    'button[data-provider="google"]',
    '[class*="google"]',
    'a[href*="google"]',
    'button',
  ];

  let clicked = false;
  for (const sel of googleSelectors) {
    try {
      const els = await page.$$(sel);
      for (const el of els) {
        const text = await el.evaluate(e => e.textContent.toLowerCase());
        if (text.includes('google')) {
          await el.click();
          clicked = true;
          console.log('  Clicked Google button');
          break;
        }
      }
      if (clicked) break;
    } catch (e) {}
  }

  if (!clicked) {
    console.log('  Could not auto-click — please click "Sign in with Google" in the browser');
  }

  console.log('  Waiting for login to complete (up to 2 min)...');
  await page.waitForFunction(
    () => window.location.href.includes('app.optionsdepth.com') &&
          !window.location.href.includes('login') &&
          !window.location.href.includes('auth') &&
          !window.location.href.includes('sign-in'),
    { timeout: 120000 }
  );
  await wait(2000);
  console.log('  Login complete ✓');
}

async function loginWithEmail(page) {
  if (!CONFIG.email || !CONFIG.password) throw new Error('Set OD_EMAIL and OD_PASSWORD in scripts/.env');
  const emailInput = await page.$('input[type="email"], input[name="email"]');
  if (!emailInput) throw new Error('Email input not found');
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(CONFIG.email, { delay: 50 });
  const passInput = await page.$('input[type="password"]');
  if (!passInput) throw new Error('Password input not found');
  await passInput.click({ clickCount: 3 });
  await passInput.type(CONFIG.password, { delay: 50 });
  await passInput.press('Enter');
  await wait(3000);
  console.log('  Login complete ✓');
}

async function clickSelector(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); await wait(500); return true; }
    } catch (e) {}
  }
  return false;
}

async function openColumnPicker(page, pickerIndex = 1) {
  // Site has changed wrapper classes over time — try all known variants
  const selectors = [
    `div._outletBody_15kid_25 p:nth-of-type(${pickerIndex})`,
    `div._depthViewWrapper_l6crd_81 p:nth-of-type(${pickerIndex})`,
    `div._outletBody_15kid_25 p:nth-of-type(${pickerIndex}) > span`,
    `div._depthViewWrapper_l6crd_81 p:nth-of-type(${pickerIndex}) > span`,
  ];
  const clicked = await clickSelector(page, selectors);
  if (!clicked) {
    // Fallback: find any <p> that looks like a column picker by content
    const fallback = await page.evaluate((idx) => {
      const ps = document.querySelectorAll('p');
      const metricNames = ['GEX', 'CEX', 'DEX', 'VEX', 'Position', 'NET_POSITION'];
      const pickers = Array.from(ps).filter(p => {
        const text = p.textContent.trim();
        return metricNames.some(m => text.includes(m)) && p.querySelector('svg, span');
      });
      if (pickers[idx - 1]) { pickers[idx - 1].click(); return true; }
      return false;
    }, pickerIndex);
    if (fallback) console.log('  (used fallback picker click)');
  }
  // Extra wait for portal to render
  await wait(800);
  return clicked;
}

async function selectMetric(page, metricId) {
  // Strategy 1: [id="..."] label — recorder confirms this works (old format IDs)
  const labelEl = await page.$(`[id="${metricId}"] label`);
  if (labelEl) {
    await labelEl.click();
    await wait(500);
    return true;
  }
  // Strategy 2: [id="..."] element itself
  const el = await page.$(`[id="${metricId}"]`);
  if (el) {
    await el.click();
    await wait(500);
    return true;
  }

  // Strategy 3: aria label (recorder uses ::-p-aria for Position)
  const METRIC_ARIA = {
    'GEX': 'GEX - $M/pt', 'CEX': 'CEX - $M/5min',
    'DEX': 'DEX - δ', 'VEX': 'VEX - $M/σ%',
    'NET_POSITION': 'Position - #', 'POSITION': 'Position - #',
  };
  const shortName = metricId.split('-')[0];
  const ariaLabel = METRIC_ARIA[shortName];
  if (ariaLabel) {
    try {
      const ariaEl = await page.$(`[aria-label="${ariaLabel}"]`);
      if (ariaEl) {
        await ariaEl.click();
        await wait(500);
        return true;
      }
    } catch (e) {}
    // Try text content match inside portal
    try {
      const clicked = await page.evaluate((label) => {
        const allLabels = document.querySelectorAll('label');
        for (const l of allLabels) {
          if (l.textContent.includes(label.split(' - ')[0])) {
            l.click();
            return true;
          }
        }
        return false;
      }, ariaLabel);
      if (clicked) {
        await wait(500);
        return true;
      }
    } catch (e) {}
  }

  console.log(`  WARNING: selectMetric failed for ${metricId}`);
  const debug = await page.evaluate(() => {
    const divs = document.querySelectorAll('body > div');
    const labels = document.querySelectorAll('label');
    return {
      portalDivs: divs.length,
      labels: Array.from(labels).slice(0, 10).map(l => ({ text: l.textContent.slice(0, 40), id: l.parentElement?.id || '' })),
    };
  });
  console.log('  Debug:', JSON.stringify(debug));
  return false;
}

async function clickApply(page) {
  await clickSelector(page, [
    'div._applyButtonWrapper_1flww_44 > button',
    '[aria-label="Apply"]',
  ]);
  await wait(1500);
}

const METRIC_IDS = {
  GEX:      ['GEX-Depth View-metrics-chartId-null', 'GEX-depth-view-metrics-metrics-chartId-null'],
  CEX:      ['CEX-Depth View-metrics-chartId-null', 'CEX-depth-view-metrics-metrics-chartId-null'],
  DEX:      ['DEX-Depth View-metrics-chartId-null', 'DEX-depth-view-metrics-metrics-chartId-null'],
  VEX:      ['VEX-Depth View-metrics-chartId-null', 'VEX-depth-view-metrics-metrics-chartId-null'],
  POSITION: ['NET_POSITION-Depth View-metrics-chartId-null', 'NET_POSITION-depth-view-metrics-metrics-chartId-null'],
};

async function switchToMetric(page, metric) {
  process.stdout.write('  Switching to ' + metric + '... ');
  await openColumnPicker(page, 1);
  const ids = METRIC_IDS[metric];
  let clicked = false;
  for (const id of ids) {
    clicked = await selectMetric(page, id);
    if (clicked) break;
  }
  if (!clicked) {
    console.log('WARNING: metric switch may have failed for ' + metric);
  }
  await clickApply(page);
  console.log('done');
}


async function scrollTable(page, direction = 'down') {
  const delta = direction === 'down' ? 500 : -500;

  // Try scrolling the table's scrollable container directly
  const scrolled = await page.evaluate((dy) => {
    // Find the scrollable container holding the table rows
    const table = document.querySelector('table') || document.querySelector('[role="grid"]');
    if (!table) return false;
    let el = table.parentElement;
    // Walk up to find the scrollable container
    while (el) {
      if (el.scrollHeight > el.clientHeight + 10) {
        el.scrollBy(0, dy);
        return true;
      }
      el = el.parentElement;
    }
    // Fallback: try all divs with overflow scroll/auto
    const scrollables = Array.from(document.querySelectorAll('div')).filter(d =>
      d.scrollHeight > d.clientHeight + 10 &&
      ['auto', 'scroll'].includes(getComputedStyle(d).overflowY)
    );
    if (scrollables.length > 0) {
      // Pick the one most likely to be the table container (has tr descendants)
      const tableContainer = scrollables.find(d => d.querySelector('tr[data-index]')) || scrollables[0];
      tableContainer.scrollBy(0, dy);
      return true;
    }
    return false;
  }, delta);

  if (!scrolled) {
    // Fallback: keyboard
    const key = direction === 'down' ? 'PageDown' : 'PageUp';
    await page.keyboard.press(key);
  }
  await wait(400);
}

async function extractTable(page, label, shouldScroll = false, aggregate = false) {
  await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });

  const colIdx = aggregate ? 0 : CONFIG.columnIndex; // colIdx unused when aggregate=true
  const extractFn = EXTRACT_TABLE(label, CONFIG.strikeFloor, CONFIG.strikeCeil, CONFIG.columnIndex, aggregate);

  if (!shouldScroll) {
    const result = await page.evaluate(extractFn);
    console.log('  Extracted ' + result.rows.length + ' rows ✓');
    return result;
  }

  const allRows = new Map();

  // Get current visible range
  const getVisibleRange = async () => {
    return page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[data-index]'));
      const strikes = rows.map(r => parseInt(r.querySelector('td')?.textContent)).filter(Boolean);
      return { min: Math.min(...strikes), max: Math.max(...strikes), count: strikes.length };
    });
  };

  // Collect what's visible now (the top)
  let partial = await page.evaluate(extractFn);
  for (const row of partial.rows) allRows.set(row.strike, row);

  let range = await getVisibleRange();
  console.log(`  Visible: ${range.max}–${range.min} (${range.count} rows). Need floor: ${CONFIG.strikeFloor}`);

  // Scroll down, collecting rows at each viewport position
  let stuckCount = 0;
  let prevMin = range.min;
  for (let i = 0; i < 60; i++) {
    if (range.min <= CONFIG.strikeFloor) break;

    await scrollTable(page, 'down');

    partial = await page.evaluate(extractFn);
    for (const row of partial.rows) allRows.set(row.strike, row);

    range = await getVisibleRange();
    if (range.min === prevMin) {
      stuckCount++;
      if (stuckCount >= 5) {
        console.log(`  Scroll stuck at ${range.min}`);
        break;
      }
    } else {
      stuckCount = 0;
    }
    prevMin = range.min;
  }

  const result = { label, rows: Array.from(allRows.values()).sort((a, b) => b.strike - a.strike) };
  console.log(`  Extracted ${result.rows.length} rows (${result.rows[0]?.strike}–${result.rows[result.rows.length-1]?.strike}) ✓`);
  return result;
}



async function main() {
  console.log('\n SPX Options Depth Fetcher');
  console.log(' ' + '─'.repeat(40) + '\n');

  // Step 0: Fetch spot/VIX — try Schwab first, fall back to 0dtespx.com
  const skip0dte = process.argv.includes('--skip-0dte');
  const skipSchwab = process.argv.includes('--skip-schwab');
  let spot0dte = null;
  let schwabQuotes = null;
  // Try Schwab API for spot/VIX (fast, no browser needed)
  if (!skipSchwab && hasSchwabCreds()) {
    console.log('Step 0a: Fetching spot/VIX from Schwab API...');
    try {
      schwabQuotes = await fetchQuotes();
      if (schwabQuotes.spot) {
        console.log('  SPX: ' + schwabQuotes.spot + ' | VIX: ' + schwabQuotes.vix + ' (Schwab)');
        spot0dte = { spx: schwabQuotes.spot, vix: schwabQuotes.vix, em: null };
      } else {
        console.log('  WARNING: Schwab returned no spot data');
      }
    } catch (err) {
      console.log('  WARNING: Schwab fetch failed: ' + err.message);
    }
  }

  // Fall back to 0dtespx.com for spot/VIX/EM (EM always comes from here)
  if (!skip0dte && (!spot0dte?.spx || !spot0dte?.em)) {
    const reason = !spot0dte?.spx ? 'spot/VIX/EM' : 'EM only';
    console.log(`Step 0b: Fetching ${reason} from 0dtespx.com...`);
    try {
      const { data: d0, browser: b0 } = await fetch0dte(null, null);
      if (b0) await b0.close();
      if (d0.spx) {
        // If Schwab gave us spot, keep it but grab EM from 0dte
        if (spot0dte?.spx) {
          spot0dte.em = d0.em;
          console.log('  EM: ' + d0.em + ' (from 0dte, spot/VIX from Schwab)');
        } else {
          spot0dte = d0;
          console.log('  SPX: ' + d0.spx + ' | VIX: ' + d0.vix + ' | EM: ' + d0.em);
        }
      } else {
        console.log('  WARNING: Could not fetch from 0dtespx — using env/defaults');
      }
    } catch (err) {
      console.log('  WARNING: 0dte fetch failed: ' + err.message);
    }
  }
  console.log('');

  // Compute strike range using 0dte data (env vars override if set)
  const strikeRange = computeStrikeRange(
    spot0dte?.spx ? Math.round(spot0dte.spx) : null,
    spot0dte?.em ? Math.round(spot0dte.em) : null
  );
  CONFIG.strikeFloor = strikeRange.floor;
  CONFIG.strikeCeil = strikeRange.ceil;

  if (CONFIG.chromePath)        console.log('Chrome:  ' + CONFIG.chromePath);
  if (CONFIG.chromeUserDataDir) console.log('Profile: ' + CONFIG.chromeUserDataDir + '\n');

  const browser = await puppeteer.launch(launchOptions());
  const page = await browser.newPage();
  page.setDefaultTimeout(CONFIG.timeout);

  try {
    await ensureLoggedIn(page);

    console.log('\nStep 3: Navigating to depth view...');
    if (!page.url().includes('depth-view')) {
      await goto(page, CONFIG.url);
    } else {
      await wait(2000);
    }

    console.log('Step 4: Waiting for table to render...');
    await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });
    console.log('  Table found ✓');

    const timestamp = new Date().toISOString();
    const results = {
      timestamp,
      date: timestamp.split('T')[0],
      time_et: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
      spot: spot0dte?.spx || null,
      vix: spot0dte?.vix || null,
      em: spot0dte?.em || null,
      spot_source: schwabQuotes?.spot ? 'schwab' : '0dte',
      vwap: null,
      schwab_quotes: schwabQuotes ? {
        spot: schwabQuotes.spot,
        vix: schwabQuotes.vix,
        spot_change: schwabQuotes.spot_change,
        spot_pct_change: schwabQuotes.spot_pct_change,
        vix_change: schwabQuotes.vix_change,
        timestamp: schwabQuotes.spot_timestamp,
      } : null,
      data: {}
    };

    const aggregate = process.argv.includes('--aggregate');
    console.log('\nStep 5: Extracting data...');
    console.log(`  Strike range: ${CONFIG.strikeFloor}–${CONFIG.strikeCeil}${aggregate ? ' (AGGREGATE — summing all columns)' : ''}`);

    await switchToMetric(page, 'GEX');
    results.data.gex = await extractTable(page, 'GEX', true, aggregate);

    await switchToMetric(page, 'CEX');
    results.data.cex = await extractTable(page, 'CEX', true, aggregate);

    await switchToMetric(page, 'DEX');
    results.data.dex = await extractTable(page, 'DEX', true, aggregate);

    await switchToMetric(page, 'VEX');
    results.data.vex = await extractTable(page, 'VEX', true, aggregate);

    await switchToMetric(page, 'POSITION');
    results.data.position = await extractTable(page, 'NET_POSITION', true, aggregate);

    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(results, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('DATA READY');
    console.log('='.repeat(50));
    console.log('Time (ET): ' + results.time_et);
    console.log('Spot:      ' + (results.spot ? results.spot : 'add manually'));
    console.log('VIX:       ' + (results.vix ? results.vix : 'add manually'));
    console.log('EM:        ' + (results.em ? results.em : 'add manually'));
    if (results.spot && results.em) {
      const emLow = (results.spot - results.em).toFixed(0);
      const emHigh = (results.spot + results.em).toFixed(0);
      console.log('EM Range:  ' + emLow + ' – ' + emHigh);
    }
    console.log('VWAP:      add manually\n');

    console.log('GEX:\nStrike\tGEX');
    results.data.gex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nCEX ($M/5min):\nStrike\tCEX');
    results.data.cex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nDEX:\nStrike\tDEX');
    results.data.dex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nVEX ($M/1% IV):\nStrike\tVEX');
    results.data.vex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nNet Position:\nStrike\tNet');
    results.data.position.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nDone.\n');

  } catch (err) {
    console.error('\nError: ' + err.message);
    if (err.message.includes('user data directory is already in use')) {
      console.error('\nFix: Close all Chrome windows and try again.');
      console.error('Or use a different profile: set CHROME_PROFILE=Profile\\ 1 in scripts/.env\n');
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
