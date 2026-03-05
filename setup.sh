#!/usr/bin/env bash
set -euo pipefail

# ─── SPX GEX Analyzer Setup ───────────────────────────────────────────
# Run: bash setup.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/scripts/.env"
SKILL_DIR="$HOME/.claude/skills/spx-gex-analyzer"

echo "═══════════════════════════════════════════"
echo "  SPX GEX Analyzer — Setup"
echo "═══════════════════════════════════════════"
echo ""

# ─── Step 1: Node dependencies ───
echo "▸ Installing Node dependencies..."
cd "$SCRIPT_DIR"
npm install --silent 2>/dev/null
echo "  ✓ Node modules installed"

# ─── Step 2: Python check ───
if command -v python3 &>/dev/null; then
  PY_VER=$(python3 --version 2>&1)
  echo "  ✓ $PY_VER found"
else
  echo "  ✗ Python 3 not found. Install Python 3.8+ and re-run."
  exit 1
fi

# ─── Step 3: Chrome check ───
CHROME=""
if [[ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif command -v google-chrome &>/dev/null; then
  CHROME="$(command -v google-chrome)"
elif command -v chromium-browser &>/dev/null; then
  CHROME="$(command -v chromium-browser)"
fi

if [[ -n "$CHROME" ]]; then
  echo "  ✓ Chrome found: $CHROME"
else
  echo "  ⚠ Chrome not detected. Puppeteer will try to use its bundled Chromium."
fi

# ─── Step 4: Environment file ───
echo ""
if [[ -f "$ENV_FILE" ]]; then
  echo "▸ Existing .env found"
  read -rp "  Overwrite? (y/N): " OVERWRITE
  if [[ "$OVERWRITE" != "y" && "$OVERWRITE" != "Y" ]]; then
    echo "  Keeping existing .env"
    SKIP_ENV=true
  else
    SKIP_ENV=false
  fi
else
  SKIP_ENV=false
fi

if [[ "${SKIP_ENV:-false}" == "false" ]]; then
  echo "▸ Configuring credentials..."
  echo ""

  # Optionsdepth
  echo "── Optionsdepth.com (required for GEX/CEX data) ──"
  echo "  Login method: 'google' (SSO, recommended) or 'email'"
  read -rp "  LOGIN_METHOD [google]: " LOGIN_METHOD
  LOGIN_METHOD="${LOGIN_METHOD:-google}"

  OD_EMAIL=""
  OD_PASSWORD=""
  if [[ "$LOGIN_METHOD" == "email" ]]; then
    read -rp "  OD_EMAIL: " OD_EMAIL
    read -rsp "  OD_PASSWORD: " OD_PASSWORD
    echo ""
  else
    echo "  → Google SSO: Chrome will open on first run for you to sign in."
  fi

  # Schwab
  echo ""
  echo "── Schwab API (optional — provides real-time SPX spot, VIX, EM) ──"
  read -rp "  SCHWAB_APP_KEY (leave blank to skip): " SCHWAB_APP_KEY
  SCHWAB_SECRET=""
  SCHWAB_REFRESH_TOKEN=""
  if [[ -n "$SCHWAB_APP_KEY" ]]; then
    read -rp "  SCHWAB_SECRET: " SCHWAB_SECRET
    read -rp "  SCHWAB_REFRESH_TOKEN: " SCHWAB_REFRESH_TOKEN
  fi

  # Write .env
  cat > "$ENV_FILE" <<ENVEOF
# Optionsdepth.com
LOGIN_METHOD=$LOGIN_METHOD
OD_EMAIL=$OD_EMAIL
OD_PASSWORD=$OD_PASSWORD

# Schwab API (optional — SPX spot, VIX, EM)
SCHWAB_APP_KEY=$SCHWAB_APP_KEY
SCHWAB_SECRET=$SCHWAB_SECRET
SCHWAB_REFRESH_TOKEN=$SCHWAB_REFRESH_TOKEN
ENVEOF

  echo ""
  echo "  ✓ .env written"
fi

# ─── Step 5: Claude Code skill symlink ───
echo ""
echo "▸ Setting up Claude Code skill symlink..."
mkdir -p "$HOME/.claude/skills"
if [[ -L "$SKILL_DIR" ]]; then
  EXISTING_TARGET="$(readlink "$SKILL_DIR")"
  if [[ "$EXISTING_TARGET" == "$SCRIPT_DIR" ]]; then
    echo "  ✓ Symlink already correct: $SKILL_DIR → $SCRIPT_DIR"
  else
    echo "  ⚠ Symlink exists but points to: $EXISTING_TARGET"
    read -rp "  Update to $SCRIPT_DIR? (y/N): " UPDATE_LINK
    if [[ "$UPDATE_LINK" == "y" || "$UPDATE_LINK" == "Y" ]]; then
      rm "$SKILL_DIR"
      ln -s "$SCRIPT_DIR" "$SKILL_DIR"
      echo "  ✓ Symlink updated"
    fi
  fi
elif [[ -e "$SKILL_DIR" ]]; then
  echo "  ⚠ $SKILL_DIR exists but is not a symlink. Skipping."
else
  ln -s "$SCRIPT_DIR" "$SKILL_DIR"
  echo "  ✓ Symlink created: $SKILL_DIR → $SCRIPT_DIR"
fi

# ─── Done ───
echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Quick start:"
echo "    npm run fetch        # Fetch data + compute levels"
echo ""
echo "  With Claude Code:"
echo "    claude               # Then use /spx-gex-analyzer"
echo ""
if [[ "$LOGIN_METHOD" == "google" ]]; then
  echo "  ⚠ First run: Chrome will open for Google SSO login."
  echo "    Sign in once — session persists after that."
  echo ""
fi
