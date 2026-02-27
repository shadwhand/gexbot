# JOIF — Jim Olson Iron Fly

## Structure
- **Type:** ATM iron fly, 0DTE SPX
- **Center:** At spot price at open
- **Wings:** Dynamic — sized based on Initial Margin (IM)
- **Contracts:** 1x per entry

## Entry Rules
- **Time:** Market open (9:30-9:35 AM ET). Single entry.
- **Placement:** Center the fly at the current spot price.
- **Wing sizing rule:**
  - IM < $30 → use $50 wings (standard)
  - IM > $30 → expand wings by $10 on each side (calls +$10, puts +$10)
  - This creates wider flies in higher-vol environments, giving more room for the trade to work

## Exit Rules
- **Profit target:** $1.50/contract
- **Time stop:** Exit by 11:00 AM ET regardless of P/L
- **No explicit stop loss** — max loss is defined by wing width minus credit received.

## Edge
- **Vol-adaptive wing sizing.** The IM-based rule automatically widens wings when IV is elevated, reducing the probability of max loss on high-vol days. Narrower wings on calm days capture more theta relative to risk.
- **Same opening vol crush** as the standard 0DTE Iron Fly — IV compression in the first 30-90 minutes.
- **Theta acceleration** on 0DTE.

## Key Characteristics
- **The IM rule is the differentiator.** Without it, this is identical to the Severson/Perryman 0DTE Iron Fly. The dynamic wing sizing is the entire contribution.
- **Wider wings in high IV = lower win rate but smaller max loss relative to credit.** The trade-off is that wider wings cost more, reducing net credit.
- **Same time constraints** as standard iron fly: open entry, exit by 11AM, ~18min avg hold.

## Wing Sizing Examples

| IM | Wing Width | Behavior |
|----|-----------|----------|
| $22 | $50 | Standard. Calm market. |
| $35 | $60 | Expanded. Moderate vol. |
| $45 | $60 | Expanded. High vol. |

Note: The rule as described expands once (by $10/$10) when IM > $30. It doesn't scale further — it's binary, not linear.

## GEX Integration (Potential)
Same as 0DTE Iron Fly — limited utility since this is an open-only strategy. Prior-day GEX regime is the primary input.

- **Regime check:** Prior-day +GEX = range-bound open (fly-friendly). Prior-day -GEX = skip or expand wings further.
- **IM + GEX combined:** IM > $30 AND prior-day -GEX = maximum caution. Consider skipping entirely rather than just expanding wings.

## Comparison to 0DTE Iron Fly
| | 0DTE Iron Fly | JOIF |
|---|---|---|
| Wings | Fixed 20-50pt | Dynamic (IM-based) |
| Vol adaptation | Manual / judgment | Rules-based |
| Otherwise | Identical | Identical |

JOIF is a refinement of the Severson/Perryman fly, not a separate strategy. The IM-based wing rule adds structure to what would otherwise be a judgment call on wing width.
