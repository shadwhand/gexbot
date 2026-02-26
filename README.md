# SPX GEX Analyzer

Directional bias indicator for 0DTE SPX options using dealer positioning data from [optionsdepth.com](https://optionsdepth.com). Analyzes GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move to generate BULL/BEAR/NEUTRAL calls with confidence scores and price targets.

Built as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — Claude reads the analytical framework in `SKILL.md` and applies it to live data.

## What It Does

- Scrapes live GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com via Puppeteer
- Claude analyzes the data using a 10-step framework (regime detection, key levels, flow analysis, gamma-charm coupling, synthesis)
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

## Chrome Profile Setup

The scraper uses a dedicated Chrome profile to avoid conflicts with your main browser session.

**Default behavior:** A `.chrome-scraper-profile/` directory is auto-created in the repo root. This works out of the box.

**Using an existing profile:** If you need Google SSO and want to reuse an existing login:

1. Find your Chrome profiles:
   - **macOS:** `ls ~/Library/Application\ Support/Google/Chrome/`
   - **Linux:** `ls ~/.config/google-chrome/`
   - **Windows:** `dir %LOCALAPPDATA%\Google\Chrome\User Data\`

2. Set in `scripts/.env`:
   ```
   CHROME_PROFILE_PATH=/path/to/your/chrome/profile
   ```

**Note:** Close Chrome before running the scraper if using your main profile, or you'll get a "user data directory already in use" error.

---

## File Structure

```
├── SKILL.md                 # Core analytical framework (loaded every invocation)
├── scripts/
│   ├── fetch_data.js        # Puppeteer scraper for optionsdepth.com
│   ├── fetch_chain.py       # Options chain via yfinance (bid/ask/delta/volume)
│   └── .env.example         # Config template
├── reference/
│   ├── concepts.md          # Detailed signal theory (loaded on demand)
│   ├── examples.md          # Annotated session examples
│   ├── lessons.md           # Confirmed patterns from live trading
│   └── retrospectives_archive.md  # Older session history
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

## License

MIT
