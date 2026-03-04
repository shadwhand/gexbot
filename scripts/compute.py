#!/usr/bin/env python3
"""SPX GEX Analyzer — precompute mechanical calculations from latest_data.json.

Reads latest_data.json, computes all framework metrics, diffs against prior
snapshot for velocity tracking. Outputs structured JSON + formatted summary.

Usage:
    python3 compute.py                  # normal run
    python3 compute.py --json           # JSON only (for piping)
    python3 compute.py --no-save        # don't save snapshot (dry run)
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
DATA_FILE = SKILL_DIR / "latest_data.json"
SNAPSHOT_FILE = SKILL_DIR / "data" / "prior_snapshot.json"
OUTPUT_FILE = SKILL_DIR / "data" / "precompute.json"

MARKET_CLOSE_ET = 16 * 60  # 16:00 ET in minutes


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def rows_to_dict(rows):
    """Convert [{strike, value}, ...] to {strike: float_value}."""
    return {r["strike"]: float(r["value"]) for r in rows}


def time_remaining_min(time_et_str):
    """Minutes remaining until 16:00 ET."""
    parts = time_et_str.split(":")
    h, m = int(parts[0]), int(parts[1])
    now_min = h * 60 + m
    return max(0, MARKET_CLOSE_ET - now_min)


def time_weight(minutes_left):
    """CEX/GEX weights based on time remaining."""
    if minutes_left > 180:
        return 0.40, 0.60
    elif minutes_left > 120:
        return 0.55, 0.45
    elif minutes_left > 60:
        return 0.70, 0.30
    elif minutes_left > 30:
        return 0.85, 0.15
    else:
        return 0.95, 0.05


def classify_regime(net_gex):
    if net_gex > 5:
        return "mean-reverting"
    elif net_gex < -5:
        return "trending"
    else:
        return "mixed"


def find_gamma_flips(gex_dict, spot):
    """Find strikes where GEX crosses zero (sorted by proximity to spot)."""
    strikes = sorted(gex_dict.keys())
    flips = []
    for i in range(len(strikes) - 1):
        s1, s2 = strikes[i], strikes[i + 1]
        v1, v2 = gex_dict[s1], gex_dict[s2]
        if v1 * v2 < 0:
            # Linear interpolation
            frac = abs(v1) / (abs(v1) + abs(v2))
            flip_strike = s1 + frac * (s2 - s1)
            direction = "neg→pos" if v1 < 0 else "pos→neg"
            flips.append({
                "between": [s1, s2],
                "approx": round(flip_strike, 1),
                "direction": direction,
            })
    flips.sort(key=lambda f: abs(f["approx"] - spot))
    return flips


def find_equilibrium(metric_dict, spot):
    """Find CEX zero-crossing (suppress→support transition) nearest spot."""
    strikes = sorted(metric_dict.keys())
    crossings = []
    for i in range(len(strikes) - 1):
        s1, s2 = strikes[i], strikes[i + 1]
        v1, v2 = metric_dict[s1], metric_dict[s2]
        if v1 * v2 < 0:
            frac = abs(v1) / (abs(v1) + abs(v2))
            cross = s1 + frac * (s2 - s1)
            crossings.append(round(cross, 1))
    if not crossings:
        return None
    crossings.sort(key=lambda c: abs(c - spot))
    return crossings[0]


def coupling_state(gex_val, cex_val):
    """Classify gamma-charm coupling at a strike."""
    if gex_val < 0 and cex_val < 0:
        return "reinforcing_support"
    elif gex_val < 0 and cex_val > 0:
        return "reinforcing_resistance"
    elif gex_val > 0 and cex_val > 0:
        return "reinforcing_resistance"  # wall + suppress = hard ceiling
    elif gex_val > 0 and cex_val < 0:
        return "conflicting_wall_may_break"
    return "neutral"


def coupling_label(state):
    labels = {
        "reinforcing_support": "REINF SUPPORT (pin zone)",
        "reinforcing_resistance": "REINF RESISTANCE (ceiling)",
        "conflicting_wall_may_break": "CONFLICTING (wall may break)",
        "neutral": "NEUTRAL",
    }
    return labels.get(state, state)


def compute_velocity(current, prior):
    """Compute per-strike velocity between two metric dicts."""
    vel = {}
    all_strikes = sorted(set(list(current.keys()) + list(prior.keys())))
    for s in all_strikes:
        cur = current.get(s)
        prev = prior.get(s)
        if cur is not None and prev is not None:
            delta = cur - prev
            if abs(prev) > 0.01:
                pct = (cur - prev) / abs(prev) * 100
            else:
                pct = None
            # Classify
            if prev * cur < 0:
                tag = "FLIPPED"
            elif abs(cur) > abs(prev) * 1.5:
                tag = "SURGING"
            elif abs(cur) > abs(prev) * 1.1:
                tag = "growing"
            elif abs(cur) < abs(prev) * 0.5:
                tag = "CRUMBLED"
            elif abs(cur) < abs(prev) * 0.75:
                tag = "weakening"
            else:
                tag = "stable"
            vel[s] = {
                "prior": round(prev, 2),
                "current": round(cur, 2),
                "delta": round(delta, 2),
                "pct": round(pct, 1) if pct is not None else None,
                "tag": tag,
            }
        elif cur is not None:
            vel[s] = {"prior": None, "current": round(cur, 2), "delta": None, "pct": None, "tag": "new"}
    return vel


def amplifier_pin_ratio(gex_dict, spot):
    """Find dominant amp and adjacent wall, compute ratio and equilibrium."""
    above = {s: v for s, v in gex_dict.items() if s > spot}
    below = {s: v for s, v in gex_dict.items() if s <= spot}

    results = []
    # Check above spot
    if above:
        amps_above = {s: v for s, v in above.items() if v < 0}
        walls_above = {s: v for s, v in above.items() if v > 0}
        if amps_above and walls_above:
            amp_strike = max(amps_above, key=lambda s: abs(amps_above[s]))
            wall_strike = max(walls_above, key=lambda s: walls_above[s])
            amp_val = abs(gex_dict[amp_strike])
            wall_val = gex_dict[wall_strike]
            ratio = amp_val / wall_val if wall_val > 0 else float("inf")
            eq = amp_strike + (wall_strike - amp_strike) * wall_val / (amp_val + wall_val)
            results.append({
                "amp_strike": amp_strike,
                "amp_gex": gex_dict[amp_strike],
                "wall_strike": wall_strike,
                "wall_gex": gex_dict[wall_strike],
                "ratio": round(ratio, 2),
                "equilibrium": round(eq, 1),
                "discount_pin": ratio > 10,
            })
    # Check below spot
    if below:
        amps_below = {s: v for s, v in below.items() if v < 0}
        walls_below = {s: v for s, v in below.items() if v > 0}
        if amps_below and walls_below:
            amp_strike = max(amps_below, key=lambda s: abs(amps_below[s]))
            wall_strike = max(walls_below, key=lambda s: walls_below[s])
            amp_val = abs(gex_dict[amp_strike])
            wall_val = gex_dict[wall_strike]
            ratio = amp_val / wall_val if wall_val > 0 else float("inf")
            eq = amp_strike + (wall_strike - amp_strike) * wall_val / (amp_val + wall_val)
            results.append({
                "amp_strike": amp_strike,
                "amp_gex": gex_dict[amp_strike],
                "wall_strike": wall_strike,
                "wall_gex": gex_dict[wall_strike],
                "ratio": round(ratio, 2),
                "equilibrium": round(eq, 1),
                "discount_pin": ratio > 10,
            })
    return results


def wall_gravity_index(gex_dict, spot, prior_gex=None):
    """Compute wall gravity index for each positive-GEX strike.

    wall_gravity = wall_GEX * growth_rate * (1 / distance_from_spot)
    Growth rate = current / prior (1.0 if no prior). Distance min-clamped to 1.
    Returns list sorted by gravity descending.
    """
    results = []
    for s, v in gex_dict.items():
        if v <= 0:
            continue
        dist = max(abs(s - spot), 1)
        growth = 1.0
        if prior_gex and s in prior_gex and prior_gex[s] > 0:
            growth = v / prior_gex[s]
        gravity = v * growth * (1.0 / dist)
        results.append({
            "strike": s,
            "gex": round(v, 2),
            "growth_rate": round(growth, 2),
            "distance": round(dist, 1),
            "gravity": round(gravity, 4),
        })
    results.sort(key=lambda x: -x["gravity"])
    return results


def cex_time_discount(cex_dict, minutes_left):
    """Apply time decay discount to CEX magnitudes for directional purposes.

    >2h = 1.0x, 1-2h = 0.7x, 30-60min = 0.5x, <30min = 0.3x.
    Returns discounted dict + the multiplier used.
    """
    if minutes_left is None or minutes_left > 120:
        mult = 1.0
    elif minutes_left > 60:
        mult = 0.7
    elif minutes_left > 30:
        mult = 0.5
    else:
        mult = 0.3
    discounted = {s: round(v * mult, 2) for s, v in cex_dict.items()}
    return discounted, mult


def confidence_cap(minutes_left, is_single_snapshot=False):
    """Hard confidence cap based on time remaining.

    >2h = 5, 1-2h = 4, 30-60min = 3, <15min = 2.
    Single snapshot = cap at 3 regardless.
    """
    if minutes_left is None:
        cap = 5
    elif minutes_left > 120:
        cap = 5
    elif minutes_left > 60:
        cap = 4
    elif minutes_left > 15:
        cap = 3
    else:
        cap = 2
    if is_single_snapshot:
        cap = min(cap, 3)
    return cap


def structure_volatility(regime_history):
    """Detect structure volatility from regime flip history.

    regime_history = list of regime strings from consecutive reads.
    Returns (flag, flip_count). HIGH if 2+ flips in sequence.
    """
    if not regime_history or len(regime_history) < 2:
        return "LOW", 0
    flips = 0
    for i in range(1, len(regime_history)):
        if regime_history[i] != regime_history[i - 1]:
            flips += 1
    if flips >= 2:
        return "HIGH", flips
    elif flips == 1:
        return "MODERATE", flips
    return "LOW", flips


def reversion_bias(spot, dominant_wall_strike, regime):
    """Detect reversion risk when spot > dominant wall + 15 pts in mean-reverting regime.

    Returns (has_bias, distance, adjustment).
    """
    if not dominant_wall_strike or regime != "mean-reverting":
        return False, 0, 0
    dist = spot - dominant_wall_strike
    if dist > 15:
        adj = -1  # confidence adjustment
        return True, round(dist, 1), adj
    return False, round(dist, 1), 0


INTERNALS_BUFFER = SKILL_DIR / "data" / "internals_buffer.json"


def classify_internals(internals):
    """Classify market internals into a regime based on TICK/ADD/VOLD/TRIN.

    Uses window low for TICK when stream data available, current value otherwise.
    Returns (regime, bull_count, bear_count, details).
    """
    if not internals:
        return None, 0, 0, {}

    source = internals.get("source", "snapshot")
    window = internals.get("window")
    bull = 0
    bear = 0
    details = {}

    # TICK: use window low when available (captures program activity)
    if window and window.get("tick") and window["tick"].get("low") is not None:
        tick_low = window["tick"]["low"]
        tick_high = window["tick"].get("high")
    else:
        tick_low = internals.get("tick")
        tick_high = internals.get("tick")

    if tick_low is not None:
        if tick_low > -100:
            bull += 1
            details["tick"] = "bull"
        elif tick_low > -500:
            details["tick"] = "neutral"
        elif tick_low > -1000:
            bear += 1
            details["tick"] = "bear"
        else:
            bear += 1
            details["tick"] = "extreme_bear"

    # ADD: use trend when available, otherwise threshold
    add_val = internals.get("add")
    add_trend = None
    if window and window.get("add"):
        add_trend = window["add"].get("trend")
        add_val = window["add"].get("current", add_val)

    if add_val is not None:
        if add_trend == "advancing" or add_val > 500:
            bull += 1
            details["add"] = "bull"
        elif add_trend == "declining" or add_val < -500:
            if add_val < -1500:
                bear += 1
                details["add"] = "extreme_bear"
            else:
                bear += 1
                details["add"] = "bear"
        else:
            details["add"] = "neutral"

    # VOLD: use trend when available
    vold_val = internals.get("vold")
    vold_trend = None
    if window and window.get("vold"):
        vold_trend = window["vold"].get("trend")
        vold_val = window["vold"].get("current", vold_val)

    if vold_val is not None:
        # VOLD is a difference (up vol - down vol), approximate ratio
        # Positive = bullish, negative = bearish
        if vold_trend == "advancing" or vold_val > 0:
            if vold_val > 500000:  # strong positive
                bull += 1
                details["vold"] = "bull"
            else:
                details["vold"] = "neutral"
        elif vold_val < -500000:
            bear += 1
            details["vold"] = "bear"
        else:
            details["vold"] = "neutral"

    # TRIN: inverted — low = bullish, high = bearish
    trin_val = internals.get("trin")
    trin_high = None
    if window and window.get("trin"):
        trin_high = window["trin"].get("high")
        trin_val = window["trin"].get("current", trin_val)

    if trin_val is not None:
        if trin_val < 0.8:
            bull += 1
            details["trin"] = "bull"
        elif trin_val <= 1.2:
            details["trin"] = "neutral"
        elif trin_val <= 2.0:
            bear += 1
            details["trin"] = "bear"
        else:
            bear += 1
            details["trin"] = "extreme_bear"

    # Regime classification
    if bull >= 3:
        regime = "strong_bull"
    elif bull >= 2 and bear == 0:
        regime = "bull"
    elif bear >= 3:
        regime = "strong_bear"
    elif bear >= 2 and bull == 0:
        regime = "bear"
    else:
        regime = "neutral"

    return regime, bull, bear, details


def internals_gex_interaction(internals, internals_regime, gex_regime, window):
    """Describe the interaction between internals and GEX regime.

    Returns a descriptive string for the analyst.
    """
    if not internals_regime or not gex_regime:
        return None

    tick_val = internals.get("tick") if internals else None
    tick_low = None
    tick_high = None
    if window and window.get("tick"):
        tick_low = window["tick"].get("low")
        tick_high = window["tick"].get("high")

    add_trend = None
    vold_trend = None
    if window:
        if window.get("add"):
            add_trend = window["add"].get("trend")
        if window.get("vold"):
            vold_trend = window["vold"].get("trend")

    interactions = []

    if gex_regime == "mean-reverting":
        # Positive gamma — dealers dampen
        if tick_low is not None and tick_low < -800:
            interactions.append("TICK extreme at wall (in +GEX) -> high-probability bounce")
        if tick_high is not None and tick_high > 800:
            interactions.append("TICK extreme at wall (in +GEX) -> high-probability bounce")
        if add_trend == "declining":
            interactions.append("ADD diverging in pinning regime -> vulnerable to unpin")
    elif gex_regime == "trending":
        # Negative gamma — dealers amplify
        if vold_trend == "declining" and internals_regime in ("bear", "strong_bear"):
            interactions.append("trending + VOLD confirming -> trend has legs, don't fade")
        if vold_trend == "advancing" and internals_regime in ("bull", "strong_bull"):
            interactions.append("trending + VOLD confirming -> trend has legs, don't fade")
        if tick_low is not None and tick_low < -1000:
            interactions.append("TICK extreme in -GEX -> less reliable as reversal, dealers amplify")
    elif gex_regime == "mixed":
        # Gamma flip zone
        if tick_low is not None and tick_high is not None and (tick_high - tick_low) > 800:
            interactions.append("TICK whipsaws in flip zone -> unreliable, lean on ADD/VOLD")
        if add_trend:
            interactions.append(f"ADD {add_trend} in flip zone -> better signal than TICK here")

    return " | ".join(interactions) if interactions else "no notable interaction"


def internals_agreement(internals_regime, gex_regime, cex_direction):
    """Compute confidence adjustment from internals alignment.

    cex_direction: 'up' if CEX net above spot favors upside, 'down' otherwise.
    Returns (label, adjustment).
    """
    if not internals_regime or internals_regime == "neutral":
        return "neutral", 0

    # Determine what direction internals favor
    internals_bullish = internals_regime in ("bull", "strong_bull")
    internals_bearish = internals_regime in ("bear", "strong_bear")

    # GEX regime implication
    gex_bullish = gex_regime == "mean-reverting"  # pinning = orderly
    gex_bearish = gex_regime == "trending"  # amplifying = directional

    # CEX direction
    cex_bullish = cex_direction == "up"

    if internals_bullish and cex_bullish:
        return "aligned", 1
    if internals_bearish and not cex_bullish:
        return "aligned", 1
    if internals_bullish and not cex_bullish:
        return "divergent", -1
    if internals_bearish and cex_bullish:
        return "divergent", -1

    return "mixed", 0


def compute_all(data):
    spot = data.get("spot") or (float(os.environ["SPOT"]) if os.environ.get("SPOT") else None)
    if spot is None:
        print("ERROR: No spot price. Set SPOT env var or ensure 0dtespx data.", file=sys.stderr)
        sys.exit(1)
    data["spot"] = spot  # backfill for downstream
    vix = data.get("vix") or (float(os.environ["VIX"]) if os.environ.get("VIX") else None)
    em = data.get("em") or (float(os.environ["EM"]) if os.environ.get("EM") else None)
    time_et = data.get("time_et", "")

    gex = rows_to_dict(data["data"]["gex"]["rows"])
    cex = rows_to_dict(data["data"]["cex"]["rows"])
    dex = rows_to_dict(data["data"]["dex"]["rows"])
    vex = rows_to_dict(data["data"]["vex"]["rows"])
    pos_net = rows_to_dict(data["data"]["position"]["rows"])
    pos_puts = rows_to_dict(data["data"]["position_puts"]["rows"]) if "position_puts" in data["data"] else {}
    pos_calls = rows_to_dict(data["data"]["position_calls"]["rows"]) if "position_calls" in data["data"] else {}

    strikes = sorted(gex.keys())
    em_lo = round(spot - 2 * em, 0) if em else None
    em_hi = round(spot + 2 * em, 0) if em else None

    # Time
    mins_left = time_remaining_min(time_et) if time_et else None
    cex_wt, gex_wt = time_weight(mins_left) if mins_left else (0.5, 0.5)
    if mins_left is not None:
        hours = mins_left // 60
        mins = mins_left % 60
        time_label = f"{hours}h {mins}m"
    else:
        time_label = "unknown"

    # 1. GEX Regime
    net_gex = round(sum(gex.values()), 2)
    regime = classify_regime(net_gex)

    # 2. Key GEX levels
    walls = sorted([(s, v) for s, v in gex.items() if v > 0], key=lambda x: -x[1])
    amps = sorted([(s, v) for s, v in gex.items() if v < 0], key=lambda x: x[1])

    above_walls = [(s, v) for s, v in walls if s > spot]
    below_walls = [(s, v) for s, v in walls if s <= spot]
    nearest_wall_above = min(above_walls, key=lambda x: x[0]) if above_walls else None
    nearest_wall_below = max(below_walls, key=lambda x: x[0]) if below_walls else None

    gamma_flips = find_gamma_flips(gex, spot)

    # 3. CEX
    cex_sell = sorted([(s, v) for s, v in cex.items() if v > 0], key=lambda x: -x[1])
    cex_buy = sorted([(s, v) for s, v in cex.items() if v < 0], key=lambda x: x[1])
    cex_equilibrium = find_equilibrium(cex, spot)

    # CEX path (spot to above targets)
    above_suppress = sum(v for s, v in cex.items() if s > spot and v > 0)
    above_support = sum(abs(v) for s, v in cex.items() if s > spot and v < 0)
    below_suppress = sum(v for s, v in cex.items() if s <= spot and v > 0)
    below_support = sum(abs(v) for s, v in cex.items() if s <= spot and v < 0)

    # DEX
    dex_above = round(sum(v for s, v in dex.items() if s > spot), 2)
    dex_below = round(sum(v for s, v in dex.items() if s <= spot), 2)
    danger_zones = [s for s in strikes if gex.get(s, 0) < 0 and dex.get(s, 0) < 0]

    # VEX
    vex_above = round(sum(v for s, v in vex.items() if s > spot), 2)
    vex_below = round(sum(v for s, v in vex.items() if s <= spot), 2)

    # Positioning
    mm_short_puts = sorted(
        [(s, v) for s, v in pos_puts.items() if v < 0],
        key=lambda x: x[1]
    )
    hedge_line = mm_short_puts[0] if mm_short_puts else None
    # Near-spot hedge line
    near_spot_puts = sorted(
        [(s, v) for s, v in pos_puts.items() if v < 0 and abs(s - spot) <= 15],
        key=lambda x: x[1]
    )
    hedge_line_near = near_spot_puts[0] if near_spot_puts else hedge_line

    # Coupling
    coupling = {}
    for s in strikes:
        g = gex.get(s, 0)
        c = cex.get(s, 0)
        state = coupling_state(g, c)
        coupling[s] = {
            "gex": round(g, 2),
            "cex": round(c, 2),
            "state": state,
            "label": coupling_label(state),
            "magnitude": round(abs(g) + abs(c), 2),
        }

    # Amplifier-pin ratio
    amp_pin = amplifier_pin_ratio(gex, spot)

    # Per-strike summary
    strike_summary = []
    for s in strikes:
        strike_summary.append({
            "strike": s,
            "gex": round(gex.get(s, 0), 2),
            "cex": round(cex.get(s, 0), 2),
            "dex": round(dex.get(s, 0), 2),
            "vex": round(vex.get(s, 0), 2),
            "net_pos": int(pos_net.get(s, 0)),
            "calls": int(pos_calls.get(s, 0)),
            "puts": int(pos_puts.get(s, 0)),
            "coupling": coupling[s]["label"],
            "rel_to_spot": "above" if s > spot else ("at_spot" if abs(s - spot) < 2.5 else "below"),
        })

    # Shadow model calculations
    # Wall gravity (needs prior GEX for growth rate)
    prior_gex = None
    if SNAPSHOT_FILE.exists():
        try:
            prior_snap = load_json(SNAPSHOT_FILE)
            if "data" in prior_snap and "gex" in prior_snap["data"]:
                prior_gex = rows_to_dict(prior_snap["data"]["gex"]["rows"])
        except Exception:
            pass
    wall_grav = wall_gravity_index(gex, spot, prior_gex)
    dominant_gravity_wall = wall_grav[0] if wall_grav else None

    # CEX time discount
    cex_discounted, cex_discount_mult = cex_time_discount(cex, mins_left)
    # Recompute sell/buy zones with discounted CEX
    disc_sell = sorted([(s, v) for s, v in cex_discounted.items() if v > 0], key=lambda x: -x[1])
    disc_buy = sorted([(s, v) for s, v in cex_discounted.items() if v < 0], key=lambda x: x[1])

    # Confidence cap
    conf_cap = confidence_cap(mins_left)

    # Reversion bias
    dominant_wall_strike = wall_grav[0]["strike"] if wall_grav else (nearest_wall_below[0] if nearest_wall_below else None)
    rev_bias, rev_dist, rev_adj = reversion_bias(spot, dominant_wall_strike, regime)

    # Structure volatility (load regime history from snapshot chain)
    regime_history = []
    if SNAPSHOT_FILE.exists():
        try:
            ps = load_json(SNAPSHOT_FILE)
            regime_history = ps.get("_regime_history", [])
        except Exception:
            pass
    regime_history.append(regime)
    # Keep last 10 reads
    regime_history = regime_history[-10:]
    struct_vol, struct_flips = structure_volatility(regime_history)

    # Store regime history in data for snapshot persistence
    data["_regime_history"] = regime_history

    # ── Market Internals ──────────────────────────────
    internals_data = data.get("internals")
    internals_regime = None
    internals_bull = 0
    internals_bear = 0
    internals_details = {}
    internals_interaction = None
    internals_agree_label = "unavailable"
    internals_conf_adj = 0
    internals_result = None

    if internals_data:
        internals_regime, internals_bull, internals_bear, internals_details = classify_internals(internals_data)
        window = internals_data.get("window")
        internals_interaction = internals_gex_interaction(
            internals_data, internals_regime, regime, window
        )

        # CEX direction: which way does net CEX favor?
        cex_dir = "up" if above_support > above_suppress else "down"
        internals_agree_label, internals_conf_adj = internals_agreement(
            internals_regime, regime, cex_dir
        )

        internals_result = {
            "source": internals_data.get("source", "unknown"),
            "regime": internals_regime,
            "tick": {
                "current": internals_data.get("tick"),
                "window_low": window["tick"]["low"] if window and window.get("tick") else None,
                "window_high": window["tick"]["high"] if window and window.get("tick") else None,
            },
            "add": {
                "current": internals_data.get("add"),
                "trend": window["add"].get("trend") if window and window.get("add") else None,
            },
            "vold": {
                "current": internals_data.get("vold"),
                "trend": window["vold"].get("trend") if window and window.get("vold") else None,
            },
            "trin": {
                "current": internals_data.get("trin"),
                "window_high": window["trin"]["high"] if window and window.get("trin") else None,
            },
            "tier2": internals_data.get("tier2"),
            "alerts_since_last_pull": internals_data.get("alerts", []),
            "bull_count": internals_bull,
            "bear_count": internals_bear,
            "details": internals_details,
            "gex_interaction": internals_interaction,
            "agreement": internals_agree_label,
            "confidence_adj": internals_conf_adj,
        }

        if internals_data.get("tick_count"):
            internals_result["tick_count"] = internals_data["tick_count"]

    result = {
        "meta": {
            "timestamp": data.get("timestamp"),
            "date": data.get("date"),
            "time_et": time_et,
            "spot": spot,
            "vix": vix,
            "em": em,
            "em_range": [em_lo, em_hi] if em else None,
            "minutes_remaining": mins_left,
            "time_label": time_label,
            "cex_weight": cex_wt,
            "gex_weight": gex_wt,
        },
        "gex_regime": {
            "net": net_gex,
            "classification": regime,
        },
        "key_levels": {
            "walls": [{"strike": s, "gex": round(v, 2)} for s, v in walls[:5]],
            "amplifiers": [{"strike": s, "gex": round(v, 2)} for s, v in amps[:5]],
            "nearest_wall_above": {"strike": nearest_wall_above[0], "gex": round(nearest_wall_above[1], 2)} if nearest_wall_above else None,
            "nearest_wall_below": {"strike": nearest_wall_below[0], "gex": round(nearest_wall_below[1], 2)} if nearest_wall_below else None,
            "gamma_flips": gamma_flips,
        },
        "cex": {
            "sell_zones": [{"strike": s, "cex": round(v, 2)} for s, v in cex_sell[:5]],
            "buy_zones": [{"strike": s, "cex": round(v, 2)} for s, v in cex_buy[:5]],
            "equilibrium": cex_equilibrium,
            "path_up": {
                "suppress_sum": round(above_suppress, 2),
                "support_sum": round(above_support, 2),
                "ratio": round(above_support / above_suppress, 2) if above_suppress > 0 else float("inf"),
            },
            "path_down": {
                "suppress_sum": round(below_suppress, 2),
                "support_sum": round(below_support, 2),
            },
        },
        "dex": {
            "net_above": dex_above,
            "net_below": dex_below,
            "above_label": "dealers long delta (sell rallies)" if dex_above > 0 else "dealers short delta (buy rallies)",
            "below_label": "dealers long delta (sell rallies)" if dex_below > 0 else "dealers short delta (buy rallies)",
            "danger_zones": danger_zones,
        },
        "vex": {
            "net_above": vex_above,
            "net_below": vex_below,
        },
        "positioning": {
            "hedge_line": {"strike": hedge_line_near[0], "puts": int(hedge_line_near[1])} if hedge_line_near else None,
            "largest_mm_short_puts": [{"strike": s, "puts": int(v)} for s, v in mm_short_puts[:5]],
        },
        "coupling": {s: coupling[s] for s in strikes},
        "amplifier_pin": amp_pin,
        "shadow_model": {
            "wall_gravity": {
                "rankings": wall_grav[:5],
                "dominant": dominant_gravity_wall,
                "pin_anchor": dominant_gravity_wall["strike"] if dominant_gravity_wall else None,
            },
            "cex_discount": {
                "multiplier": cex_discount_mult,
                "discounted_sell_zones": [{"strike": s, "cex": round(v, 2)} for s, v in disc_sell[:3]],
                "discounted_buy_zones": [{"strike": s, "cex": round(v, 2)} for s, v in disc_buy[:3]],
            },
            "confidence_cap": conf_cap,
            "reversion_bias": {
                "active": rev_bias,
                "spot_above_wall": rev_dist,
                "confidence_adj": rev_adj,
                "dominant_wall": dominant_wall_strike,
            },
            "structure_volatility": {
                "flag": struct_vol,
                "regime_flips": struct_flips,
                "regime_history": regime_history,
            },
        },
        "internals": internals_result,
        "strikes": strike_summary,
    }

    return result, {
        "gex": gex, "cex": cex, "dex": dex, "vex": vex,
        "pos_net": pos_net, "pos_puts": pos_puts, "pos_calls": pos_calls,
    }


def add_velocity(result, current_metrics, prior_data):
    """Add velocity tracking by diffing current vs prior snapshot."""
    if not prior_data:
        result["velocity"] = None
        return

    prior_metrics = {}
    for key in ["gex", "cex", "dex", "vex"]:
        if key in prior_data.get("data", {}):
            prior_metrics[key] = rows_to_dict(prior_data["data"][key]["rows"])
    if "position" in prior_data.get("data", {}):
        prior_metrics["pos_net"] = rows_to_dict(prior_data["data"]["position"]["rows"])

    vel = {}
    for key in ["gex", "cex", "dex", "vex"]:
        if key in prior_metrics and key in current_metrics:
            v = compute_velocity(current_metrics[key], prior_metrics[key])
            # Filter to notable changes only
            notable = {s: info for s, info in v.items()
                       if info["tag"] in ("FLIPPED", "SURGING", "CRUMBLED", "weakening", "growing")}
            vel[key] = notable

    result["velocity"] = {
        "prior_time": prior_data.get("time_et", "?"),
        "current_time": result["meta"]["time_et"],
        **vel,
    }


def format_output(result):
    """Format precomputed results as readable text."""
    m = result["meta"]
    lines = []
    lines.append(f"═══ PRECOMPUTE: {m['date']} {m['time_et']} ET ═══")
    lines.append(f"Spot: {m['spot']}  VIX: {m['vix']}  EM: {m['em']}")
    if m["em_range"]:
        lines.append(f"EM Range: {m['em_range'][0]:.0f} – {m['em_range'][1]:.0f}")
    lines.append(f"Time Left: {m['time_label']}  Weights: CEX {m['cex_weight']:.2f} / GEX {m['gex_weight']:.2f}")
    lines.append("")

    # GEX Regime
    gr = result["gex_regime"]
    lines.append(f"─── GEX REGIME: {gr['net']:+.2f} → {gr['classification'].upper()} ───")
    lines.append("")

    # Key levels
    kl = result["key_levels"]
    lines.append("─── WALLS (positive GEX) ───")
    for w in kl["walls"]:
        lines.append(f"  {w['strike']}: +{w['gex']:.2f}")
    lines.append("─── AMPLIFIERS (negative GEX) ───")
    for a in kl["amplifiers"]:
        lines.append(f"  {a['strike']}: {a['gex']:.2f}")
    if kl["gamma_flips"]:
        lines.append("─── GAMMA FLIPS ───")
        for gf in kl["gamma_flips"]:
            lines.append(f"  ~{gf['approx']} ({gf['direction']}) between {gf['between'][0]}-{gf['between'][1]}")
    lines.append("")

    # CEX
    cx = result["cex"]
    lines.append("─── CEX ───")
    lines.append(f"  Equilibrium: {cx['equilibrium']}")
    lines.append(f"  Path Up — suppress: {cx['path_up']['suppress_sum']:.1f}, support: {cx['path_up']['support_sum']:.1f}, ratio: {cx['path_up']['ratio']:.2f}x")
    lines.append(f"  Path Down — suppress: {cx['path_down']['suppress_sum']:.1f}, support: {cx['path_down']['support_sum']:.1f}")
    lines.append("  Sell zones (suppress):")
    for sz in cx["sell_zones"][:3]:
        lines.append(f"    {sz['strike']}: +{sz['cex']:.2f}")
    lines.append("  Buy zones (support):")
    for bz in cx["buy_zones"][:3]:
        lines.append(f"    {bz['strike']}: {bz['cex']:.2f}")
    lines.append("")

    # DEX
    dx = result["dex"]
    lines.append("─── DEX ───")
    lines.append(f"  Above spot: {dx['net_above']:+.1f} ({dx['above_label']})")
    lines.append(f"  Below spot: {dx['net_below']:+.1f} ({dx['below_label']})")
    if dx["danger_zones"]:
        lines.append(f"  Danger zones (-DEX + -GEX): {dx['danger_zones']}")
    lines.append("")

    # VEX
    vx = result["vex"]
    lines.append("─── VEX ───")
    lines.append(f"  Above spot: {vx['net_above']:+.1f}")
    lines.append(f"  Below spot: {vx['net_below']:+.1f}")
    lines.append("")

    # Positioning
    ps = result["positioning"]
    lines.append("─── POSITIONING ───")
    if ps["hedge_line"]:
        lines.append(f"  Hedge line: {ps['hedge_line']['strike']} (MM short {abs(ps['hedge_line']['puts'])} puts)")
    lines.append("  Largest MM short puts:")
    for sp in ps["largest_mm_short_puts"][:4]:
        lines.append(f"    {sp['strike']}: {sp['puts']}")
    lines.append("")

    # Coupling
    lines.append("─── COUPLING ───")
    for s in sorted(result["coupling"].keys(), reverse=True):
        c = result["coupling"][s]
        if c["magnitude"] > 5:
            lines.append(f"  {s}: GEX {c['gex']:+.2f} + CEX {c['cex']:+.2f} = {c['label']}")
    lines.append("")

    # Amplifier-pin ratio
    if result["amplifier_pin"]:
        lines.append("─── AMPLIFIER-PIN RATIO ───")
        for ap in result["amplifier_pin"]:
            lines.append(f"  Amp {ap['amp_strike']} ({ap['amp_gex']:.1f}) vs Wall {ap['wall_strike']} ({ap['wall_gex']:.1f})")
            lines.append(f"  Ratio: {ap['ratio']:.2f}x | Equilibrium: ~{ap['equilibrium']:.0f} | Discount pin: {ap['discount_pin']}")
    lines.append("")

    # Strike table
    lines.append("─── STRIKE TABLE ───")
    lines.append(f"{'Strike':>6} {'GEX':>8} {'CEX':>8} {'DEX':>9} {'VEX':>9} {'Net':>6} {'Calls':>6} {'Puts':>6} {'Coupling':>25}")
    for s in result["strikes"]:
        marker = " ◄" if s["rel_to_spot"] == "at_spot" else ""
        lines.append(
            f"{s['strike']:>6} {s['gex']:>+8.2f} {s['cex']:>+8.2f} {s['dex']:>+9.2f} {s['vex']:>+9.2f} "
            f"{s['net_pos']:>+6d} {s['calls']:>+6d} {s['puts']:>+6d} {s['coupling']:>25}{marker}"
        )
    lines.append("")

    # Shadow Model
    shadow = result.get("shadow_model")
    if shadow:
        lines.append("─── SHADOW MODEL ──────────────────────────")
        # Wall Gravity
        wg = shadow["wall_gravity"]
        if wg["dominant"]:
            d = wg["dominant"]
            lines.append(f"  Wall Gravity Pin Anchor: {d['strike']} (gravity={d['gravity']:.4f}, GEX={d['gex']:+.2f}, growth={d['growth_rate']:.2f}x, dist={d['distance']:.0f})")
            if len(wg["rankings"]) > 1:
                others = ", ".join(f"{w['strike']}({w['gravity']:.3f})" for w in wg["rankings"][1:3])
                lines.append(f"  Other walls: {others}")
        else:
            lines.append("  Wall Gravity: no positive-GEX walls found")

        # CEX Discount
        cd = shadow["cex_discount"]
        lines.append(f"  CEX Discount: {cd['multiplier']:.1f}x (time-adjusted)")
        if cd["discounted_buy_zones"]:
            disc_buys = ", ".join(f"{z['strike']}({z['cex']:.1f})" for z in cd["discounted_buy_zones"][:3])
            lines.append(f"  Disc. Buy Zones: {disc_buys}")
        if cd["discounted_sell_zones"]:
            disc_sells = ", ".join(f"{z['strike']}({z['cex']:.1f})" for z in cd["discounted_sell_zones"][:3])
            lines.append(f"  Disc. Sell Zones: {disc_sells}")

        # Confidence Cap
        lines.append(f"  Confidence Cap: {shadow['confidence_cap']}")

        # Reversion Bias
        rb = shadow["reversion_bias"]
        if rb["active"]:
            lines.append(f"  ⚠ REVERSION BIAS: spot {rb['spot_above_wall']:.0f}pts above dominant wall {rb['dominant_wall']} → conf {rb['confidence_adj']}")
        else:
            lines.append(f"  Reversion Bias: inactive (spot {rb['spot_above_wall']:.0f}pts from wall {rb['dominant_wall']})")

        # Structure Volatility
        sv = shadow["structure_volatility"]
        lines.append(f"  Structure Volatility: {sv['flag']} ({sv['regime_flips']} flips in {len(sv['regime_history'])} reads)")
        if len(sv["regime_history"]) > 1:
            lines.append(f"  Regime History: {' → '.join(sv['regime_history'][-5:])}")
        lines.append("")

    # Market Internals
    internals = result.get("internals")
    if internals:
        src = internals["source"]
        readings_ct = internals.get("tick_count", "?")
        lines.append(f"─── MARKET INTERNALS ({src}, {readings_ct} readings) ───")

        tick_str = str(internals["tick"]["current"] or "?")
        tick_w = internals["tick"]
        if tick_w.get("window_low") is not None:
            tick_str += f" (window: {tick_w['window_low']} / +{tick_w['window_high']})"

        add_str = str(internals["add"]["current"] or "?")
        if internals["add"].get("trend"):
            arrow = {"advancing": " ↗", "declining": " ↘", "flat": " →"}.get(internals["add"]["trend"], "")
            add_str += arrow

        vold_val = internals["vold"]["current"]
        if vold_val is not None:
            if abs(vold_val) >= 1_000_000:
                vold_str = f"{vold_val / 1_000_000:.1f}M"
            elif abs(vold_val) >= 1_000:
                vold_str = f"{vold_val / 1_000:.0f}K"
            else:
                vold_str = str(vold_val)
            if internals["vold"].get("trend"):
                arrow = {"advancing": " ↗", "declining": " ↘", "flat": " →"}.get(internals["vold"]["trend"], "")
                vold_str += arrow
        else:
            vold_str = "?"

        trin_str = str(internals["trin"]["current"] or "?")
        if internals["trin"].get("window_high") is not None:
            trin_str += f" (spike to {internals['trin']['window_high']})"

        lines.append(f"TICK: {tick_str}  ADD: {add_str}  VOLD: {vold_str}  TRIN: {trin_str}")
        lines.append(f"Breadth: {internals['regime'].upper()} ({internals['bull_count']}/4 bull flags)")
        lines.append(f"GEX Interaction: {internals['gex_interaction']}")

        tier2 = internals.get("tier2")
        if tier2 and tier2.get("vix9d"):
            ts = tier2.get("term_structure", "?")
            skew = tier2.get("skew", "?")
            ratio = tier2.get("vix9d_vix_ratio", "?")
            skew_label = ""
            if isinstance(skew, (int, float)):
                if skew > 145:
                    skew_label = " (high tail risk)"
                elif skew > 130:
                    skew_label = " (elevated tail risk)"
            lines.append(f"VIX9D/VIX: {ratio} ({ts}) | SKEW: {skew}{skew_label}")

        alerts = internals.get("alerts_since_last_pull", [])
        if alerts:
            alert_strs = [f"[{a['time']}] {a['type']} {a['value']} {a['label']}" for a in alerts[:5]]
            lines.append("Alerts: " + " | ".join(alert_strs))

        lines.append(f"Agreement: {internals['agreement']} (conf adj: {internals['confidence_adj']:+d})")
        lines.append("")
    else:
        lines.append("─── MARKET INTERNALS: unavailable ───")
        lines.append("")

    # Velocity
    vel = result.get("velocity")
    if vel and any(vel.get(k) for k in ["gex", "cex", "dex", "vex"]):
        lines.append(f"─── VELOCITY ({vel['prior_time']} → {vel['current_time']}) ───")
        for metric in ["gex", "cex", "dex", "vex"]:
            changes = vel.get(metric, {})
            if changes:
                lines.append(f"  {metric.upper()}:")
                for s in sorted(changes.keys(), reverse=True):
                    v = changes[s]
                    pct = f" ({v['pct']:+.0f}%)" if v["pct"] is not None else ""
                    lines.append(f"    {s}: {v['prior']} → {v['current']} [{v['tag']}]{pct}")
        lines.append("")
    elif vel:
        lines.append("─── VELOCITY: no notable changes ───")
        lines.append("")

    return "\n".join(lines)


def main():
    json_only = "--json" in sys.argv
    no_save = "--no-save" in sys.argv

    if not DATA_FILE.exists():
        print(f"ERROR: {DATA_FILE} not found. Run `npm run fetch` first.", file=sys.stderr)
        sys.exit(1)

    data = load_json(DATA_FILE)

    # Load prior snapshot for velocity
    prior = None
    if SNAPSHOT_FILE.exists():
        try:
            prior = load_json(SNAPSHOT_FILE)
        except Exception:
            prior = None

    # Compute
    result, current_metrics = compute_all(data)
    add_velocity(result, current_metrics, prior)

    # Save snapshot for next run
    if not no_save:
        save_json(SNAPSHOT_FILE, data)

    # Save precompute output
    save_json(OUTPUT_FILE, result)

    # Print
    if json_only:
        print(json.dumps(result, indent=2))
    else:
        print(format_output(result))


if __name__ == "__main__":
    main()
