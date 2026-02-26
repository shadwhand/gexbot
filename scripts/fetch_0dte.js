#!/usr/bin/env node
/**
 * 0dtespx.com Scraper — extracts SPX spot, VIX, and Expected Move
 *
 * Hovers over the rightmost point of the main chart canvas to trigger
 * the tooltip, then reads SPX/EM/VIX from the tooltip DOM.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const { launchOptions, wait, goto } = require('./shared');

const PROFILE_DIR = path.join(__dirname, '..', '.0dte-scraper-profile');
const BASE_URL = 'https://0dtespx.com/';
const TIMEOUT = 45000;

function buildUrl(date) {
  if (date) return BASE_URL + '?date=' + date;
  return BASE_URL;
}

async function readTooltip(page) {
  return page.evaluate(() => {
    const result = { spx: null, em: null, vix: null };
    const tooltip = document.querySelector('[class*="tooltip"]');
    if (!tooltip || !tooltip.textContent.trim()) return result;

    const text = tooltip.textContent;
    const spxMatch = text.match(/SPX:\s*([\d.]+)/);
    const emMatch = text.match(/SPX EM:\s*([\d.]+)/);
    const vixMatch = text.match(/VIX:\s*([\d.]+)/);

    if (spxMatch) result.spx = parseFloat(spxMatch[1]);
    if (emMatch) result.em = parseFloat(emMatch[1]);
    if (vixMatch) result.vix = parseFloat(vixMatch[1]);
    return result;
  });
}

async function fetch0dte(existingPage, date) {
  let browser = null;
  let page = existingPage;

  try {
    if (!page) {
      console.log('Launching browser for 0dtespx.com...');
      browser = await puppeteer.launch(launchOptions(PROFILE_DIR));
      page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      page.setDefaultTimeout(TIMEOUT);
    }

    const url = buildUrl(date);
    await goto(page, url, TIMEOUT);
    await wait(8000); // SvelteKit render + chart data load

    // Scroll the browser window fully to the right so latest data is visible
    // Use End key and arrow keys to ensure the page scrolls horizontally
    await page.keyboard.press('End');
    await wait(500);
    // Scroll right repeatedly with arrow keys
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await wait(500);
    // Also try JS scroll as backup
    await page.evaluate(() => {
      window.scrollTo(document.documentElement.scrollWidth, window.scrollY);
    });
    await wait(2000); // let scroll settle and chart re-render

    // Find the main chart canvas (widest one)
    const canvasInfo = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('canvas'));
      let best = null;
      let bestWidth = 0;
      all.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        if (rect.width > bestWidth && rect.height > 100) {
          bestWidth = rect.width;
          best = { index: i, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
      });
      return best;
    });

    if (!canvasInfo) {
      console.log('  No chart canvas found');
      return { data: { spx: null, em: null, vix: null }, browser, page };
    }

    // Sweep from right edge inward to find the latest data point.
    // Historical dates fill the chart; live data stops near the middle.
    // Use fine-grained sweep near the right edge for most recent data.
    const y = canvasInfo.y + canvasInfo.height * 0.5;
    let data = { spx: null, em: null, vix: null };
    let bestData = null;
    let bestPct = 0;

    // First pass: find rightmost data point with fine granularity
    for (const pct of [0.99, 0.98, 0.97, 0.96, 0.95, 0.93, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40]) {
      const x = canvasInfo.x + canvasInfo.width * pct;
      await page.mouse.move(x, y);
      await wait(600);
      data = await readTooltip(page);
      if (data.spx) {
        if (!bestData) {
          bestData = { ...data };
          bestPct = pct;
          console.log('  Found data at ' + Math.round(pct * 100) + '% (' + Math.round(x) + ', ' + Math.round(y) + ')');
        }
        break;
      }
    }

    // If found, do a fine sweep rightward from that point to get the absolute latest
    if (bestData && bestPct < 0.99) {
      for (const offset of [0.01, 0.005, 0.002]) {
        const finePct = bestPct + offset;
        if (finePct > 1.0) continue;
        const x = canvasInfo.x + canvasInfo.width * finePct;
        await page.mouse.move(x, y);
        await wait(400);
        const fineData = await readTooltip(page);
        if (fineData.spx && fineData.spx !== bestData.spx) {
          bestData = { ...fineData };
          console.log('  Refined to ' + Math.round(finePct * 100) + '% — SPX=' + fineData.spx);
        }
      }
    }

    data = bestData || data;

    console.log('  SPX=' + (data.spx || '?') + ' EM=' + (data.em || '?') + ' VIX=' + (data.vix || '?'));
    return { data, browser, page };

  } catch (err) {
    console.error('0dte fetch error:', err.message);
    return { data: { spx: null, em: null, vix: null }, browser, page };
  }
}

// Export for scheduler use
module.exports = { fetch0dte, PROFILE_DIR };

// Standalone execution
if (require.main === module) {
  const dateArg = process.argv[2] || null;

  (async () => {
    console.log('\n 0DTE SPX Scraper');
    console.log(' ' + '-'.repeat(40));
    if (dateArg) console.log(' Date: ' + dateArg);
    console.log('');

    const { data, browser } = await fetch0dte(null, dateArg);

    console.log('\n' + '='.repeat(40));
    console.log('RESULTS');
    console.log('='.repeat(40));
    console.log('SPX Spot: ' + (data.spx || 'not found'));
    console.log('VIX:      ' + (data.vix || 'not found'));
    console.log('EM:       ' + (data.em || 'not found'));
    console.log('');

    if (browser) await browser.close();
    process.exit(0);
  })();
}
