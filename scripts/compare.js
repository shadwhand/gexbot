#!/usr/bin/env node
/**
 * Compare current latest_data.json against a previous snapshot.
 * Usage: node scripts/compare.js [prev-snapshot-path] [--spot X]
 *
 * If no snapshot path given, uses the most recent snapshot for today.
 * Spot defaults to value from latest 0dte fetch or snapshot.
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, '..');
const LATEST = path.join(BASE_DIR, 'latest_data.json');
const SNAP_DIR = path.join(BASE_DIR, 'data', 'snapshots');

// Parse args
let prevPath = null;
let spotOverride = null;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--spot' && args[i + 1]) {
    spotOverride = parseFloat(args[++i]);
  } else if (!prevPath) {
    prevPath = args[i];
  }
}

// Find most recent snapshot if none given
if (!prevPath) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayDir = path.join(SNAP_DIR, today);
  if (fs.existsSync(todayDir)) {
    const files = fs.readdirSync(todayDir).filter(f => f.endsWith('.json')).sort();
    if (files.length >= 2) {
      prevPath = path.join(todayDir, files[files.length - 2]); // second-to-last
    } else if (files.length === 1) {
      prevPath = path.join(todayDir, files[0]);
    }
  }
  if (!prevPath) {
    console.error('No previous snapshot found.');
    process.exit(1);
  }
}

const now = JSON.parse(fs.readFileSync(LATEST, 'utf8'));
const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
const spot = spotOverride || now.spot_0dte || prev.spot || 6879;
const range = [spot - 55, spot + 55];

function getMap(data, key) {
  const m = {};
  if (data.data && data.data[key] && data.data[key].rows) {
    data.data[key].rows.forEach(r => {
      if (r.strike >= range[0] && r.strike <= range[1])
        m[r.strike] = parseFloat(r.value);
    });
  }
  return m;
}

const metrics = ['gex', 'cex', 'dex', 'vex', 'position', 'position_calls', 'position_puts'];
const nowM = {}, prevM = {};
metrics.forEach(k => { nowM[k] = getMap(now, k); prevM[k] = getMap(prev, k); });

const strikes = [...new Set([
  ...Object.keys(nowM.gex), ...Object.keys(prevM.gex)
])].map(Number).filter(s => s >= range[0] && s <= range[1]).sort((a, b) => a - b);

// Header
const prevName = path.basename(prevPath, '.json');
console.log(`Spot: ${spot} | vs ${prevName} | Range: ${range[0].toFixed(0)}-${range[1].toFixed(0)}`);
console.log('');

// Key levels table (significant strikes only)
console.log('Strike | GEX now(prev) | CEX now(prev) | DEX    | Pos now(prev)');
console.log('-------|---------------|---------------|--------|-------------');
strikes.forEach(s => {
  const gN = nowM.gex[s] || 0, gP = prevM.gex[s] || 0;
  const cN = nowM.cex[s] || 0, cP = prevM.cex[s] || 0;
  const dN = nowM.dex[s] || 0;
  const pN = nowM.position[s] || 0, pP = prevM.position[s] || 0;
  if (Math.abs(gN) > 1.5 || Math.abs(cN) > 1.5 || Math.abs(gN - gP) > 1.5 || Math.abs(cN - cP) > 1.5) {
    const gDelta = gN - gP, cDelta = cN - cP;
    const gArrow = Math.abs(gDelta) > 1 ? (gDelta > 0 ? '↑' : '↓') : ' ';
    const cArrow = Math.abs(cDelta) > 1 ? (cDelta > 0 ? '↑' : '↓') : ' ';
    console.log(
      `${s} | ${gN.toFixed(1).padStart(6)}(${gP.toFixed(1).padStart(5)})${gArrow}| ` +
      `${cN.toFixed(1).padStart(6)}(${cP.toFixed(1).padStart(5)})${cArrow}| ` +
      `${dN.toFixed(0).padStart(6)} | ${pN.toString().padStart(6)}(${pP.toString().padStart(5)})`
    );
  }
});

// Net GEX
let netGex = 0;
Object.values(nowM.gex).forEach(v => netGex += v);
console.log(`\nNet GEX (±55): ${netGex.toFixed(1)}`);

// CEX velocity summary (flips and big movers)
console.log('\n--- CEX Velocity ---');
strikes.forEach(s => {
  const cN = nowM.cex[s] || 0, cP = prevM.cex[s] || 0;
  const delta = cN - cP;
  if (Math.abs(delta) < 1.5) return;
  const flipped = (cN > 0 && cP < 0) || (cN < 0 && cP > 0);
  const label = flipped ? 'FLIPPED' : (Math.abs(cN) > Math.abs(cP) * 2 ? 'GROWING' : delta > 0 ? 'growing' : 'shrinking');
  console.log(`${s}: ${cP.toFixed(1)} → ${cN.toFixed(1)} (${label})`);
});

// GEX wall integrity (walls > 3 in either snapshot)
console.log('\n--- GEX Wall Integrity ---');
strikes.forEach(s => {
  const gN = nowM.gex[s] || 0, gP = prevM.gex[s] || 0;
  if (gN <= 3 && gP <= 3) return;
  const pct = gP !== 0 ? ((gN - gP) / Math.abs(gP) * 100).toFixed(0) : 'new';
  const label = gN > gP * 1.1 ? 'STRENGTHENING' : gN < gP * 0.75 ? 'WEAKENING' : gN < gP * 0.5 ? 'CRUMBLING' : 'holding';
  console.log(`${s}: ${gP.toFixed(1)} → ${gN.toFixed(1)} (${pct}% — ${label})`);
});
