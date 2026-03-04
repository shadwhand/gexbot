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

## Evaluation Output Format

When evaluating MEIC strike candidates, use this format. Evaluate each side separately, sorted by strike.

```
═══ PUT SIDE — SAFE ZONES (sorted by strike) ══════

  Strike  GEX     CEX     DEX     VEX     GEX✓  DEX✓  VEX✓  Verdict
  6825    -3.0    -6.3     +18    +1.2     ✗     ✓     ✓    SKIP (amplifier)
  6840    +5.1    +8.0    -238    +0.8     ✓     ✗     ✓    MIXED (wall but -DEX)
  6855   +20.6   +20.4    -972    -2.1     ✓     ✗     ✗    ✓ WALL but close (24 pts OTM)

  DEX assessment:
    Net DEX below spot: [sum] ([positive = dealers already bought dips / negative = dealers sold])
    Danger zones: [strikes where -DEX + -GEX overlap]
    Dampening zones: [strikes where +DEX + +GEX overlap]

  VEX assessment (VIX [value], intraday range [X] pts → [low/moderate/high] impact):
    VIX direction: [rising/falling/flat]
    Net VEX below spot: [sum]
    [If VIX falling + net +VEX = vanna rally cushion → IC-friendly]
    [If VIX rising + net +VEX = selling pressure → IC-hostile, tighten stops]
    Per-strike flags: [strikes where VEX conflicts with GEX/DEX verdict]

  Protection layers above any put strike:
    [Strike] [FORTRESS/wall] ([GEX value], [CEX value]) — [role]

  BEST PUT ZONE: Short [strike]P
    • [distance] pts below spot, behind [N] walls ([list])
    • [reasoning: +GEX wall, CEX, DEX, VEX flags]
    • Long put at [strike]P ([wing width] wing)

  ⚠️  AVOID [strikes] — [reason]

═══ CALL SIDE — SAFE ZONES (sorted by strike) ═════

  Strike  GEX     CEX     DEX     VEX     GEX✓  DEX✓  VEX✓  Verdict
  6905    -4.3    +4.0    -582    +3.1     ✗     ✗     ✗    HARD SKIP (-GEX + -DEX + hostile VEX)
  6940    +0.7    -1.7    +437    +0.5     ✓     ✓     ✓    ✓ BEST (wall, +DEX, benign VEX)

  DEX assessment:
    Net DEX above spot: [sum] ([positive = dealers may sell rallies / negative = dealers may buy])
    Danger zones: [strikes where -DEX + -GEX overlap]
    Dampening zones: [strikes where +DEX + +GEX overlap]

  VEX assessment:
    [Same structure as put side — VIX context carries over]
    Per-strike flags: [strikes where VEX conflicts with GEX/DEX verdict]

  Protection layers below any call strike:
    [Strike] [sell barrier/wall] ([CEX/GEX value]) — [role]

  BEST CALL ZONE: Short [strike]C
    • [distance] pts above spot, behind [barriers]
    • [reasoning: +GEX wall, +DEX, CEX barriers, VEX]
    • Long call at [strike]C ([wing width] wing)

  ⚠️  HARD SKIP [strikes] — [reason]
```

### Verdict rules
- **✓ BEST:** +GEX wall + +DEX at strike + VEX supportive (or low impact)
- **✓ WALL:** +GEX wall, DEX neutral or mildly negative, VEX not hostile
- **MIXED:** +GEX wall but -DEX (yellow flag — wall may hold but hedging pressure works against it)
- **SKIP:** -GEX amplifier (cascade risk)
- **HARD SKIP:** -GEX + -DEX (amplifier + short delta = max danger). Also -GEX + hostile VEX.
- **NEUTRAL:** No significant GEX (take at standard confidence if premium is right)

### Check columns
- **GEX✓:** +GEX (wall) = ✓. -GEX (amplifier) = ✗.
- **DEX✓:** +DEX (dampener) = ✓. -DEX (accelerant) = ✗. Near zero = —.
- **VEX✓:** Depends on VIX direction. VIX falling: +VEX = ✓ (dealers buying). VIX rising: +VEX = ✗ (dealers selling). VIX range <1.5 pts = — (low impact).
