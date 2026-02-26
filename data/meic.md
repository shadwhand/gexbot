# MEIC — Multiple Entry Iron Condors (Tammy Chambless)

## Base Rules
- **Structure:** Iron condor on SPX, 0DTE, 50-60pt wings
- **Entries:** 6/day, 30min apart, starting 12PM ET
- **Credit target:** $1.00-1.75 per side
- **Stop:** Full IC credit per side. MEIC+ variant: $0.10 below 1x net loss.
- **Performance:** ~20.7% CAGR, 4.31% max drawdown (backtested)
- **Edge:** Time diversification reduces single-entry timing risk. Best in positive GEX / range-bound regimes.

## GEX Integration

Premium target ($1-1.75/side) determines strikes. GEX acts as a **filter and exit layer**, not a strike-mover.

### Pre-trade filter
Find strikes that produce target premium, then validate:
- +GEX wall at/beyond short strike → **take it** (structural protection confirms premium placement)
- -GEX amplifier at short strike → **skip it** (cascade risk makes the premium a trap)
- No significant GEX at short strike → neutral, take at standard confidence

### Regime filter (daily go/no-go)
- Net GEX positive → full entries (MEIC's sweet spot: pinning, mean-reversion)
- Net GEX mixed (±5K) → enter but consider half-size
- Net GEX negative → skip or half-size (trending regime violates MEIC's range-bound premise)

### DEX filter at short strike
- +DEX (dealers long delta) → dampener, confirms strike
- -DEX (dealers short delta) → accelerant, skip
- -DEX + -GEX at same strike → **hard skip** (short delta AND short gamma = aggressive chasing)

### VEX + VIX filter
- +VEX at strike + VIX falling → dealers buying there → supportive, good for IC
- +VEX at strike + VIX rising → dealers selling there → price pushed toward strike, dangerous
- Daily: VIX falling + net positive VEX = range-supportive (MEIC-friendly). VIX rising + net positive VEX = trending pressure (MEIC-hostile).

### Combined readiness check per entry

| Signal | Green (take it) | Red (skip/half-size) |
|---|---|---|
| GEX regime | Net positive | Net negative |
| GEX at short strike | +GEX wall | -GEX amplifier |
| DEX at short strike | +DEX (dampen) | -DEX (chase) |
| VEX + VIX | +VEX + VIX falling | +VEX + VIX rising |

3+ greens = full size. 1 red = half size. 2+ reds = skip entry.

### Intraday exit triggers (beyond standard stop)
- GEX wall at short strike decays >50% → exit that side early
- CEX flips from supportive to suppressive at short strike → exit
- GEX regime flips negative mid-session → tighten stops on all open ICs
