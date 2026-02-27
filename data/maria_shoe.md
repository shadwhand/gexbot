# Maria Shoe — Daily Target Iron Fly

## Structure
- **Type:** Iron fly, 0DTE SPX
- **Center:** At spot price at open
- **Wings:** Not specified (likely 20-50pt based on similar strategies)
- **Contracts:** Variable — sized to hit daily target

## Entry Rules
- **Time:** Market open
- **Single entry** per day (implied by the daily target discipline)

## Exit Rules
- **Daily P/L target:** $300
- **Hard rule:** Hit $300 target → stop trading for the day. No additional entries.
- **No specified stop loss** beyond the defined-risk structure.

## Edge
- **Discipline over optimization.** The entire edge is behavioral, not structural. The strategy prevents overtrading and revenge trading by imposing a hard daily cap.
- **Same underlying mechanics** as the 0DTE Iron Fly (vol crush + theta) — the fly structure is standard.

## Key Characteristics
- **The strategy IS the rule, not the structure.** The iron fly is a vehicle. The $300 daily target is the strategy. Any fly structure could be substituted.
- **Prevents the most common 0DTE failure mode:** winning in the morning, then giving it all back (and more) with afternoon entries.
- **Fixed dollar target** means the strategy doesn't scale with account size unless the target is adjusted. $300/day = ~$75K/year pre-tax, which may be appropriate for some account sizes and insufficient for others.
- **No specified risk management** beyond the defined-risk structure. If the fly loses, the max loss is wing width minus credit — no stop mentioned.

## GEX Integration (Potential)
- **Minimal.** This is a behavioral framework, not a structural one. GEX doesn't change the entry or exit rules.
- **Possible overlay:** On days with prior-day -GEX (trending regime), skip the trade entirely. The $300 target doesn't help if the fly gets blown out at open.
- **The discipline rule could extend to GEX:** Hit daily target OR GEX regime flips mid-session → stop trading.

## Comparison Notes
- Simplest strategy in the collection — no delta targeting, no wing rules, no multiple entries
- The behavioral discipline could be applied to any other strategy as a meta-rule
- No backtest data available
