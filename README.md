# SPX GEX Analyzer

Directional bias indicator for 0DTE SPX options using dealer positioning data from [optionsdepth.com](https://optionsdepth.com). Analyzes GEX, CEX, DEX, VEX, Positioning, VWAP, and Expected Move to generate BULL/BEAR/NEUTRAL calls with confidence scores and price targets.

Built as a [Claude Code skill](https://docs.anthropic.com/en/docs/claude-code/skills) — Claude reads the analytical framework in `SKILL.md` and applies it to live data.

## What It Does

- Scrapes live GEX/CEX/DEX/VEX/Positioning data from optionsdepth.com via Puppeteer
- Claude analyzes the data using a 9-step framework (regime detection, key levels, flow analysis, gamma-charm coupling, synthesis)
- Outputs a structured directional call with targets, stops, and confidence rating
- Tracks prediction accuracy and adjusts signal weights over time

---

## Prerequisites

Install these before starting. If you already have them, skip to [Download & Install](#download--install).

### 1. Google Chrome

Download and install from [google.com/chrome](https://www.google.com/chrome/). The scraper uses Chrome to log in to optionsdepth.com.

### 2. Node.js (v18 or newer)

Download the **LTS** version from [nodejs.org](https://nodejs.org/). Run the installer and accept all defaults.

To verify it installed correctly, open a terminal and run:

```
node --version
```

You should see something like `v20.11.0` or higher. If you get "command not found" or "not recognized", restart your terminal and try again.

> **How to open a terminal:**
> - **Windows**: Press `Win + R`, type `cmd`, press Enter. Or search "Command Prompt" in the Start menu.
> - **Mac**: Press `Cmd + Space`, type "Terminal", press Enter.
> - **Linux**: Press `Ctrl + Alt + T`, or find Terminal in your applications menu.

### 3. optionsdepth.com subscription

Sign up at [optionsdepth.com](https://optionsdepth.com). You need an active subscription for the scraper to pull data.

### 4. Claude (one of the following)

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — for auto-fetch integration (recommended)
- [Claude Pro or Team](https://claude.ai) — for manual data pasting (no auto-fetch)

---

## Download & Install

### Option A: Using Git (if you have it)

```bash
git clone https://github.com/shadwhand/gexbot.git
cd gexbot
npm install
```

### Option B: Download ZIP (no Git needed)

1. Go to [github.com/shadwhand/gexbot](https://github.com/shadwhand/gexbot)
2. Click the green **Code** button, then click **Download ZIP**
3. Extract (unzip) the downloaded file

4. **Find the right folder.** Open the extracted folder in your file manager. You need to be in the folder that contains `package.json`, `README.md`, and a `scripts/` folder. If you see another folder inside (like `gexbot-main`), open **that** folder — that's the one you want.

5. **Open a terminal in that folder:**
   - **Windows**: Open the folder in File Explorer, click the address bar at the top, type `cmd`, and press Enter. A Command Prompt window will open in the correct folder.
   - **Mac**: Right-click the folder in Finder, then select **Services** > **New Terminal at Folder**. (Or open Terminal and type `cd ` then drag the folder into the Terminal window and press Enter.)
   - **Linux**: Right-click inside the folder and select **Open Terminal Here**.

6. **Install dependencies** by running this command:

   ```
   npm install
   ```

   This will take a minute. When it finishes, you should see a `node_modules/` folder appear inside the project folder. That means it worked.

---

## Configure Credentials

You need to create a settings file with your optionsdepth.com login.

### 1. Copy the example file

**Mac / Linux:**
```bash
cp scripts/.env.example scripts/.env
```

**Windows (Command Prompt):**
```cmd
copy scripts\.env.example scripts\.env
```

**Windows (PowerShell):**
```powershell
Copy-Item scripts\.env.example scripts\.env
```

### 2. Edit the settings file

Open `scripts/.env` in any text editor (Notepad, VS Code, TextEdit, etc.) and fill in your login method:

**If you log in to optionsdepth with Google:**
```
LOGIN_METHOD=google
```
That's it — the scraper will open Chrome and let you sign in manually the first time.

**If you log in with email and password:**
```
LOGIN_METHOD=email
OD_EMAIL=your@email.com
OD_PASSWORD=yourpassword
```

All other settings in the file are optional — the defaults work fine for most users.

---

## Setup: Claude Code (Recommended)

Auto-fetches data during market hours. Full skill integration.

### 1. Add as a Claude Code skill

Add the path to your `gexbot` folder in your Claude Code settings file. The settings file is at:

- **Mac / Linux**: `~/.claude/settings.json`
- **Windows**: `C:\Users\YourName\.claude\settings.json`

Add this (use the actual path to where you put gexbot):

```json
{
  "skills": [
    "/path/to/gexbot"
  ]
}
```

**Example paths:**
- Mac: `"/Users/yourname/gexbot"`
- Windows: `"C:\\Users\\YourName\\Downloads\\gexbot"` (note the double backslashes)
- Linux: `"/home/yourname/gexbot"`

### 2. Use it

In Claude Code, type:
```
/spx-gex-analyzer
```

Claude will auto-fetch data from optionsdepth.com, then analyze it. Provide VWAP and VIX manually for full analysis.

---

## Setup: Regular Claude (Manual)

No auto-fetch — you paste data manually.

### 1. Create a Claude Project

Go to [claude.ai](https://claude.ai) > Projects > New Project.

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

## Optional: Schwab API for Auto Spot/VIX/EM

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

> **Windows note:** Your firewall may ask to allow Node.js access. Click **Allow** — this is needed for the OAuth callback on localhost.

---

## Fetch Flags

```bash
npm run fetch                          # Standard 0DTE fetch
npm run fetch -- --aggregate           # Sum all expiration columns
npm run fetch -- --date 2026-03-14     # Target specific expiration
npm run fetch -- --skip-schwab         # Skip Schwab, use 0dtespx only
npm run fetch -- --skip-0dte           # Skip 0dtespx fallback
```

Strike range is auto-computed from spot +/- 2x EM. Override with `STRIKE_FLOOR`/`STRIKE_CEIL` in `.env`.

---

## Chrome Profile

Chrome user data directory is auto-detected on macOS, Linux, and Windows. Override with `CHROME_PROFILE_PATH` in `.env` if needed.

**Note:** Close all Chrome windows before running the scraper if using your main profile, or you'll get a "user data directory already in use" error.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `npm: command not found` or `npm is not recognized` | Node.js isn't installed | Install from [nodejs.org](https://nodejs.org/), then **restart your terminal** |
| `ENOENT: no such file or directory, open '.../package.json'` | You're in the wrong folder | Navigate into the folder that contains `package.json` (see [step 4](#option-b-download-zip-no-git-needed) above) |
| `Could not find Chrome` | Chrome not installed or in a non-standard location | Install Chrome, or set `CHROME_PROFILE_PATH` in `.env` |
| `user data directory is already in use` | Chrome is open | Close **all** Chrome windows, then try again |
| `ERR_CONNECTION_REFUSED` during Schwab auth | Firewall blocking localhost | Allow Node.js through your firewall |
| `Cannot find module` after npm install | Incomplete install | Delete the `node_modules` folder and run `npm install` again |

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
