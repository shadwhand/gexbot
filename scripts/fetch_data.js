#!/usr/bin/env node
/**
 * SPX Options Depth Scraper
 */

require('dotenv').config({ path: __dirname + '/.env' });
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { findChrome, launchOptions, wait, goto, clickSelector } = require('./shared');

const CONFIG = {
  url: 'https://app.optionsdepth.com/depth-view?tab=table',
  loginUrl: 'https://app.optionsdepth.com',
  email: process.env.OD_EMAIL,
  password: process.env.OD_PASSWORD,
  loginMethod: process.env.LOGIN_METHOD || 'google',
  outputPath: process.env.OUTPUT_PATH || path.join(__dirname, '../latest_data.json'),
  strikeFloor: parseInt(process.env.STRIKE_FLOOR || '5500'),
  columnIndex: parseInt(process.env.COLUMN_INDEX || '1'),
  timeout: 30000,
  chromePath: findChrome(),
  chromeProfilePath: process.env.CHROME_PROFILE_PATH || path.join(__dirname, '..', '.chrome-scraper-profile'),
};

const EXTRACT_VISIBLE_ROWS = (strikeFloor, colIdx) => `
  (() => {
    const rows = Array.from(document.querySelectorAll('tr[data-index]'));
    return rows.map(row => {
      const cells = row.querySelectorAll('td');
      const strike = cells[0]?.textContent.trim();
      const col = cells[${colIdx}]?.querySelector('div')?.textContent.trim()
                || cells[${colIdx}]?.textContent.trim();
      return { strike: parseInt(strike), value: col };
    }).filter(r => r.strike && r.strike >= ${strikeFloor} && r.value);
  })()
`;

// Extract ALL columns for each row (strike + every expiry column)
const EXTRACT_ALL_COLUMNS = (strikeFloor) => `
  (() => {
    const rows = Array.from(document.querySelectorAll('tr[data-index]'));
    return rows.map(row => {
      const cells = row.querySelectorAll('td');
      const strike = cells[0]?.textContent.trim();
      const values = {};
      for (let i = 1; i < cells.length; i++) {
        const val = cells[i]?.querySelector('div')?.textContent.trim()
                  || cells[i]?.textContent.trim();
        if (val) values[i] = val;
      }
      return { strike: parseInt(strike), values };
    }).filter(r => r.strike && r.strike >= ${strikeFloor});
  })()
`;

// Read table column headers (expiry dates / labels)
const EXTRACT_HEADERS = () => `
  (() => {
    const headerRow = document.querySelector('thead tr') || document.querySelector('tr');
    if (!headerRow) return {};
    const cells = headerRow.querySelectorAll('th, td');
    const headers = {};
    for (let i = 1; i < cells.length; i++) {
      const text = cells[i]?.textContent.trim();
      if (text) headers[i] = text;
    }
    return headers;
  })()
`;

async function ensureLoggedIn(page) {
  console.log('Step 1: Opening optionsdepth...');
  await goto(page, CONFIG.loginUrl, CONFIG.timeout);

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
    console.log('  Already logged in');
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
  console.log('  Login complete');
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
  console.log('  Login complete');
}

async function openColumnPicker(page, pickerIndex = 1) {
  const clicked = await clickSelector(page, [
    `p:nth-of-type(${pickerIndex}) > svg`,
    `p:nth-of-type(${pickerIndex}) > span`,
    `p:nth-of-type(${pickerIndex})`,
    `div._depthViewWrapper_l6crd_81 p:nth-of-type(${pickerIndex}) > svg`,
    `div._depthViewWrapper_l6crd_81 p:nth-of-type(${pickerIndex})`,
  ]);
  if (!clicked) console.log('  WARNING: Could not open picker ' + pickerIndex);
  return clicked;
}

async function selectMetric(page, metricId) {
  const clicked = await clickSelector(page, [
    `#${metricId.replace(/ /g, '\\\ ')}`,
    `[aria-label="${metricId}"]`,
  ]);
  if (!clicked) {
    let shortName = metricId.split('-')[0];
    if (shortName === 'NET_POSITION') shortName = 'Net Position';
    const textClicked = await page.evaluate((name) => {
      const els = Array.from(document.querySelectorAll('div, span, label, li, button, p'));
      for (const el of els) {
        const text = el.textContent.trim();
        if (text.startsWith(name) && el.children.length === 0) {
          el.click();
          return true;
        }
      }
      return false;
    }, shortName);
    if (textClicked) {
      await wait(500);
      return true;
    }
    const items = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('[id], [role="option"], [role="menuitem"], li'));
      return els.slice(0, 50).map(e => ({ id: e.id, text: e.textContent.trim().substring(0, 40), tag: e.tagName }));
    });
    console.log('  WARNING: Could not find metric "' + metricId + '"');
    console.log('  Available items:', JSON.stringify(items.filter(i => i.id || i.text), null, 2));
  }
  return clicked;
}

async function clickApply(page) {
  await clickSelector(page, [
    'div._applyButtonWrapper_1flww_44 > button',
    '[aria-label="Apply"]',
  ]);
  await wait(1500);
}

const METRIC_IDS = {
  GEX:      'GEX-Depth View-metrics-chartId-null',
  CEX:      'CEX-Depth View-metrics-chartId-null',
  DEX:      'DEX-Depth View-metrics-chartId-null',
  VEX:      'VEX-Depth View-metrics-chartId-null',
  POSITION: 'NET_POSITION-Depth View-metrics-chartId-null',
};

async function switchToMetric(page, metric) {
  process.stdout.write('  Switching to ' + metric + '... ');
  await openColumnPicker(page, 1);
  await selectMetric(page, METRIC_IDS[metric]);
  await clickApply(page);
  console.log('done');
}

async function setPositionType(page, type = 'ALL') {
  process.stdout.write('  Setting position filter to ' + type + '... ');
  const typeMap = { ALL: 'A', C: 'C', P: 'P' };
  const letter = typeMap[type] || type;

  // Open the "C & P" picker by clicking its <p> element directly
  await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('p'));
    const cp = ps.find(p => p.textContent.trim() === 'C & P');
    if (cp) cp.click();
  });
  await wait(1000);

  // Verify picker 2 opened by checking for its radio buttons (capitalized IDs)
  let hasDropdown = await page.evaluate(() =>
    !!document.querySelector('[id="A-Depth View-metrics-chartId-null"]')?.offsetParent
  );

  // Retry if dropdown didn't open
  if (!hasDropdown) {
    await openColumnPicker(page, 2);
    await wait(1000);
    hasDropdown = await page.evaluate(() =>
      !!document.querySelector('[id="A-Depth View-metrics-chartId-null"]')?.offsetParent
    );
  }

  if (!hasDropdown) {
    console.log('WARNING: picker 2 dropdown did not open');
  }

  // Click the target radio button
  let clicked = await clickSelector(page, [
    `[id="${letter}-Depth View-metrics-chartId-null"]`,
  ]);
  if (!clicked) {
    // Fallback: click by visible text within the open dropdown
    const labels = type === 'ALL' ? ['All'] : type === 'C' ? ['Calls'] : ['Puts'];
    clicked = await page.evaluate((lbls, ltr) => {
      // Target only buttons with aria-checked (radio-style) to avoid clicking random text
      const btns = Array.from(document.querySelectorAll('button[aria-checked]'));
      for (const lbl of lbls) {
        for (const btn of btns) {
          if (btn.textContent.trim() === lbl && btn.id.startsWith(ltr + '-') && btn.offsetParent) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    }, labels, letter);
  }
  if (!clicked) {
    console.log('WARNING: Could not select position type "' + type + '"');
  }

  await clickApply(page);
  console.log('done');
}

async function scrollToTop(page) {
  await page.evaluate(() => {
    let el = document.querySelector('tr[data-index]');
    while (el) {
      el = el.parentElement;
      if (el && el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 100) {
        el.scrollTop = 0;
        return;
      }
    }
  });
  await wait(300);
}

async function scrollDown(page) {
  await page.evaluate(() => {
    let el = document.querySelector('tr[data-index]');
    while (el) {
      el = el.parentElement;
      if (el && el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 100) {
        el.scrollTop += el.clientHeight * 0.8;
        return;
      }
    }
  });
  await wait(200);
}

async function extractTable(page, label) {
  await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });

  const allRows = new Map();
  const collectVisible = async () => {
    const rows = await page.evaluate(EXTRACT_VISIBLE_ROWS(CONFIG.strikeFloor, CONFIG.columnIndex));
    for (const row of rows) allRows.set(row.strike, row);
  };

  await scrollToTop(page);
  await collectVisible();

  let prevSize = 0;
  let staleCount = 0;
  while (staleCount < 3) {
    await scrollDown(page);
    await collectVisible();
    if (allRows.size === prevSize) staleCount++;
    else staleCount = 0;
    prevSize = allRows.size;
  }

  const rows = Array.from(allRows.values()).sort((a, b) => b.strike - a.strike);
  console.log('  Extracted ' + rows.length + ' rows');
  return { label, rows };
}

/**
 * Extract ALL columns for a metric in one scroll pass.
 * Returns { label, headers: { colIdx: "headerText" }, rows: [{ strike, values: { colIdx: val } }] }
 */
async function extractTableAllColumns(page, label) {
  await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });

  // Read column headers
  const headers = await page.evaluate(EXTRACT_HEADERS());

  const allRows = new Map();
  const collectVisible = async () => {
    const rows = await page.evaluate(EXTRACT_ALL_COLUMNS(CONFIG.strikeFloor));
    for (const row of rows) allRows.set(row.strike, row);
  };

  await scrollToTop(page);
  await collectVisible();

  let prevSize = 0;
  let staleCount = 0;
  while (staleCount < 3) {
    await scrollDown(page);
    await collectVisible();
    if (allRows.size === prevSize) staleCount++;
    else staleCount = 0;
    prevSize = allRows.size;
  }

  const rows = Array.from(allRows.values()).sort((a, b) => b.strike - a.strike);
  console.log('  Extracted ' + rows.length + ' rows × ' + Object.keys(headers).length + ' columns');
  return { label, headers, rows };
}

async function getSpotPrice(page) {
  try {
    return await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('span, div, p'))
        .find(e => {
          const t = e.textContent.trim();
          return /^\d{4,5}(\.\d{1,2})?$/.test(t) &&
                 parseInt(t) > 5000 && parseInt(t) < 12000 &&
                 e.children.length === 0;
        });
      return el ? el.textContent.trim() : null;
    });
  } catch (e) { return null; }
}

/**
 * Extract all optionsdepth data using an existing page.
 * Used by scheduler to avoid re-launching browser.
 * @param {object} page - Puppeteer page
 * @param {object} opts - { allColumns: bool } — if true, extract all expiry columns per metric
 */
async function extractAllData(page, opts = {}) {
  // Navigate to depth view if not already there
  if (!page.url().includes('depth-view')) {
    await goto(page, CONFIG.url, CONFIG.timeout);
  } else {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: CONFIG.timeout }).catch(() => {});
    await wait(3000);
  }

  await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });

  const spot = await getSpotPrice(page);
  console.log('  Spot: ' + (spot || 'not detected'));

  const extractFn = opts.allColumns ? extractTableAllColumns : extractTable;
  const data = {};

  await switchToMetric(page, 'GEX');
  data.gex = await extractFn(page, 'GEX');

  await switchToMetric(page, 'CEX');
  data.cex = await extractFn(page, 'CEX');

  await switchToMetric(page, 'DEX');
  data.dex = await extractFn(page, 'DEX');

  await switchToMetric(page, 'VEX');
  data.vex = await extractFn(page, 'VEX');

  // Position: extract net and puts, derive calls = net - puts
  await switchToMetric(page, 'POSITION');
  await setPositionType(page, 'ALL');
  data.position = await extractFn(page, 'NET_POSITION');

  await setPositionType(page, 'P');
  data.position_puts = await extractFn(page, 'POSITION_PUTS');

  // Derive calls = net - puts (use single-column for scheduler, multi-column for all-columns mode)
  if (opts.allColumns) {
    // Derive per-column: for each column index, calls = net - puts
    const headers = data.position.headers || {};
    data.position_calls = {
      label: 'POSITION_CALLS',
      headers,
      rows: data.position.rows.map(net => {
        const putRow = data.position_puts.rows.find(p => p.strike === net.strike);
        const derived = {};
        for (const colIdx of Object.keys(net.values || {})) {
          const netVal = parseFloat(net.values[colIdx]) || 0;
          const putVal = putRow?.values?.[colIdx] ? (parseFloat(putRow.values[colIdx]) || 0) : 0;
          derived[colIdx] = String(netVal - putVal);
        }
        return { strike: net.strike, values: derived };
      }),
    };
  } else {
    data.position_calls = {
      label: 'POSITION_CALLS',
      rows: data.position.rows.map(net => {
        const putRow = data.position_puts.rows.find(p => p.strike === net.strike);
        const netVal = parseFloat(net.value) || 0;
        const putVal = putRow ? (parseFloat(putRow.value) || 0) : 0;
        return { strike: net.strike, value: String(netVal - putVal) };
      }),
    };
  }
  console.log('  Derived ' + (data.position_calls.rows?.length || 0) + ' call position rows');

  // Reset filter back to ALL for clean state
  await setPositionType(page, 'ALL');

  return { spot: spot ? parseFloat(spot) : null, data };
}

// Export for scheduler
module.exports = { ensureLoggedIn, extractAllData, CONFIG };

// Print helpers for standalone output
function printSingleColumn(data) {
  const metrics = [
    ['GEX', 'gex'], ['CEX ($M/5min)', 'cex'], ['DEX', 'dex'],
    ['VEX ($M/1% IV)', 'vex'], ['Net Position (All)', 'position'],
    ['Position (Calls)', 'position_calls'], ['Position (Puts)', 'position_puts'],
  ];
  for (const [title, key] of metrics) {
    if (!data[key]) continue;
    console.log('\n' + title + ':\nStrike\t' + title.split(' ')[0]);
    data[key].rows.forEach(r => console.log(r.strike + '\t' + r.value));
  }
}

/**
 * Collapse multi-column data into aggregate (sum all expiries) per strike.
 * Returns a new data object with single-column rows (like the standard format)
 * plus an `aggregate` key with the summed values.
 */
function aggregateData(data, odteColIdx) {
  const result = {};
  const metricKeys = ['gex', 'cex', 'dex', 'vex', 'position', 'position_calls', 'position_puts'];

  for (const key of metricKeys) {
    if (!data[key] || !data[key].rows) continue;
    const headers = data[key].headers || {};
    const colIndices = Object.keys(headers).sort((a, b) => parseInt(a) - parseInt(b));

    // 0DTE column: the specific expiry for tomorrow
    const odteRows = data[key].rows.map(r => ({
      strike: r.strike,
      value: r.values?.[odteColIdx] || '0',
    })).filter(r => parseFloat(r.value) !== 0 || key === 'position' || key === 'position_calls' || key === 'position_puts');

    // Aggregate: sum all columns
    const aggRows = data[key].rows.map(r => {
      let sum = 0;
      for (const ci of colIndices) {
        sum += parseFloat(r.values?.[ci] || '0') || 0;
      }
      return { strike: r.strike, value: String(Math.round(sum * 100) / 100) };
    });

    result[key] = { label: data[key].label, rows: odteRows };
    result[key + '_agg'] = { label: data[key].label + '_AGG', rows: aggRows };
  }

  // Include headers info for reference
  result._headers = data.gex?.headers || {};
  result._odteCol = odteColIdx;
  result._expiries = Object.values(data.gex?.headers || {});

  return result;
}

function printAggregate(aggData, odteLabel) {
  const metrics = [
    ['GEX', 'gex'], ['CEX', 'cex'], ['DEX', 'dex'],
    ['VEX', 'vex'], ['Net Position', 'position'],
    ['Position (Calls)', 'position_calls'], ['Position (Puts)', 'position_puts'],
  ];

  console.log('\nExpiries included: ' + (aggData._expiries || []).join(', '));

  for (const [title, key] of metrics) {
    const odte = aggData[key];
    const agg = aggData[key + '_agg'];
    if (!odte || !agg) continue;
    console.log('\n' + title + ':');
    console.log('Strike\t0DTE(' + odteLabel + ')\tAggregate');
    // Merge by strike
    const strikes = new Set([...odte.rows.map(r => r.strike), ...agg.rows.map(r => r.strike)]);
    const odteMap = Object.fromEntries(odte.rows.map(r => [r.strike, r.value]));
    const aggMap = Object.fromEntries(agg.rows.map(r => [r.strike, r.value]));
    for (const s of [...strikes].sort((a, b) => b - a)) {
      const o = odteMap[s] || '0';
      const a = aggMap[s] || '0';
      if (parseFloat(o) === 0 && parseFloat(a) === 0) continue;
      console.log(s + '\t' + o + '\t' + a);
    }
  }
}

// Standalone execution
// Usage: node fetch_data.js [--aggregate]
//   default:     pulls single 0DTE column (COLUMN_INDEX env var, default 1)
//   --aggregate: pulls all columns, outputs 0DTE + summed aggregate side by side
if (require.main === module) {
  const aggregate = process.argv.includes('--aggregate');

  (async () => {
    console.log('\n SPX Options Depth Scraper');
    console.log(' ' + '-'.repeat(40));
    if (aggregate) console.log(' Mode: aggregate (0DTE + all expiries summed)');
    console.log('');

    if (CONFIG.chromePath) console.log('Chrome:  ' + CONFIG.chromePath);
    console.log('Profile: ' + CONFIG.chromeProfilePath + '\n');

    const browser = await puppeteer.launch(launchOptions(CONFIG.chromeProfilePath));
    const page = await browser.newPage();
    page.setDefaultTimeout(CONFIG.timeout);

    try {
      await ensureLoggedIn(page);

      console.log('\nStep 3: Navigating to depth view...');
      const { spot, data } = await extractAllData(page, { allColumns: aggregate });

      const timestamp = new Date().toISOString();

      if (aggregate) {
        // Find tomorrow's column index from headers
        const headers = data.gex?.headers || {};
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD
        let odteColIdx = String(CONFIG.columnIndex);
        let odteLabel = headers[odteColIdx] || 'col' + odteColIdx;
        // Try to auto-detect tomorrow's column
        for (const [idx, hdr] of Object.entries(headers)) {
          if (hdr.startsWith(tomorrowStr)) {
            odteColIdx = idx;
            odteLabel = hdr;
            break;
          }
        }
        const aggData = aggregateData(data, odteColIdx);

        const results = {
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
          time_et: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
          spot,
          vwap: null,
          data: aggData,
        };

        fs.writeFileSync(CONFIG.outputPath, JSON.stringify(results, null, 2));

        console.log('\n' + '='.repeat(50));
        console.log('DATA READY (aggregate)');
        console.log('='.repeat(50));
        console.log('Time (ET): ' + results.time_et);
        console.log('Spot:      ' + (spot || 'add manually'));
        console.log('VWAP:      add manually');

        printAggregate(aggData, odteLabel);
      } else {
        const results = {
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().split('T')[0],
          time_et: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
          spot,
          vwap: null,
          data,
        };

        fs.writeFileSync(CONFIG.outputPath, JSON.stringify(results, null, 2));

        console.log('\n' + '='.repeat(50));
        console.log('DATA READY');
        console.log('='.repeat(50));
        console.log('Time (ET): ' + results.time_et);
        console.log('Spot:      ' + (spot || 'add manually'));
        console.log('VWAP:      add manually');

        printSingleColumn(data);
      }
      console.log('\nDone.\n');

    } catch (err) {
      console.error('\nError: ' + err.message);
      if (err.message.includes('user data directory is already in use')) {
        console.error('\nFix: Close all Chrome windows and try again.');
        console.error('Or set CHROME_PROFILE_PATH to a different directory in scripts/.env\n');
      }
      process.exit(1);
    } finally {
      await browser.close();
    }
  })();
}
