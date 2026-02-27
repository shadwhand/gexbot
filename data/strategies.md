# SPX Trade Strategies Reference

## 1. Regime → Strategy Matrix

| GEX Regime | Condition | Structures |
|------------|-----------|------------|
| Positive (pinning) | Range-bound, walls holding | ICs, iron flies, credit spreads, flies at walls |
| Positive | Near strong wall | Credit spread, short strike at wall |
| Negative (trending) | Directional move | Vertical debits, directional iron flies |
| Negative | Amplifier cascade | Trend-following verticals, convexity fly scalps |
| Transitional | Shifting/unclear | MEIC-style multiple entries, small size, wait for confirm |

## 2. Structure Quick-Reference

GEX-specific entry/exit only. Assumes knowledge of standard options structures.

| Structure | GEX Entry Logic | Exit | Stop |
|-----------|----------------|------|------|
| **Vertical debit** | Negative GEX regime, directional conviction. Enter on pullback (bull) or rejection (bear). Width = distance to next wall. | 50-80% max profit | Full premium paid |
| **Vertical credit** | Short strike at/behind GEX wall. Width beyond next level. | 50% credit | 1.5-2x credit |
| **Iron condor** | Positive GEX, range-bound. Short strikes at/behind walls. 10-50pt wings. | 50% credit | Full credit/side or 2x total |
| **Iron fly (neutral)** | High IV, expecting pin. Center at spot or CEX magnet. 20-50pt wings. | $1-2/contract (0DTE) | 1.5-2x credit |
| **Iron fly (directional)** | Center at CEX magnet. Enter when spot 10-20 pts away. | $1-2/contract | 1.5-2x credit |
| **Debit butterfly** | Convexity scalp: center at wall/magnet, enter 15-25 pts away. Pin trade: center at target, final hour. | 2-5x debit | Full premium (small) |
| **Broken-wing fly** | Slight directional bias. Can enter for credit. | 2-3x debit side | Credit side = defined |

## 3. Named Strategies

| Name | Structure | Entry | Key Rules | Edge |
|------|-----------|-------|-----------|------|
| **MEIC** (Tammy Chambless) | IC, 50-60pt wings | 6 entries/day, 30min apart, start 12PM ET | Credit $1-1.75/side. Stop = full IC credit/side. MEIC+ variant. ~20.7% CAGR. | See `meic.md` for full rules + GEX integration. |
| **Breakeven IC** (John Sandvand) | IC, 5-15 delta | 30min spacing, all session | Credit ~$200. Stop = total premium/side. | 39% win rate, 2.4x W/L ratio. See `breakeven_ic.md`. |
| **0DTE Iron Fly** (Severson/Perryman) | ATM iron fly at open | Open, 20-50pt wings | Target $1.50. Exit by 11AM. Avg hold 18min. | Vol crush + theta. See `0dte_iron_fly.md`. |
| **JOIF** (Jim Olson) | ATM iron fly at open | Open, dynamic wings | IM-based wing sizing. Target $1.50. Exit by 11AM. | Vol-adaptive variant of 0DTE Fly. See `joif.md`. |
| **Maria Shoe** | Iron fly at open | Open | Daily target $300. Hit target → stop. | Behavioral discipline. See `maria_shoe.md`. |
| **Schwartz IC** (CBOE) | IC, 10pt wide, $1/side | Post-vol-spike | Set-and-forget. Close at $0.10 bid. | Post-vol mean reversion. See `schwartz_ic.md`. |
| **MMMM's Ride or Die** | IC, 40-delta, 20pt wings | PM 12:30-3:00 ET, 30min apart. Mon 10AM variant. | SMA-10 filter. Stop = 250% credit. Max 4 tranches/day. | 18.7% CAGR, 10.1% max DD. See `mmmm_ride_or_die.md` for full backtest + GEX integration. |

## 4. Signal → Strategy Mapping

| Signal Output | Strategy | Entry Logic |
|---------------|----------|-------------|
| Amplifier cascade | Vertical debits | Wall-to-wall. Enter on first wall break, target next. |
| Strong walls holding | Credit spreads / ICs | Short strike at/behind wall. |
| CEX magnet pulling | Directional iron fly | Center at magnet, enter 10-20 pts away. |
| Convexity setup | Debit butterfly | Center at wall/magnet, enter 15-25 pts away, exit within 5 pts. |
| EM boundaries | IC short strikes | Place outside EM range. |
| Tested floor holding | Put credit spread | Short strike at/behind floor. |
| Spent magnet | Close directional fly | Magnet consumed — take profit. |
| Wall decaying >50% | Close credit spread | Wall unreliable — reduce exposure. |

## 5. Time Windows

| Window | Time ET | Strategies | Why |
|--------|---------|------------|-----|
| Open | 9:30-10:00 | Iron flies, straddle sells | Max IV crush, theta |
| Morning | 10:00-11:30 | Trend verticals, directional flies | Direction established |
| Midday | 11:30-2:00 | MEIC entries, ICs, neutral flies | Range compression, theta grind |
| Afternoon | 2:00-3:30 | CEX-driven flies, convexity scalps | Charm acceleration |
| Close | 3:30-4:00 | Pin trades, fly scalps | CEX dominant, extreme gamma, small size only |

## 6. Risk Rules

### Strike Validation (run before every recommendation)
1. Calculate `|spot - strike|` for each candidate. State distance explicitly.
2. Put strikes below spot: lower = further OTM = safer = less credit. Call strikes above: higher = further OTM = safer.
3. A closer strike with a mega wall may be safer than a further strike with no support — check GEX/CEX.
4. State whether each strike is inside/outside EM range.

### Sizing + Stops
- Per-trade: 1-2% of daily capital. Daily limit: 5% — stop trading if hit.
- Multiple ICs/flies same session = correlated. Treat as one position.
- Confidence 4-5 = full size. 3 = half. 1-2 = paper or skip.
- Gamma risk: moderate >3h, increasing 1-3h, extreme <1h, nuclear final 15min.

### When to Skip
Regime shift in progress. Major catalyst <30min. Conflicting signals (confidence 1-2). After daily loss limit. Low liquidity / half days.
