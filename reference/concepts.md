# Detailed Concept Reference

Read this file when you need the full theory behind a signal type. The core SKILL.md has the compressed rules.

## GEX (Gamma Exposure)
- Units: raw gamma $, net across calls and puts
- +GEX: dealers long gamma → sell rallies, buy dips → dampener/pin/wall
- -GEX: dealers short gamma → buy rallies, sell drops → amplifier/accelerant
- Regime: sum all GEX. Net positive = mean-reverting. Net negative = trending.
- Walls are not static — track across updates. 50%+ decay = unreliable.

## CEX (Charm Exposure)
- Units: $M per 5-minute interval. Charm = dDelta/dTime.
- +CEX = SUPPRESSIVE (dealers passively sell → downward pressure / resistance)
- -CEX = SUPPORTIVE (dealers passively buy → upward pressure / support)
- Time sensitivity: most powerful in final 2 hours, accelerates into close
- Dynamic: values shift rapidly with price and time. Single snapshot can mislead.
- Magnitude scales ~2x in final 30 min. This is normal charm acceleration.

## VWAP
- Institutional reference anchor. Above = buy-side control. Below = sell-side control.
- -CEX near VWAP = double support (charm buying + institutional anchoring)
- +CEX near VWAP = suppressive resistance
- Gap between spot and VWAP sets directional ambition

## DEX (Delta Exposure)
- Units: raw delta. Net dealer delta at each strike = current directional tilt.
- +DEX: dealers long delta (may sell rallies). -DEX: dealers short delta (may buy rallies or sell drops).
- Snapshot of current positioning, not a flow.
- Net DEX = hedging pressure baseline. Positive = market has been bought. Negative = sold.
- -DEX + -GEX = maximum danger (short delta AND short gamma → aggressive chasing)

## VEX (Vanna Exposure)
- Units: $M per 1% IV change. Vanna = dDelta/dVol.
- +VEX: vol rise → dealers sell (headwind). Vol fall → dealers buy (tailwind).
- -VEX: vol rise → dealers buy (tailwind). Vol fall → dealers sell (headwind).

### VEX Macro Context (Vanna as VIX-SPX Driver)
In a put-heavy market (typical SPX), dealers carry net positive vanna:
- **VIX rising → net dealer selling → SPX falls.** Higher IV increases put deltas → forced selling → puts approach ATM → feedback loop accelerates decline.
- **VIX falling → net dealer buying → SPX rises.** Lower IV decreases put deltas → dealers cover short hedges → "vanna rally" (V-shaped recoveries, low-vol grinds).

### Per-Strike Framing (Common Mistake to Avoid)
- Vol spike (VIX rising, SPX falling): -VEX buying at a strike = **support cushion on the way down**, NOT a bullish breakout trigger.
- Vol crush (VIX falling, SPX rising): +VEX buying at a strike = **rally fuel**, NOT resistance.
- Always establish macro direction first (VIX rising = bearish, VIX falling = bullish), then use per-strike VEX for support/resistance within that move.

### VEX Significance
- VIX intraday range <1.5 pts: low impact
- 1.5-3 pts: moderate (confirmation/conflict)
- >3 pts: high impact (elevate to primary signal)

### VEX + CEX Interaction
Agreement = double mechanical flow. Conflict = stronger absolute value dominates with reduced confidence.

### Vanna Flip Risk
When puts cross OTM→ITM in selloff, vanna sign flips. Stabilizing flow disappears → gamma-driven cascading. Both gamma and vanna work against market = extreme selloff acceleration.

## Expected Move (EM)
- Options-implied session range from ATM straddle pricing.
- Reality check: within EM = achievable. Beyond EM = needs strong confluence.

## Positioning (MM Perspective)
Data: user provides "Positions" (net) and "Position Calls". Derive puts = Net - Calls.
All values are MM perspective. MM short = customers long (and vice versa).

| MM Position | Calls | Puts |
|-------------|-------|------|
| Positive (MMs long) | Customers sold calls → dampening | Customers sold puts → dampening |
| Negative (MMs short) | Customers bought calls → bullish demand | Customers bought puts → **hedge line** |

### Near Spot (±20 pts)
- **Hedge line:** largest MM short puts = where customers bought most protection
- **Squeeze fuel:** MM long puts below spot (customers sold for premium) + -GEX = cascade risk
- **Call buying clusters:** MM short calls above spot = upward gamma pressure on rally

### Positioning Profiles
- **Hedged long:** MM short calls far above + MM short puts near spot. Bullish but hedged.
- **Bearish hedge:** MM short puts below spot + MM long calls above. Defensive.
- **Speculative long:** MM short calls near spot + minimal MM short puts. Vulnerable to pullback.
- **Short squeeze setup:** MM long puts below spot + -GEX. Cascade on drop.

### Greeks Integration
- Hedge line + GEX wall at same strike = triple support (put decay + gamma dampening + delta hedging)
- Customer sold puts + -GEX = double cascade risk (gamma amplification + squeeze)
- DEX should confirm positioning: large -DEX ↔ large MM short puts. Disagreement = investigate.

### Positioning Shift Tracking (Updates)
- New MM short puts near spot = fresh hedging demand (bearish)
- MM short puts unwinding = lifting protection (bullish)
- New MM short calls above = call buying (bullish)
- MM short calls unwinding = profit-taking / de-risking
