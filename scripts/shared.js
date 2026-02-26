/**
 * Shared utilities for SPX scrapers
 */
const fs = require('fs');
const path = require('path');

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

function launchOptions(profileDir) {
  const chromePath = findChrome();
  const opts = {
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--new-window',
      '--disable-blink-features=AutomationControlled',
      '--user-data-dir=' + profileDir,
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  if (chromePath) opts.executablePath = chromePath;
  return opts;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function goto(page, url, timeout = 30000) {
  console.log('  Navigating to: ' + url);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  } catch (e) {
    console.log('  (navigation timeout — continuing anyway)');
  }
  await wait(3000);
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

function nowET() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function isMarketHours(now) {
  const day = now.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 570 && minutes < 960; // 9:30 AM to 4:00 PM
}

function formatTimeET(date) {
  return date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
}

function snapshotDir(baseDir) {
  const now = nowET();
  const dateStr = now.toISOString().split('T')[0];
  const dir = path.join(baseDir, 'data', 'snapshots', dateStr);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  findChrome,
  launchOptions,
  wait,
  goto,
  clickSelector,
  nowET,
  isMarketHours,
  formatTimeET,
  snapshotDir,
};
