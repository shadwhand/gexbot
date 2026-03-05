# ─── SPX GEX Analyzer Setup (Windows) ────────────────────────────────
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$EnvFile = Join-Path $ScriptDir "scripts\.env"
$SkillDir = Join-Path $env:USERPROFILE ".claude\skills\spx-gex-analyzer"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  SPX GEX Analyzer - Setup (Windows)" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# ─── Step 1: Node dependencies ───
Write-Host "> Installing Node dependencies..." -ForegroundColor Yellow
Push-Location $ScriptDir
try {
    npm install --silent 2>$null | Out-Null
    Write-Host "  [OK] Node modules installed" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] npm install failed. Is Node.js installed?" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

# ─── Step 2: Python check ───
$python = $null
foreach ($cmd in @("python3", "python")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $python = $cmd
            Write-Host "  [OK] $ver found" -ForegroundColor Green
            break
        }
    } catch {}
}
if (-not $python) {
    Write-Host "  [FAIL] Python 3 not found. Install Python 3.8+ and re-run." -ForegroundColor Red
    exit 1
}

# ─── Step 3: Chrome check ───
$Chrome = $null
$chromePaths = @(
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe")
)
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $Chrome = $path
        break
    }
}
if ($Chrome) {
    Write-Host "  [OK] Chrome found: $Chrome" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Chrome not detected. Puppeteer will try to use its bundled Chromium." -ForegroundColor DarkYellow
}

# ─── Step 4: Environment file ───
Write-Host ""
$SkipEnv = $false
if (Test-Path $EnvFile) {
    Write-Host "> Existing .env found" -ForegroundColor Yellow
    $overwrite = Read-Host "  Overwrite? (y/N)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "  Keeping existing .env" -ForegroundColor Gray
        $SkipEnv = $true
    }
}

if (-not $SkipEnv) {
    Write-Host "> Configuring credentials..." -ForegroundColor Yellow
    Write-Host ""

    # Optionsdepth
    Write-Host "-- Optionsdepth.com (required for GEX/CEX data) --" -ForegroundColor White
    Write-Host "  Login method: 'google' (SSO, recommended) or 'email'"
    $LoginMethod = Read-Host "  LOGIN_METHOD [google]"
    if ([string]::IsNullOrWhiteSpace($LoginMethod)) { $LoginMethod = "google" }

    $OdEmail = ""
    $OdPassword = ""
    if ($LoginMethod -eq "email") {
        $OdEmail = Read-Host "  OD_EMAIL"
        $secPass = Read-Host "  OD_PASSWORD" -AsSecureString
        $OdPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass))
    } else {
        Write-Host "  -> Google SSO: Chrome will open on first run for you to sign in." -ForegroundColor Gray
    }

    # Schwab
    Write-Host ""
    Write-Host "-- Schwab API (optional - provides real-time SPX spot, VIX, EM) --" -ForegroundColor White
    $SchwabAppKey = Read-Host "  SCHWAB_APP_KEY (leave blank to skip)"
    $SchwabSecret = ""
    $SchwabRefreshToken = ""
    if (-not [string]::IsNullOrWhiteSpace($SchwabAppKey)) {
        $SchwabSecret = Read-Host "  SCHWAB_SECRET"
        $SchwabRefreshToken = Read-Host "  SCHWAB_REFRESH_TOKEN"
    }

    # Write .env
    $envContent = @"
# Optionsdepth.com
LOGIN_METHOD=$LoginMethod
OD_EMAIL=$OdEmail
OD_PASSWORD=$OdPassword

# Schwab API (optional - SPX spot, VIX, EM)
SCHWAB_APP_KEY=$SchwabAppKey
SCHWAB_SECRET=$SchwabSecret
SCHWAB_REFRESH_TOKEN=$SchwabRefreshToken
"@
    $envContent | Set-Content -Path $EnvFile -Encoding UTF8 -NoNewline
    Write-Host ""
    Write-Host "  [OK] .env written" -ForegroundColor Green
}

# ─── Step 5: Claude Code skill junction ───
Write-Host ""
Write-Host "> Setting up Claude Code skill junction..." -ForegroundColor Yellow
$skillParent = Split-Path $SkillDir -Parent
if (-not (Test-Path $skillParent)) {
    New-Item -ItemType Directory -Path $skillParent -Force | Out-Null
}

if (Test-Path $SkillDir) {
    $item = Get-Item $SkillDir -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $existingTarget = $item.Target
        if ($existingTarget -eq $ScriptDir) {
            Write-Host "  [OK] Junction already correct: $SkillDir -> $ScriptDir" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Junction exists but points to: $existingTarget" -ForegroundColor DarkYellow
            $updateLink = Read-Host "  Update to $ScriptDir? (y/N)"
            if ($updateLink -eq "y" -or $updateLink -eq "Y") {
                Remove-Item $SkillDir -Force
                New-Item -ItemType Junction -Path $SkillDir -Target $ScriptDir | Out-Null
                Write-Host "  [OK] Junction updated" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "  [WARN] $SkillDir exists but is not a junction. Skipping." -ForegroundColor DarkYellow
    }
} else {
    New-Item -ItemType Junction -Path $SkillDir -Target $ScriptDir | Out-Null
    Write-Host "  [OK] Junction created: $SkillDir -> $ScriptDir" -ForegroundColor Green
}

# ─── Done ───
Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Quick start:" -ForegroundColor White
Write-Host "    npm run fetch        # Fetch data + compute levels"
Write-Host ""
Write-Host "  With Claude Code:" -ForegroundColor White
Write-Host "    claude               # Then use /spx-gex-analyzer"
Write-Host ""
if ($LoginMethod -eq "google" -and -not $SkipEnv) {
    Write-Host "  [NOTE] First run: Chrome will open for Google SSO login." -ForegroundColor DarkYellow
    Write-Host "    Sign in once - session persists after that." -ForegroundColor DarkYellow
    Write-Host ""
}
