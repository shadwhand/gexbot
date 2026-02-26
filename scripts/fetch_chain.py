#!/usr/bin/env python3
"""Fetch SPX 0DTE options chain via yfinance, filter by delta, save JSON."""

import argparse
import json
import math
import sys
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from scipy.stats import norm

RISK_FREE = 0.0     # negligible for 0DTE
SAFETY_CAP = 200    # hard cap ± pts to prevent runaway fetches


def black_scholes_delta(spot, strike, iv, t_years, option_type):
    """Compute BS delta. t_years = fraction of year remaining."""
    if iv <= 0 or t_years <= 0:
        if option_type == "call":
            return 1.0 if spot > strike else 0.0
        return -1.0 if spot < strike else 0.0
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (RISK_FREE + iv**2 / 2) * t_years) / (iv * sqrt_t)
    if option_type == "call":
        return round(norm.cdf(d1), 4)
    return round(norm.cdf(d1) - 1, 4)


def time_to_expiry_years(expiry_str):
    """Fraction of year remaining until 4:00 PM ET close."""
    now = datetime.now(timezone.utc)
    close = datetime.strptime(expiry_str, "%Y-%m-%d").replace(
        hour=20, minute=0, tzinfo=timezone.utc
    )
    remaining = (close - now).total_seconds()
    if remaining <= 0:
        return 0.0
    return remaining / (365.25 * 24 * 3600)


def fetch_chain(spot_override=None, delta_min=0.03, em=None):
    spx = yf.Ticker("^SPX")

    # Spot price
    if spot_override:
        spot = float(spot_override)
    else:
        info = spx.fast_info
        spot = info.last_price
    print(f"Spot: {spot}")

    # Strike bounds: safety cap, narrowed by EM if provided
    cap = SAFETY_CAP
    if em is not None:
        cap = min(cap, em + 25)
    lo, hi = spot - cap, spot + cap

    # Find today's expiry (0DTE)
    expirations = spx.options
    today_str = datetime.now().strftime("%Y-%m-%d")
    if today_str not in expirations:
        today_str = expirations[0] if expirations else None
        if not today_str:
            print("No expirations available")
            sys.exit(1)
        print(f"No 0DTE found, using nearest: {today_str}")

    print(f"Expiry: {today_str}")
    chain = spx.option_chain(today_str)
    t_years = time_to_expiry_years(today_str)
    print(f"Time to expiry: {t_years * 365.25 * 24:.1f} hours")

    def process(df, option_type):
        rows = []
        for _, r in df.iterrows():
            k = r["strike"]
            if k < lo or k > hi:
                continue

            def safe_float(val, default=0):
                if pd.isna(val):
                    return default
                return float(val)

            def safe_int(val, default=0):
                if pd.isna(val):
                    return default
                return int(val)

            iv = safe_float(r.get("impliedVolatility", 0))
            bid = safe_float(r.get("bid", 0))
            ask = safe_float(r.get("ask", 0))
            mid = round((bid + ask) / 2, 2)
            delta = black_scholes_delta(spot, k, iv, t_years, option_type)

            # Delta filter: keep strikes where |delta| >= threshold
            if abs(delta) < delta_min:
                continue

            rows.append({
                "strike": k,
                "bid": bid,
                "ask": ask,
                "mid": mid,
                "iv": round(iv, 4),
                "delta": delta,
                "volume": safe_int(r.get("volume", 0)),
                "oi": safe_int(r.get("openInterest", 0)),
            })
        rows.sort(key=lambda x: x["strike"])
        return rows

    calls = process(chain.calls, "call")
    puts = process(chain.puts, "put")

    result = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "spot": spot,
        "expiry": today_str,
        "delta_min": delta_min,
        "calls": calls,
        "puts": puts,
    }

    out_path = "latest_chain.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Wrote {len(calls)} calls, {len(puts)} puts to {out_path}")
    print(f"Delta filter: |delta| >= {delta_min}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch SPX 0DTE chain filtered by delta")
    parser.add_argument("--spot", type=float, help="Override spot price")
    parser.add_argument("--delta-min", type=float, default=0.03,
                        help="Min |delta| to include (default: 0.03)")
    parser.add_argument("--em", type=float,
                        help="Expected move; caps range to spot ± (EM + 25)")
    args = parser.parse_args()
    fetch_chain(spot_override=args.spot, delta_min=args.delta_min, em=args.em)
