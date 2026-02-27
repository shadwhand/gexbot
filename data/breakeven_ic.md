# Breakeven IC — John Sandvand

## Structure
- **Type:** Iron condor, 0DTE SPX
- **Delta:** 5-15 (far OTM both sides)
- **Wings:** Variable width (wider than typical — sized to target credit)
- **Contracts:** Multiple tranches

## Entry Rules
- **Times:** All session, 30min spacing between entries
- **Credit target:** ~$200 per IC (~$1.00/side)
- **Delta selection:** 5-15 delta on short strikes. Far OTM placement means low probability of touch but low credit per trade.

## Exit Rules
- **Stop:** Total premium received per side. If one side hits 1x the total IC credit, close that side.
- **No profit target.** Hold to expiration.
- **Ride-or-die on most trades** — the stop is loose enough that most trades expire.

## Performance (Reported)
- **Win rate:** 39% — most trades lose money or break even
- **Win/loss ratio:** 2.4x — winners are significantly larger than losers
- **Annual return:** 70-80% (reported)
- **Edge source:** Asymmetric payoff. Losses are small and frequent; wins are large when both sides expire worthless.

## Key Characteristics
- **Low win rate, high payoff ratio.** Psychologically difficult — you lose more often than you win. The math works but the experience is rough.
- **Far OTM placement** means the strategy is less sensitive to intraday moves. Most action happens only on large-range days.
- **All-session entries** contrast with MEIC (PM only) and Adam (PM only). Morning entries capture higher IV but also higher risk.

## GEX Integration (Potential)
- **Regime filter:** Net +GEX (range-bound) is ideal — far OTM strikes are unlikely to be touched. Net -GEX (trending) is the primary risk.
- **Strike validation:** At 5-15 delta, short strikes are 30-60+ pts from spot. Check for -GEX amplifiers at or beyond short strikes — a cascade through an amplifier zone can reach far OTM quickly.
- **Wall confirmation:** +GEX wall between spot and short strike = structural buffer. More walls = higher confidence.
- **Skip signal:** -GEX amplifier cascade path between spot and short strike with no intervening walls = elevated risk of touch.

## Comparison Notes
- Lower credit per trade than MEIC ($200 vs $200-350) but wider placement
- Win rate (39%) is much lower than MEIC (~60%+) or Adam (71.6%)
- Compensated by the 2.4x win/loss ratio — when it works, both sides expire worthless for full credit
- Better suited to traders comfortable with long losing streaks
