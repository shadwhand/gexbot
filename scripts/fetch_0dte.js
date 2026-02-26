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

async function readTooltipAt(page, canvasInfo, pct) {
  const x = canvasInfo.x + canvasInfo.width * pct;
  const y = canvasInfo.y + canvasInfo.height * 0.5;
  await page.mouse.move(x, y);
  await wait(500);
  return readTooltip(page);
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

    // Set interval to 30 seconds — fewer data points means the chart fills
    // more of the canvas, so the latest data is closer to the right edge.
    // Radio button: name="intervals", value="30"
    const intervalSet = await page.evaluate(() => {
      const radios = document.querySelectorAll('input[type="radio"][name="intervals"]');
      for (const r of radios) {
        if (r.value === '30') { r.click(); return true; }
      }
      return false;
    });
    if (intervalSet) {
      console.log('  Set interval to 30s');
      await wait(3000); // chart re-renders with new interval
    }

    // Find the main chart canvas (widest one)
    const ci = await page.evaluate(() => {
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

    if (!ci) {
      console.log('  No chart canvas found');
      return { data: { spx: null, em: null, vix: null }, browser, page };
    }

    // Chart uses wheel for zoom, not pan. Don't try to scroll.
    // Instead, binary search for the rightmost data point on the canvas.
    // During live trading, data stops at the current time (e.g., 2 PM = ~69%).
    // On historical dates, data fills to ~98%.
    const y = ci.y + ci.height * 0.5;
    let data = { spx: null, em: null, vix: null };
    let bestData = null;
    let bestPct = 0;

    // Phase 1: Coarse sweep from right to find the rightmost region with data.
    // During live trading, data ends at ~current_time/market_hours (e.g., 69% at 2 PM).
    // On historical dates, data fills to ~99%.
    console.log('  Searching for latest data point...');
    for (const pct of [0.995, 0.98, 0.95, 0.90, 0.85, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30]) {
      const x = ci.x + ci.width * pct;
      await page.mouse.move(x, y);
      await wait(500);
      data = await readTooltip(page);
      if (data.spx) {
        bestData = { ...data };
        bestPct = pct;
        console.log('  Coarse hit at ' + (pct * 100).toFixed(1) + '% — SPX=' + data.spx);
        break;
      }
    }

    if (!bestData) {
      console.log('  No data found on chart');
      return { data: { spx: null, em: null, vix: null }, browser, page };
    }

    // Phase 2: Walk rightward from the coarse hit in small steps to find the edge.
    // Each step = 0.5% of canvas width (~6-7 pixels). Track the last known data point.
    let lo = bestPct;
    let hi = 0.999;
    let hitEdge = false;

    for (let p = bestPct + 0.005; p <= 0.999; p += 0.005) {
      const x = ci.x + ci.width * p;
      await page.mouse.move(x, y);
      await wait(300);
      const d = await readTooltip(page);
      if (d.spx) {
        lo = p;
        bestData = { ...d };
        bestPct = p;
      } else {
        hi = p;
        hitEdge = true;
        break;
      }
    }

    // Phase 3: If we found the edge (data→no data boundary), binary search for precision.
    // Each iteration halves the gap — 8 iterations = ~0.002% resolution (~0.03 pixels).
    if (hitEdge) {
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const x = ci.x + ci.width * mid;
        await page.mouse.move(x, y);
        await wait(250);
        const d = await readTooltip(page);
        if (d.spx) {
          lo = mid;
          bestData = { ...d };
          bestPct = mid;
        } else {
          hi = mid;
        }
      }
    }

    console.log('  Latest data at ' + (bestPct * 100).toFixed(1) + '% — SPX=' + bestData.spx);
    data = bestData;

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
