#!/usr/bin/env node
/**
 * SPX Options Depth Scraper
 */

require('dotenv').config({ path: __dirname + '/.env' });
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

function launchOptions() {
  const opts = {
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--new-window',
      '--disable-blink-features=AutomationControlled',
      '--user-data-dir=' + CONFIG.chromeProfilePath,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (CONFIG.chromePath) opts.executablePath = CONFIG.chromePath;
  return opts;
}

const EXTRACT_TABLE = (label, strikeFloor, colIdx) => `
  (() => {
    const rows = Array.from(document.querySelectorAll('tr[data-index]'));
    const data = rows.map(row => {
      const cells = row.querySelectorAll('td');
      const strike = cells[0]?.textContent.trim();
      const col = cells[${colIdx}]?.querySelector('div')?.textContent.trim()
                || cells[${colIdx}]?.textContent.trim();
      return { strike: parseInt(strike), value: col };
    }).filter(r => r.strike && r.strike >= ${strikeFloor} && r.value);
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
  return clickSelector(page, [
    `p:nth-of-type(${pickerIndex}) > svg`,
    `div._depthViewWrapper_l6crd_81 p:nth-of-type(${pickerIndex}) > svg`,
  ]);
}

async function selectMetric(page, metricId) {
  const clicked = await clickSelector(page, [
    `#${metricId.replace(/ /g, '\\\ ')}`,
    `[aria-label="${metricId}"]`,
  ]);
  if (!clicked) {
    // Try clicking by visible text content as fallback
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
  const typeMap = { ALL: 'A', C: 'C', P: 'P' };
  const letter = typeMap[type] || type;
  const idVariants = [
    '#' + letter + '-depth-view-options-metrics-chartId-null',
    '#' + letter + '-Depth\\ View-metrics-chartId-null',
  ];
  let clicked = await clickSelector(page, idVariants);
  if (!clicked) {
    const labels = type === 'ALL' ? ['All', 'A'] : type === 'C' ? ['Calls', 'C'] : ['Puts', 'P'];
    clicked = await page.evaluate((lbls) => {
      const els = Array.from(document.querySelectorAll('button, span, div, p'));
      for (const lbl of lbls) {
        for (const el of els) {
          const text = el.textContent.trim();
          if (text === lbl && el.children.length === 0 && el.offsetParent !== null) {
            el.click();
            return true;
          }
        }
      }
      return false;
    }, labels);
  }
  if (!clicked) {
    const nearby = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"]'));
      return els.slice(0, 20).map(e => ({ id: e.id, text: e.textContent.trim().substring(0, 20), tag: e.tagName }));
    });
    console.log('  WARNING: Could not click position type filter');
    console.log('  Available buttons:', JSON.stringify(nearby, null, 2));
  }
  await wait(2000);
}


async function extractTable(page, label) {
  await page.waitForSelector('tr[data-index]', { timeout: CONFIG.timeout });
  const result = await page.evaluate(EXTRACT_TABLE(label, CONFIG.strikeFloor, CONFIG.columnIndex));
  console.log('  Extracted ' + result.rows.length + ' rows');
  return result;
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

async function main() {
  console.log('\n SPX Options Depth Scraper');
  console.log(' ' + '-'.repeat(40) + '\n');

  if (CONFIG.chromePath) console.log('Chrome:  ' + CONFIG.chromePath);
  console.log('Profile: ' + CONFIG.chromeProfilePath + '\n');

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
    console.log('  Table found');

    const spot = await getSpotPrice(page);
    console.log('Spot: ' + (spot || 'not detected'));

    const timestamp = new Date().toISOString();
    const results = {
      timestamp,
      date: timestamp.split('T')[0],
      time_et: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false }),
      spot: spot ? parseFloat(spot) : null,
      vwap: null,
      data: {}
    };

    console.log('\nStep 5: Extracting data...');

    await switchToMetric(page, 'GEX');
    await setPositionType(page, 'ALL');
    results.data.gex = await extractTable(page, 'GEX');

    await switchToMetric(page, 'CEX');
    await setPositionType(page, 'ALL');
    results.data.cex = await extractTable(page, 'CEX');

    await switchToMetric(page, 'DEX');
    await setPositionType(page, 'ALL');
    results.data.dex = await extractTable(page, 'DEX');

    await switchToMetric(page, 'VEX');
    await setPositionType(page, 'ALL');
    results.data.vex = await extractTable(page, 'VEX');

    await switchToMetric(page, 'POSITION');
    await setPositionType(page, 'ALL');
    results.data.position = await extractTable(page, 'NET_POSITION');


    fs.writeFileSync(CONFIG.outputPath, JSON.stringify(results, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('DATA READY');
    console.log('='.repeat(50));
    console.log('Time (ET): ' + results.time_et);
    console.log('Spot:      ' + (spot || 'add manually'));
    console.log('VWAP:      add manually\n');

    console.log('GEX:\nStrike\tGEX');
    results.data.gex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nCEX ($M/5min):\nStrike\tCEX');
    results.data.cex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nDEX:\nStrike\tDEX');
    results.data.dex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nVEX ($M/1% IV):\nStrike\tVEX');
    results.data.vex.rows.forEach(r => console.log(r.strike + '\t' + r.value));

    console.log('\nNet Position:\nStrike\tPosition');
    results.data.position.rows.forEach(r => console.log(r.strike + '\t' + r.value));


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
}

main();
