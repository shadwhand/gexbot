# SPX Analysis — Session Retrospectives

Consult when reviewing past patterns or before framework changes. Older sessions archived in `reference/retrospectives_archive.md`.

---

## Session: 2026-02-23 — Accuracy: 6/7 (86%), EOD error: 1 pt
SPX 6896→6837. VIX 20–22 (high impact). Deep negative GEX all day. Drove v2.0/v2.1: CEX velocity, spent magnets, wall decay, reversal confirmation, CEX path, EM check. See archive for full DEX/VEX retroactive analysis.

## Session: 2026-02-24 — Accuracy: 3/4 (75%), EOD error: 3-6 pts
SPX 6843→6890. VIX 19.4–20 (low impact). Regime shift neg→pos midday. CEX sign convention corrected (v2.3). See archive for trade outcomes and structural features.

## Session: 2026-02-25 — Accuracy: 3/5 (60%), EOD error: 3.86 pts
SPX 6925→6946.14. VIX 18.9→18.1 (low impact, <1.5 pts). Mixed GEX. Low-vol bullish grind.

**Accuracy:** Direction 3/5 (2 neutral calls scored 0). Range 4/5. Best signals: VWAP, CEX floor, positioning. Worst: GEX regime (ambiguous), DEX (flat).

**Key structures:** 6940 wall lifecycle (wall→amplifier inversion, see examples.md). 6945 amplifier dominance (20-30x pin wall). 6955 steady CEX ceiling. Hedge line migration 6930→6945→6940.

**All 7 lessons promoted to lessons.md.** All 3 structural examples in examples.md. Drove v2.6: gamma-charm coupling framework.

**Patterns confirmed (3/3 sessions):** Wall inversion, spent magnet migration, CEX suppression ceiling, EM bounded close.

**Patterns to watch:**
- Amplifier-pin ratio >10x rule — needs more data
- CEX migration as equilibrium predictor — 1 data point
- VWAP dominance in low-vol — 1 data point
- Customer positioning phase timing — confirmatory or leading?

---

## Session: 2026-02-26 — Accuracy: 4/6 (67%), EOD error: 1.1 pts (best call)

SPX ~6907→6908.89. VIX 18.72 (low impact). VWAP 6915. Joined late (14:48 ET), 6 predictions over ~75 min. Net GEX deeply negative all session (-20 to -175). Trending regime that pinned anyway.

**Accuracy breakdown:**

| ID | Time | Call | Target | Score | Note |
|----|------|------|--------|-------|------|
| pred-0226-1448 | 14:48 | NEUTRAL | 6903-6910 | +1 | First read. 6905 amp as fulcrum. |
| pred-0226-1456 | 14:56 | NEUTRAL | 6908-6912 | +1 | Best call. 6910 coupling resolved (wall +18.8, magnet -10.6). Off by 1.1 pts. |
| pred-0226-1509 | 15:09 | NEUTRAL | 6908-6912 | +1 | Held conviction as 6910 magnet tripled. |
| pred-0226-1515 | 15:15 | BEAR | 6900-6908 | 0 | Close 0.89 above target. Overweighted 6895 magnet doubling. |
| pred-0226-1525 | 15:25 | BEAR | 6895-6902 | -1 | Worst call. Chased -58.4 magnet + -42.7 net GEX. Close 6.89 above. |
| pred-0226-1534 | 15:34 | NEUTRAL | 6900-6910 | +1 | Recovered. Competing magnets (6910 vs 6895) → widened range. |

**Key structures:**
- **6910 pin zone:** Wall grew +9→+18.8, then halved to +8.8. CEX magnet at 6910 tripled (-2.5 to -27.8). Coupling reinforced pin at 14:56 — close confirmed at 6908.89.
- **6915 monster resistance:** -18.4→-30.5 GEX amplifier + +15.7 CEX sell wall. VWAP anchored here. Never threatened.
- **6905 amplifier:** Dominant amp (-22.7 to -38.2). CEX FLIP cycle: magnet→sell→magnet→sell. Unstable put-heavy positioning.
- **6895 mega magnet:** CEX exploded from -23.9 to -480 by close. Looked like gravity well but 6900 floor held. Magnitude growth was mechanical, not directional.
- **6900 floor:** Quiet but present. Never broke despite bearish signals above. Actual support that defined the session low.

**Session lesson — CEX magnitude explosion ≠ directional pull (final 30 min):**
After 15:15, 6895 CEX went -23.9 → -53.6 → -58.4 → -100 → -234.5 → -480. Each read screamed "magnet pulling price down." Two bear calls chased this signal. Price closed at 6908.89 — never came within 4 pts of 6895. The 6900 floor (structural wall) held throughout. CEX scales ~2x mechanically in final 30 min via charm acceleration. Magnitude growth reflects gamma mechanics, not new directional flow. **Walls and floors determine the close. Magnets only matter if no structural floor intervenes.**

**Best signal:** 6910 gamma-charm coupling at 14:56 (reinforcing state → pin prediction off by 1.1 pts).
**Worst signal:** Net GEX regime. -20 to -175 = "extremely trending" but session range was ~10 pts. Trending regime + structural pin = contradiction the framework doesn't handle well.

**Scraper reliability:** 3 GEX data corruptions (tab-switch failures), 3 selector timeouts, 0DTE scroll fix partially working (~2 pts lag). Manual spot required for accuracy.

**IC position:** Short 6925C/6935C + Short 6860P/6850P ($1.30 credit). Both sides expired OTM. Full credit captured.

**Patterns to watch:**
- CEX magnitude explosion vs structural floors — 1 data point, strong signal
- Trending GEX regime + pin outcome — contradiction, needs framework handling
- 6910-type coupling resolution as pin predictor — 2 data points now (2/25 6945, 2/26 6910)
- CEX flip cycle at put-heavy strikes — instability pattern, 1 data point
