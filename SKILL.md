---
name: spx-gex-analyzer
description: Use when analyzing SPX with auto-fetching from optionsdepth.com. Generates directional bias calls using GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move data. Use /spx-gex-analyzer or /analyze with no data to auto-fetch.
---

# SPX Directional Indicator v2.5

## Data Files
- **predictions.json:** `data/predictions.json`
- **retrospectives.md:** `data/retrospectives.md`
- **strategies.md:** `data/strategies.md`
- **meic.md:** `data/meic.md`
- **Reference docs:** `reference/` dir (concepts, examples, lessons) — read on-demand

## Auto-Fetch
```bash
npm run fetch
```
Outputs GEX/CEX/DEX/VEX/Net Position to `latest_data.json` + stdout. Strikes ±100 of spot (floor adjustable via `STRIKE_FLOOR` env var in `scripts/.env`). VWAP and call positioning must be provided manually. Derive puts as `Net - Calls`.

Setup: `npm install && cp scripts/.env.example scripts/.env` (edit with optionsdepth creds).

---

## Sign Conventions (CRITICAL)

| Signal | Positive | Negative |
|--------|----------|----------|
| GEX | Wall/pin/dampener (dealers long gamma) | Amplifier/accelerant (dealers short gamma) |
| CEX | **SUPPRESSIVE** — dealers passively sell | **SUPPORTIVE** — dealers passively buy |
| DEX | Dealers long delta (may sell rallies) | Dealers short delta (may buy rallies) |
| VEX | Vol up→dealers sell, Vol down→dealers buy | Vol up→dealers buy, Vol down→dealers sell |
| Positioning | MMs long (customers sold) | MMs short (customers bought) |

CEX scales ~2x in final 30 min. VEX only matters when VIX intraday range >1.5 pts.

## Directional Language

Describe strikes relative to the number line. 6895 is below 6900. Price falling from 6920 hits 6900 first, then 6895. List levels in order of encounter from spot.

---

## Analytical Steps

### 1. GEX Regime
Sum all GEX. Net >+5K = mean-reverting. Net <-5K = trending. ±5K = mixed (use CEX as tiebreaker).

### 2. Key GEX Levels
Within ±50 pts of spot: largest positive (walls), largest negative (amplifiers), nearest positive above (resistance) and below (support).

**Wall Decay (updates):** 0-25% loss = holding. 25-50% = weakening. 50%+ = crumbling — don't rely on it.

### 3. CEX Flows
Within ±50 pts: largest positive (sell zones), largest negative (buy zones).

**Reinforcing:** +GEX + -CEX = strong support. -GEX + +CEX = strong resistance.
**Conflicting:** +GEX + +CEX = wall with charm selling. -GEX + -CEX = amplifier with support underneath.

**3b. CEX Velocity (updates):** Track growing (strengthening), shrinking (consumed), flipped (critical), migrating (new target).

**3c. Spent Magnets:** After price trades through a CEX magnet, expect it to weaken/flip/migrate. Scan for where CEX re-materializes.

**3d. CEX Path:** Sum +CEX (sell barrier) between spot and bullish target. If barrier > support at target, target unlikely without catalyst.

**3e. DEX:** Net DEX = hedging baseline. -DEX + -GEX at same strike = maximum danger zone.

**3f. VEX (need VIX):** Net +VEX + VIX rising = selling pressure. Net +VEX + VIX falling = buying ("vanna rally"). Per-strike: frame within macro direction — don't call support cushions "bullish breakout triggers." VIX range <1.5 = low impact, 1.5-3 = moderate, >3 = primary signal. See `reference/concepts.md` for full VEX theory.

**3g. Positioning:** Derive puts = Net - Calls. All MM perspective. Find **hedge line** (largest MM short puts near spot). Classify profile: hedged long / bearish hedge / speculative long / short squeeze setup. See `reference/concepts.md` for positioning profiles + Greeks integration.

### 4. VWAP
Gap = VWAP - spot. Positive = upside bias. Negative = downside bias. -CEX near VWAP = strong support anchor. +CEX near VWAP = resistance.

**EM Check:** Targets within EM = standard. Beyond EM = reduce confidence by 1 unless 3+ signals aligned.

### 5. Time-of-Day Weighting

| Time Left | CEX Wt | GEX Wt |
|-----------|--------|--------|
| >3h | 0.40 | 0.60 |
| 2-3h | 0.55 | 0.45 |
| 1-2h | 0.70 | 0.30 |
| <1h | 0.85 | 0.15 |
| <30m | 0.95 | 0.05 |

### 6. Synthesize Call

**Bull:** -CEX above spot stronger than +CEX above. Net -GEX. VWAP above. CEX path clear. Spot above hedge line.
**Bear:** +CEX above dominant. Net -GEX with downward momentum. VWAP below. Spot at/below hedge line. Short put squeeze fuel below.
**Neutral:** Sandwiched between +CEX above and -CEX below. Net +GEX. VWAP near spot. Path blocked both ways.

### 7. Target + Stop
**Target:** Bull = spot to nearest +CEX ceiling / -GEX amplifier above. Bear = spot to nearest -CEX floor / +GEX wall below. Width reflects regime. Validate vs EM.
**Stop:** Bull = nearest -GEX + +CEX confluence below. Bear = nearest +GEX + -CEX confluence above.

### 8. Confidence (1-5)
+1 each: GEX regime aligned, CEX dominant aligned, VWAP aligned, GEX+CEX confluence, time-of-day supports primary signal.
Adjustments: -1 beyond EM, -1 CEX barrier > magnet, -1 single snapshot, +1 DEX+VEX confirm, +1 positioning confirms, -1 VEX conflicts + VIX >3pt range, -1 positioning conflicts.

### 9. Multi-Update Protocol
**Hold:** isolated CEX shift, wall <25% decay, price above stop, thesis intact.
**Revise:** CEX flip persists 2+ reads, spreads to adjacent strikes, wall 50%+ decay, stop hit.
**Reversal requires 2+ of:** persistent CEX flip, adjacent strike spread, broader structure shift, price confirmation.

---

## Output Format

```
═══════════════════════════════════════════
SPX DIRECTIONAL INDICATOR
[DATE] [TIME] | Spot: [XXXX] | VWAP: [XXXX] | [X]h [X]m remaining
═══════════════════════════════════════════

CALL: [BULL / BEAR / NEUTRAL]
Confidence: [X/5]

Target Range: [XXXX] – [XXXX]
Stop Level:   [XXXX]
VWAP Gap:     [+/- XX pts]
EM Range:     [XXXX] – [XXXX] (if provided)

─── KEY LEVELS ────────────────────────────
[Top 3-5 levels: strike, GEX, CEX, DEX, Positioning, role]

─── SIGNAL BREAKDOWN ──────────────────────
GEX Regime / CEX Dominant / CEX Path / DEX Tilt / VEX Signal / VWAP / Confluence / Time Weight

─── POSITIONING ───────────────────────────
Hedge Line / Profile / Call-Put Skew / Squeeze Risk / Upside Aspiration

─── CEX VELOCITY (updates only) ───────────
[Strike: prior → current (growing/shrinking/flipped)]

─── GEX WALL INTEGRITY (updates only) ─────
[Wall: prior → current (holding/weakening/crumbling)]

─── RATIONALE ─────────────────────────────
[2-4 sentences]

─── ADJUSTED WEIGHTS (if 5+ predictions) ──
[Signal: base → adjusted (hit rate%)]

Prediction ID: [short-id]
═══════════════════════════════════════════
```

## Feedback
`/feedback [id] +1|0|-1` → update predictions.json, print running accuracy + signal hit rates.

## Weight Adjustment
Read predictions.json. After 5+ scored predictions: >70% hit rate = +0.1 weight, <40% = -0.1. Cap ±0.25 from base.

## Data Maintenance

### Predictions (predictions.json)
Keep only the **last 20 predictions**. When adding new predictions that would exceed 20, remove the oldest entries first. Carry forward the computed `signal_weights` (adjusted weights already reflect older data). This keeps the file under ~10KB.

### Retrospectives (retrospectives.md)
After writing a session retrospective, check if any lessons repeat patterns already captured in `reference/lessons.md`:
- **Repeated lesson (3+ sessions confirm):** Promote to `reference/lessons.md` (or to core SKILL.md if fundamental). Remove the verbose retelling from retrospectives — keep only a one-line reference.
- **Negated/wrong lesson:** Remove from `reference/lessons.md`. Add a brief note in retrospectives explaining why it was wrong, then archive.
- **Archive:** When retrospectives.md exceeds ~15KB, move sessions older than 5 trading days to `reference/retrospectives_archive.md`. Keep only the last 5 sessions in the main file.
