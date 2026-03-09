# SPX GEX Analyzer

Directional bias indicator for 0DTE SPX options using dealer positioning data from [optionsdepth.com](https://optionsdepth.com). Analyzes GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move to generate BULL/BEAR/NEUTRAL calls with confidence scores and price targets.

Built as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — Claude reads the analytical framework in `SKILL.md` and applies it to live data.

## What It Does

- Scrapes live GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com via Puppeteer
- Claude analyzes the data using a 9-step framework (regime detection, key levels, flow analysis, gamma-charm coupling, synthesis)
- Outputs a structured directional call with targets, stops, and confidence rating
- Tracks prediction accuracy and adjusts signal weights over time

## Requirements

- [optionsdepth.com](https://optionsdepth.com) subscription (data source)
- Node.js 18+
- Google Chrome installed
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for auto-fetch) or a Claude Pro/Team subscription (for manual use)

---

## Install — Claude Code (Recommended)

Auto-fetches data during market hours. Full skill integration.

### 1. Clone and install

```bash
git clone https://github.com/shadwhand/gexbot.git
cd gexbot
npm install
```

### 2. Configure credentials

```bash
cp scripts/.env.example scripts/.env
# Edit scripts/.env with your optionsdepth.com login
```

### 3. Add as a Claude Code skill

Add to your Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "skills": [
    "/path/to/gexbot"
  ]
}
```

### 4. Use it

In Claude Code:
```
/spx-gex-analyzer
```

Claude will auto-fetch data from optionsdepth.com, then analyze it. Provide VWAP and VIX manually for full analysis.

---

## Install — Regular Claude (Projects)

No auto-fetch. Paste data manually.

### 1. Create a Claude Project

Go to [claude.ai](https://claude.ai) → Projects → New Project.

### 2. Add the framework

Copy the contents of these files into Project Knowledge:

- `SKILL.md` — the full analytical framework (add as the primary document)
- `reference/concepts.md` — detailed signal theory
- `data/strategies.md` — trade structure reference
- `data/meic.md` — MEIC strategy rules

Optionally add `reference/lessons.md` and `reference/examples.md` for pattern context.

### 3. Use it

Paste GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com's table view into the chat. Include VWAP and VIX if available. Claude will apply the framework and generate the analysis.

---

### Optional: Schwab API for Auto Spot/VIX/EM

The scraper can auto-fetch SPX spot, VIX, and Expected Move from Schwab's API. Without Schwab, it falls back to scraping 0dtespx.com.

1. Register at [developer.schwab.com](https://developer.schwab.com)
2. Add credentials to `scripts/.env`:
   ```
   SCHWAB_APP_KEY=your_app_key
   SCHWAB_SECRET=your_secret
   SCHWAB_CALLBACK_URL=https://127.0.0.1:5556
   ```
3. Run `npx schwab-authorize` and follow the prompts
4. Copy `SCHWAB_REFRESH_TOKEN` to `scripts/.env`

Token expires every 7 days — re-run `npx schwab-authorize` to refresh.

### Fetch Flags

```bash
npm run fetch                          # Standard 0DTE fetch
npm run fetch -- --aggregate           # Sum all expiration columns
npm run fetch -- --date 2026-03-14     # Target specific expiration
npm run fetch -- --skip-schwab         # Skip Schwab, use 0dtespx only
npm run fetch -- --skip-0dte           # Skip 0dtespx fallback
```

Strike range is auto-computed from spot ± 2×EM. Override with `STRIKE_FLOOR`/`STRIKE_CEIL` in `.env`.

---

## Chrome Profile Setup

Chrome user data directory is auto-detected on macOS, Linux, and Windows. Override with `CHROME_PROFILE_PATH` in `.env` if needed.

**Note:** Close Chrome before running the scraper if using your main profile, or you'll get a "user data directory already in use" error.

---

## File Structure

```
├── SKILL.md                 # Core analytical framework (loaded every invocation)
├── scripts/
│   ├── fetch_data.js        # Optionsdepth scraper (GEX/CEX/DEX/VEX/Position)
│   ├── fetch_0dte.js        # Fallback spot/EM from 0dtespx.com
│   ├── schwab-lite.js       # Schwab API client (spot/VIX/EM only)
│   └── .env.example         # Configuration template
├── reference/
│   ├── concepts.md          # Detailed signal theory (loaded on demand)
│   ├── examples.md          # Annotated session examples
│   └── lessons.md           # Confirmed patterns from live trading
├── data/
│   ├── predictions.json     # Prediction tracking + signal weight calibration
│   ├── retrospectives.md    # Recent session summaries
│   ├── strategies.md        # Trade structure reference
│   └── meic.md              # MEIC iron condor strategy rules
```

## Prediction Tracking

After each analysis, Claude logs predictions to `data/predictions.json`. Score them with:

```
/feedback [prediction-id] +1|0|-1
```

After 5+ scored predictions, signal weights auto-adjust based on hit rates. The system learns which signals are most predictive for current market conditions.

## Keeping the Skill Compact

`SKILL.md` is loaded into context every invocation. Reference and data files are loaded on demand. As you use the skill and accumulate learnings, files grow — and that costs tokens.

- **SKILL.md** — rules, tables, short-form. Prose explanations belong in `concepts.md`.
- **retrospectives.md** — grows fastest. After extracting lessons to `lessons.md` and examples to `examples.md`, compress each session to a 2-3 line summary. Archive sessions older than 5 trading days.
- **lessons.md** — tag entries promoted to SKILL.md so you don't re-derive them.
- **concepts.md** — should add detail SKILL.md doesn't have, not restate it.
- **predictions.json** — keep only the last 20 entries. Adjusted weights carry forward.

Target: SKILL.md under ~200 lines. Everything else loaded only when needed.

## Disclaimer

This software is provided for **educational and informational purposes only**. Nothing generated by this tool — including directional calls, price targets, confidence scores, trade candidates, or strategy suggestions — constitutes financial advice, investment advice, or a recommendation to buy, sell, or hold any security or financial instrument.

Trading options, particularly 0DTE options, involves substantial risk of loss and is not suitable for all investors. Past performance of predictions or strategies does not guarantee future results. You should consult with a qualified financial advisor before making any investment decisions.

The authors and contributors of this project are not registered financial advisors, broker-dealers, or investment professionals. Use this tool at your own risk.

## License

MIT
