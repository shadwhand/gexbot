# Schwartz IC — CBOE Research

## Structure
- **Type:** Iron condor, 0DTE SPX
- **Wings:** 10pt wide (both sides)
- **Credit target:** $1.00/side ($2.00 total IC credit)
- **Contracts:** 1x per entry

## Entry Rules
- **Timing:** Post-vol-spike. Enter after IV has expanded — the elevated premium compensates for the narrow wings.
- **No specific time-of-day requirement.** The trigger is vol expansion, not clock time.
- **Single entry** per setup (implied).

## Exit Rules
- **Set-and-forget.** No active management during the trade.
- **10-cent rule:** Close when bid reaches $0.10. This captures ~95% of max profit while avoiding pin risk at expiration.
- **No stop loss.** Max loss is defined by the 10pt wings minus credit ($800 max per side on 1 contract).

## Edge
- **Simplicity.** No judgment calls during the trade. Enter on vol spike, set limit close at $0.10, walk away.
- **Post-vol-spike entry** means premium is elevated relative to realized vol going forward. Vol spikes tend to mean-revert, so the IC benefits from the subsequent IV compression.
- **Narrow wings (10pt)** keep max loss small in absolute terms. At $1/side on 10pt wings, max loss is $900/side ($1000 width - $100 credit).
- **The 10-cent rule** avoids the gamma risk of holding to expiration. With 0DTE, the final 15-30 minutes are nuclear — closing at $0.10 bid sidesteps this.

## Key Characteristics
- **Vol-spike trigger is vague.** "Post-vol-spike" isn't precisely defined. VIX spike of 2+ pts intraday? IV percentile? This requires judgment or a quantitative definition.
- **10pt wings are very narrow.** A 10-pt move from short strike = max loss. On SPX, this can happen in minutes during volatile sessions — exactly when this strategy is supposed to be entered.
- **The tension:** Enter when vol is high (more premium) but vol is high because moves are large (more likely to hit 10pt wing). The edge depends on vol mean-reverting faster than price trends.
- **CBOE research** — this originated from CBOE's published research on 0DTE strategies. Institutional backing but not necessarily optimized for retail execution.

## Performance (Reported)
- No specific CAGR or win rate reported in our records
- Described as "favorable after vol expansion" — qualitative, not quantified

## GEX Integration (Potential)
- **Regime filter strengthens the vol-spike trigger.** Vol spike + GEX flip from positive to negative = trending regime entry. Vol spike + GEX remaining positive = mean-reversion entry (better for IC).
- **Strike validation:** 10pt wings mean short strikes are close to spot. +GEX wall at short strike = strong confirmation. -GEX amplifier = the 10pts can get eaten quickly.
- **Post-spike GEX read:** After a vol spike, check if new +GEX walls have formed (dealers hedging the spike). Walls forming = range establishing = IC-friendly.
- **10-cent rule + GEX:** If the IC is near $0.10 but a -GEX amplifier is building at the short strike, close immediately rather than waiting for the $0.10 bid.

## Comparison Notes

| | Schwartz IC | MEIC | Adam Ride or Die |
|---|---|---|---|
| Wings | 10pt | 50-60pt | 20pt |
| Credit | $1/side | $1-1.75/side | ~$3.50/side |
| Stop | None (ride-or-die) | Full IC credit | 250% credit |
| Entry trigger | Vol spike | Clock (30min apart) | Clock (30min apart) |
| Management | Set-and-forget | Active (stop per side) | Algo stop |
| Complexity | Lowest | Moderate | Low |

Narrowest wings, simplest management, most dependent on entry timing (vol spike identification).
