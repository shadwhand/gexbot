# 0DTE Iron Fly — Severson/Perryman

## Structure
- **Type:** ATM iron fly, 0DTE SPX
- **Center:** At spot price at open
- **Wings:** 20-50pt wide (both sides symmetric)
- **Contracts:** 1x per entry

## Entry Rules
- **Time:** Market open (9:30-9:35 AM ET). Single entry.
- **Placement:** Center the fly at the current spot price. Short call and short put at the same ATM strike.
- **Wing width:** 20-50pt based on expected range / IV. Wider wings in higher IV.

## Exit Rules
- **Profit target:** $1.50/contract
- **Time stop:** Exit by 11:00 AM ET regardless of P/L
- **Average hold time:** ~18 minutes
- **No explicit stop loss** — the defined-risk structure caps max loss at wing width minus credit.

## Edge
- **Opening vol crush.** IV is elevated at open due to overnight uncertainty. The fly captures the rapid IV decline in the first 30-90 minutes as the market establishes direction.
- **Theta acceleration.** 0DTE theta is extreme at open — the fly bleeds premium quickly if spot stays near the center strike.
- **Short duration.** 18-minute average hold means minimal exposure to trend risk. In and out before the market establishes its intraday range.

## Key Characteristics
- **Morning-only strategy.** Does not apply to PM sessions. Entirely dependent on the opening vol crush dynamic.
- **ATM placement = high gamma risk.** The fly is maximally sensitive to spot moves. A 10-20pt move at open can push one side deep ITM quickly.
- **Quick exits required.** The $1.50 target and 11AM time stop are rigid. Holding past 11AM exposes to directional risk without the vol crush tailwind.
- **Single entry** — no time diversification (unlike MEIC/Adam which use multiple tranches).

## GEX Integration (Potential)
- **Limited utility.** This strategy enters at open before intraday GEX structure develops. Pre-market GEX data (from prior close) is the only input.
- **Regime check:** Prior-day net +GEX suggests range-bound open (fly-friendly). Prior-day net -GEX suggests trending open (fly-hostile).
- **Wall proximity:** If spot opens near a major +GEX wall from prior day's data, the fly is better placed — wall acts as pin anchor.
- **Skip signal:** Large overnight gap + prior-day -GEX regime = trending open likely. Skip or reduce size.

## Comparison Notes
- Shortest hold time of any named strategy (18min avg)
- Highest gamma exposure (ATM placement)
- No time diversification — single shot
- Pairs well with PM strategies (MEIC, Adam) since it occupies a different time window
