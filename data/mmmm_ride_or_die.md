# MMMM's Ride or Die — 40-Delta 20-Wide IC

## Structure
- **Type:** Iron condor, 0DTE SPX
- **Delta:** 40 (both sides)
- **Wings:** 20pt wide
- **Stop:** 250% of premium received (hybrid ride-or-die)
- **Contracts:** 1x per tranche

## Entry Rules
- **Filter:** Spot must be above SMA-10 day. No trade if below.
- **Times:** PM entries, 12:30–3:00 PM ET, 30min spacing
- **Monday variant:** 10:00 AM entry (VRP edge — options historically most expensive Mondays due to jump-risk hedging). Backtest shows this underperforms Monday PM entries.
- **Tranches:** Up to 4/day. Max daily loss ~$3,500 (stop version) or ~$6,000 (pure ride-or-die).
- **VIX floor:** MinVIX 13 (no entry below VIX 13)

## Exit Rules
- **Primary:** Expiration (ride-or-die). 71.6% of trades expire.
- **Stop loss:** 250% of credit received. Algo stop on full spread with wide bid-ask protection.
- **No profit target.** Set-and-forget.

At 40-delta, credit often exceeds the 250% stop threshold, so most trades behave as pure ride-or-die. When credit is lower (late entries, low VIX), the stop activates and caps losses.

## Backtest Results (Jan 2020 – Feb 2026)

| Metric | Value |
|---|---|
| Total trades | 5,648 |
| Trading days | 798 |
| Total P/L | $235,020 |
| CAGR | 18.7% |
| Win rate | 71.6% |
| Profit factor | 1.22 |
| Max drawdown | $36,254 (10.1%) |
| Return/DD | 6.5x |
| Max losing streak | 11 days |
| Avg premium | $347 |
| Avg P/L/trade | $41.61 |
| Avg P/L/day | $294.51 |

### By Year

| Year | Trades | Days | P/L | Avg/Day | Win% | Stops |
|------|--------|------|-----|---------|------|-------|
| 2020 | 776 | 104 | -$28,630 | -$275 | 66% | 181 |
| 2021 | 924 | 122 | $20,634 | $169 | 71% | 147 |
| 2022 | 698 | 99 | $54,547 | $551 | 73% | 107 |
| 2023 | 1,032 | 150 | $38,418 | $256 | 72% | 184 |
| 2024 | 878 | 131 | $62,005 | $473 | 75% | 141 |
| 2025 | 1,188 | 170 | $77,008 | $453 | 73% | 195 |
| 2026 | 152 | 22 | $11,036 | $502 | 72% | 23 |

### By Side

| Side | Trades | P/L | Win% | Stop% |
|------|--------|-----|------|-------|
| Puts | 2,824 | $148,375 | 73% | 17.6% |
| Calls | 2,824 | $86,645 | 70% | 17.1% |

### By Entry Time

| Window | Trades | P/L | Avg | Win% |
|--------|--------|-----|-----|------|
| Morning (10AM) | 338 | $9,896 | $29.28 | 69% |
| Early PM (12-2) | 3,096 | $141,596 | $45.73 | 71% |
| Late PM (2-4) | 2,214 | $83,528 | $37.73 | 73% |

### Monday 10AM vs PM

| Entry | Trades | P/L | Avg | Win% | Stops |
|-------|--------|-----|-----|------|-------|
| Mon 10AM | 338 | $9,896 | $29.28 | 69% | 70 (20.7%) |
| Mon PM | 1,048 | $46,874 | $44.73 | 72% | 196 (18.7%) |

### By VIX Regime

| VIX | Trades | P/L | Avg | Win% | Stop% |
|-----|--------|-----|-----|------|-------|
| 13-18 | 3,044 | $154,432 | $50.73 | 73% | 17% |
| 18-25 | 1,864 | $68,105 | $36.54 | 70% | 17% |
| 25+ | 740 | $12,482 | $16.87 | 69% | 19% |

### Worst Days

| Date | Day | P/L | Stops |
|------|-----|-----|-------|
| 2020-03-25 | Wed | -$6,450 | 4/8 |
| 2021-11-22 | Mon | -$5,334 | 7/8 |
| 2020-07-13 | Mon | -$3,966 | 5/8 |
| 2025-02-18 | Tue | -$3,649 | 5/8 |
| 2020-04-06 | Mon | -$3,407 | 3/8 |

## Notes
- **Profit factor is thin (1.22).** Strategy needs ~3.7:1 win:loss count ratio to break even. Currently at 4.8:1 so there's margin, but less buffer than wider-wing strategies.
- **2020 was a loss year.** SMA-10 filter reduced but didn't prevent drawdown in the March crash and subsequent high-vol regime.
- **Backtest is conservative.** Stops sometimes trigger beyond spread width in backtest, which is impossible in live trading. Real performance should be slightly better.
- **Monday 10AM VRP edge is marginal.** PM entries on Monday outperform the 10AM VRP entry across all metrics. Consider PM-only.
- **Best regime:** VIX 13-18 with early PM entries. Worst: VIX 25+ with morning entries.

## GEX Integration (Potential)
Not part of the original strategy, but natural overlays:
- **Regime filter:** Net +GEX = range-bound = IC-friendly. Skip or half-size in net -GEX (trending).
- **Strike validation:** 40-delta puts/calls will land near spot. +GEX wall at short strike = structural protection. -GEX amplifier = cascade risk on an already-close strike.
- **DEX filter:** -DEX + -GEX at short strike = hard skip (same as MEIC).
- **Intraday stop tightening:** If GEX regime flips negative mid-session, tighten stops on open positions.

## IMSL Note
On low-premium days, this trade resembles Dan Yaklin's low-credit narrow-spread ($1.50/25-wide). P/L will fall between IMSL and non-IMSL versions.
