# Lessons Learned (Supplementary Context)

Not hard rules — treat as considerations when the relevant pattern appears.

---

## Codified Rules

Rules derived from live trading sessions. Each has been confirmed across multiple sessions.

### 1. GEX Regime = Range Width, Not Direction

**Trigger:** GEX regime is trending or mean-reverting.

**Rule:** Negative GEX means wider oscillations (15-20pt ranges), positive GEX means tighter (5-10pt). Do not use GEX regime as a directional signal. Weight CEX + VWAP over GEX regime when determining direction.

Evidence: 4 sessions confirmed (2/25, 2/26, 2/27, 3/04).

### 4. Gap Open: Mandatory Neutral Cooldown

**Trigger:** Gap open >20pts from prior close.

**Rule:** Issue NEUTRAL during the cooldown window. 20-75pt gap = 30 min cooldown. 75+ pt gap = 60 min cooldown. Require 2+ adjacent CEX flips before upgrading to a directional call.

Evidence: 3 sessions confirmed (2/27, 3/03, 3/06).

### 6. Thick Resistance Gauntlet: Discount Targets

**Trigger:** 2+ amplifier + suppress barriers between spot and the next major wall/magnet.

**Rule:** Target the nearest breakable barrier instead of the distant wall. In high VIX (>20), reduce targets a further 5-10pts.

Evidence: 2 sessions, 0 hurt (2/27).

### 8. Bull Overconfidence Above Dominant Wall

**Trigger:** Spot is >5pts above the dominant structural GEX wall AND the call targets further upside.

**Rule:** Flag elevated reversal risk and reduce confidence by 1. Do not issue BULL from above dominant wall targeting higher unless 3+ independent signals confirm momentum.

Evidence: 3 sessions confirmed (3/02, 3/03, 3/04).

### 20. Wall Cascade = Trend

**Trigger:** 3+ walls break in the same direction within a session AND CEX equilibrium migrates 30+ pts in that direction.

**Rule:** The framework is in a genuine trend. Issue a directional call at confidence 3 (capped). Detection: (a) 3+ walls broken same direction, (b) CEX equil migrated 30+ pts, (c) VIX trending same direction, (d) each bounce makes a lower high (bear) or higher low (bull). Apply symmetrically for upside cascades.

Evidence: 2 sessions, 0 hurt (3/05).

---

## Observations

Patterns observed in trading sessions. Not yet promoted to rules — treat as things to watch for.

### Pin Estimation: Amplifier-Pin Ratio
When a GEX amplifier >10x adjacent pin wall's magnitude, the amplifier's gravity dominates. Estimate equilibrium closer to the amplifier strike, weighted by relative magnitude. (2026-02-25: 6945 at -273 vs 6950 at +13 → close 6946.14)

### Pin Estimation: CEX Migration Direction
Peak supportive CEX migrating to a lower strike = equilibrium shifting down. Adjust pin/target ~3-5 pts in migration direction. (2026-02-25: support 6945→6940, missed by 3.86 pts)

### Wall Collapse vs Direction Change
Single wall collapse ≠ directional regime change. Check VWAP, net CEX, positioning before downgrading. If macro intact, adjust levels — don't flip the call. (2026-02-25: 6940 collapse, but VWAP +33 and support growing → premature neutral downgrade)

### VWAP in Low-Vol Sessions
VIX range <1.5 pts + mixed GEX → VWAP is most reliable signal. VEX low impact, GEX ambiguous. Weight VWAP higher. (2026-02-25: VWAP best signal all session)

### Steady CEX Growth = High Reliability
CEX growing monotonically (same sign, larger magnitude) across 3+ reads = highly reliable support/resistance. CEX that flips sign = volatile, less predictable. (2026-02-25: 6955 grew 5 reads straight. 6945 flipped mid-session.)

### Customer Pin Bets as Wall Health
Customers selling premium both sides at a strike confirms a wall. Unwinding those positions = wall weakening — expect GEX decay within 1-2 reads. (2026-02-25: customer positions at 6940 declined before wall collapsed)
