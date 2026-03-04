# SPX GEX Analyzer

Directional bias indicator for 0DTE SPX options using dealer positioning data from [optionsdepth.com](https://optionsdepth.com). Analyzes GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move to generate BULL/BEAR/NEUTRAL calls with confidence scores and price targets.

Built as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — Claude reads the analytical framework in `SKILL.md` and applies it to live data.

## What It Does

- Fetches live GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com via Puppeteer
- Precomputes mechanical calculations: regime classification, key levels, coupling, velocity
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
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` with your optionsdepth.com login:

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
├── scripts/
│   ├── fetch_data.js        # Puppeteer data fetcher for optionsdepth.com
│   ├── compute.py           # Precompute: regime, levels, coupling, velocity
│   ├── fetch_0dte.js        # Spot/VIX/EM from 0dtespx.com
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

This public repo gives you the v2.5 analytical framework and the MEIC strategy — functional out of the box for GEX-based directional analysis.

The **full framework** drops in on top of this repo and upgrades it with everything below.

### Enhanced Analysis Engine (SKILL.md v2.6+)

The public v2.5 framework covers the core: GEX regime, CEX flows, key levels, VWAP, and synthesis. The full v2.6+ framework adds layers that compound on those basics:

- **Market internals integration** — TICK, ADD, VOLD, TRIN regime scoring with breadth-price divergence detection. Internals confirm or contradict what the Greeks are saying.
- **Shadow model** — a secondary bias computed from CEX path, positioning skew, and VEX direction. When the shadow model disagrees with the primary call, confidence drops. When they agree, it's a higher-conviction setup.
- **Gamma-charm coupling matrix** — maps how GEX walls interact with charm decay at different times of day. A +20K wall at 10 AM behaves differently than the same wall at 3 PM. The matrix captures that.
- **Calibrated signal weights** — base weights adjusted from live prediction tracking. Signals that consistently hit get more weight; signals that miss get less. The framework learns from its own track record.
- **Velocity and decay tracking** — CEX velocity (growing/shrinking/flipped/migrating) and GEX wall integrity (holding/weakening/crumbling) across updates. Tracks how the structure evolves intraday, not just where it sits at a single snapshot.

### Trade Strategies (6+)

Each strategy has defined entry rules, Greeks targets, wing placement logic, adjustment triggers, and exit criteria — all calibrated against GEX/CEX structure:

| Strategy | Description |
|----------|-------------|
| **0DTE Iron Fly** | ATM iron fly with GEX-informed wing placement. Uses wall proximity and CEX barriers to set strikes. |
| **Breakeven IC** | Iron condor structured around breakeven points. Positioned using charm decay curves and positioning skew. |
| **Schwartz IC** | Delta-managed iron condor with systematic adjustment rules at defined thresholds. |
| **MMMM Ride-or-Die** | Momentum-following structure. Enters on confirmed trend with GEX amplifiers, rides until wall or CEX flip. |
| **Crazy Ivan** | Reversal capture strategy. Waits for overextension into negative gamma zones, enters on first sign of mean reversion. |
| **MEIC** | Mechanical entry iron condor (included in public repo). Rule-based, time-of-day filtered. |

### Reference Library

- **Signal theory (concepts.md)** — deep dives on VEX mechanics, positioning profile classification (hedged long, bearish hedge, speculative long, short squeeze setup), Greeks integration patterns, and how signals interact under different vol regimes.
- **Annotated examples (examples.md)** — full session walkthroughs with data snapshots showing how the framework read the structure, what call it made, and what happened. Good and bad calls both included.
- **Live trading lessons (lessons.md)** — confirmed patterns extracted from dozens of live sessions. Gap open behavior, nuclear gamma flips, floor migration, charm acceleration into close, and more. Patterns start as provisional (need 5+ confirming sessions) before promotion to the core framework.

### Schwab API Integration

- **Real-time quotes** — SPX, VIX, and market internals (TICK, ADD, VOLD, TRIN) via Schwab REST API
- **Options chain** — full SPX chain with bid/ask/delta/gamma/theta/vega for strike selection and Greeks targeting
- **Market internals streaming** — WebSocket daemon that streams TICK, ADD, VOLD, TRIN tick-by-tick and polls VIX9D, VIX3M, SKEW every 60s. Writes a rolling 10-minute buffer that the fetcher reads automatically.

### Session Tracking

- **Prediction log** — every directional call logged with signal breakdown. Score with `/feedback` to drive weight calibration.
- **Retrospectives** — end-of-day session summaries. What worked, what missed, what to watch for next time.
- **Trading journal** — full session write-ups with timestamped analysis evolution.

### Setup

The full framework installs as an overlay on this public repo. Clone this repo first, then drop in the framework files — replaces `SKILL.md` (v2.5 → v2.6+) and adds strategy/reference/data files. Everything else (fetcher, compute, scripts) stays the same.

Contact [@shadwhand](https://github.com/shadwhand) for access.

---

## License

MIT
