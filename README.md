# SPX GEX Analyzer

Directional bias indicator for 0DTE SPX options using dealer positioning data from [optionsdepth.com](https://optionsdepth.com). Analyzes GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move to generate BULL/BEAR/NEUTRAL calls with confidence scores and price targets.

Built as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — Claude reads the analytical framework in `SKILL.md` and applies it to live data.

## What It Does

- Fetches live GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com via Puppeteer
- Fetches real-time SPX spot, VIX, and VIX-derived Expected Move via Schwab API (optional)
- Precomputes mechanical calculations: regime classification, key levels, coupling, velocity, strategy candidates
- Claude analyzes the combined data using a structured framework (regime detection, key levels, flow analysis, synthesis)
- Outputs a structured directional call with targets, stops, and confidence rating
- Tracks prediction accuracy and adjusts signal weights over time

## Requirements

- [optionsdepth.com](https://optionsdepth.com) subscription (data source)
- Node.js 18+
- Python 3.8+
- Google Chrome installed
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for auto-fetch) or a Claude Pro/Team subscription (for manual use)

---

## Option A: Claude Code Skill (Recommended)

Auto-fetches live data during market hours. Claude runs the data fetcher, computes levels, and analyzes — all from a single command.

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (Anthropic's CLI tool).

### 1. Clone and install

```bash
git clone https://github.com/shadwhand/gexbot.git
cd gexbot
bash setup.sh    # Interactive setup (macOS/Linux)
# or: powershell -ExecutionPolicy Bypass -File setup.ps1   (Windows)
```

The setup script installs dependencies, configures credentials, and creates the Claude Code skill symlink.

**Or manually:**

```bash
npm install
cp .env.example scripts/.env
```

Edit `scripts/.env` with your optionsdepth.com login:

**Google SSO (default):** Set `LOGIN_METHOD=google`. The first time the fetcher runs, Chrome opens and waits for you to sign in via Google. After that, the session persists in `.chrome-data-profile/` and subsequent runs auto-login. You do **not** need `OD_EMAIL` or `OD_PASSWORD`.

**Email/password:** Set `LOGIN_METHOD=email` and fill in `OD_EMAIL` and `OD_PASSWORD`.

### 3. Register as a skill

Open (or create) your Claude Code settings file:

- **Global** (available in all projects): `~/.claude/settings.json`
- **Project-specific**: `.claude/settings.json` in your project root

Add the skill path:

```json
{
  "skills": [
    "/absolute/path/to/gexbot"
  ]
}
```

The path must be absolute (e.g., `/Users/you/gexbot`, not `~/gexbot`). Claude Code reads the `SKILL.md` file from this directory on every invocation.

### 4. Run it

Launch Claude Code and type:

```
/spx-gex-analyzer
```

Claude will:
1. Run `npm run fetch` to fetch data from optionsdepth.com and compute precompute.json
2. Read the output data
3. Apply the analytical framework from SKILL.md
4. Output a structured directional call with targets, stops, and confidence

You can also provide VWAP and VIX manually in your message for a more complete analysis.

### 5. First run

The first run opens a visible Chrome window. If using Google SSO, sign in manually — the session saves for future runs. After that, fetches run without interaction.

---

## Option B: Claude Project (No CLI Required)

Use the framework inside a [Claude Project](https://claude.ai) on claude.ai. No auto-fetch — you paste data from optionsdepth.com manually.

Requires a Claude Pro or Team subscription.

### 1. Create a project

Go to [claude.ai](https://claude.ai) → Projects → New Project. Name it whatever you want (e.g., "SPX GEX Analyzer").

### 2. Add the framework to Project Knowledge

In your project settings, open **Project Knowledge** and add the following files as documents:

1. **`SKILL.md`** — the core analytical framework. Add this first. Copy the entire contents of the file and paste it as a new knowledge document.
2. **`data/meic.md`** (optional) — the MEIC iron condor strategy. Add if you trade iron condors.

That's it. Claude will reference these documents automatically in every conversation within the project.

### 3. Use it

Start a new conversation in the project and paste your data. Go to optionsdepth.com, open the SPX table view, and copy the GEX/CEX/DEX/VEX/Positioning columns. Paste them into the chat along with:

- **Current spot price** (from your broker or 0dtespx.com)
- **VWAP** (from your charting platform)
- **VIX** (optional, enables VEX analysis)
- **Expected Move** (optional, from 0dtespx.com or your broker)

Claude reads the SKILL.md framework from Project Knowledge and generates the same structured analysis — directional call, target range, stop level, confidence score, and signal breakdown.

### 4. Tips

- Copy the full table, not just a few rows. The framework needs strikes ±50 pts from spot to identify walls, magnets, and amplifiers.
- Include the column headers so Claude can parse which column is GEX vs CEX vs DEX.
- For updates during the session, paste the new data in the same conversation. Claude will compare against the prior snapshot and track velocity/decay.

---

## Option C: Manual Use (Any Claude Interface)

Use the framework with any Claude interface — Claude.ai free tier, API, or third-party apps. You run the data pipeline manually and paste the output.

### 1. Clone and set up

```bash
git clone https://github.com/shadwhand/gexbot.git
cd gexbot
bash setup.sh
```

### 2. Fetch data

```bash
npm run fetch
```

This opens Chrome, logs into optionsdepth.com, extracts GEX/CEX/DEX/VEX/Positioning, fetches spot/VIX (via Schwab if configured, otherwise 0dtespx.com), and runs `compute.py` to generate `data/precompute.json`.

### 3. Paste into Claude

Copy the contents of `data/precompute.json` and paste it into any Claude conversation along with the contents of `SKILL.md`. Claude will apply the framework and generate the directional analysis.

For updates during the session, re-run `npm run fetch` and paste the new `precompute.json`.

---

## Chrome Profile Setup

The data fetcher uses a dedicated Chrome profile to avoid conflicts with your main browser session.

**Default behavior:** A `.chrome-data-profile/` directory is auto-created in the repo root. This works out of the box.

**Using an existing profile:** If you need Google SSO and want to reuse an existing login:

1. Find your Chrome profiles:
   - **macOS:** `ls ~/Library/Application\ Support/Google/Chrome/`
   - **Linux:** `ls ~/.config/google-chrome/`
   - **Windows:** `dir %LOCALAPPDATA%\Google\Chrome\User Data\`

2. Set in `.env`:
   ```
   CHROME_PROFILE_PATH=/path/to/your/chrome/profile
   ```

**Note:** Close Chrome before running the fetcher if using your main profile, or you'll get a "user data directory already in use" error.

---

## NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `fetch` | `npm run fetch` | Fetch OD data + compute precompute.json |
| `fetch:aggregate` | `npm run fetch:aggregate` | Fetch with all-expiry sum (pre-market) |
| `compute` | `npm run compute` | Re-run compute.py on existing data |
| `fetch:0dte` | `npm run fetch:0dte` | Fetch spot/VIX/EM from 0dtespx.com |
| `reset-cookies` | `npm run reset-cookies` | Clear session cookies |

---

## File Structure

```
├── SKILL.md                 # Core analytical framework v2.5 (loaded every invocation)
├── .env.example             # Config template
├── setup.sh                 # Interactive setup (macOS/Linux)
├── setup.ps1                # Interactive setup (Windows)
├── scripts/
│   ├── fetch_data.js        # Puppeteer data fetcher for optionsdepth.com
│   ├── schwab.js            # Schwab API client (SPX spot, VIX, EM)
│   ├── compute.py           # Precompute: regime, levels, shadow model, strategy candidates
│   ├── fetch_0dte.js        # Spot/VIX/EM from 0dtespx.com (fallback)
│   ├── fetch_chain.py       # Options chain via yfinance (bid/ask/delta/volume)
│   └── scheduler.js         # Auto-fetch scheduler
├── data/
│   └── meic.md              # MEIC iron condor strategy rules
```

## Prediction Tracking

After each analysis, Claude logs predictions to `data/predictions.json`. Score them with:

```
/feedback [prediction-id] +1|0|-1
```

After 5+ scored predictions, signal weights auto-adjust based on hit rates. The system learns which signals are most predictive for current market conditions.

---

## Full Framework

The public repo covers the core analytical engine, data pipeline, and MEIC strategy. The **[full framework](https://github.com/shadwhand/gexbot-framework)** (v3.0) takes it further.

### What's new in v3.0

**The indicator knows what time it is.** Calls no longer target the close from 9:30 AM. Six time windows — each with its own CEX/GEX weight curve modeled on how 0DTE charm actually decays — scope the call to the current market phase. The last 15 minutes get their own window because that's when levered ETF rebalancing and MOC orders override everything else.

**Every strategy adapts to your risk tolerance.** All 10+ strategy generators produce Conservative, Normal, and Aggressive candidates with strike selection that accounts for GEX structure, expected move, and ATR bands. One command, three tiers.

**Macro regime awareness.** The framework tracks vol regime, cross-asset stress, and geopolitical catalysts with built-in staleness decay. It knows when its own data is getting stale and downgrades accordingly.

**Automated execution.** A scheduler loop pulls data, confirms internals, and places METF trend-following spreads — limit orders with retry, logging, and notifications. The Schwab integration handles the full lifecycle: order placement, exit brackets, live dashboard, EOD sweep.

### Also in the full framework

- Shadow model that independently validates every call
- 31 live trading lessons with pattern-matching triggers
- VVIX/VIX ratio framework, VIX decomposition, vol beta coiled spring detection
- Standardized level vocabulary across all output (floors, ceilings, trap doors, flip zones)
- Window-based prediction scoring — calls graded against the right timeframe, not just the close
- Streaming daemon for real-time TICK, ADD, VOLD, TRIN, VIX term structure, and 0DTE chain

Contact [@shadwhand](https://github.com/shadwhand) for access.

---

## License

MIT
