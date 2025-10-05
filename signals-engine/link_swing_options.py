# link_swing_options.py
import json, math, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

SWING_FILE = OUT / "signals_swing.json"
OPT_FILE   = OUT / "options.json"
OUT_FILE   = OUT / "swing_plus_options.json"

# scoring for options: prefer near 0.65 delta, <=25 days, tight spread
def score_option(opt):
    delta = abs(float(opt.get("delta", 0)))
    dte   = float(opt.get("dte_days", 30))
    spread= float(opt.get("spread", 0.2))
    # clamp
    delta_term  = 1.0 - abs(delta - 0.65)        # closer to .65 is better
    dte_term    = 1.0 - min(dte, 30)/30.0         # nearer expiry is better, up to 30d
    spread_term = 1.0 - min(spread, 0.4)/0.4      # tighter spread better
    return 0.5*delta_term + 0.3*dte_term + 0.2*spread_term

def main():
    if not SWING_FILE.exists():
        print(f"[WARN] {SWING_FILE} missing; writing empty output.")
        OUT_FILE.write_text("[]", encoding="utf-8")
        return
    swings = json.loads(SWING_FILE.read_text(encoding="utf-8"))

    if OPT_FILE.exists():
        opts = json.loads(OPT_FILE.read_text(encoding="utf-8"))
    else:
        opts = []

    # index options by symbol
    by_sym = {}
    for o in opts:
        sym = o.get("underlying") or o.get("symbol") or o.get("root")
        if not sym: 
            continue
        by_sym.setdefault(sym.upper(), []).append(o)

    out_rows = []
    for s in swings:
        sym = s["symbol"].upper()
        direction = s.get("direction","LONG")
        cands = by_sym.get(sym, [])
        if not cands:
            out_rows.append({**s, "best_options":[]})
            continue

        # choose calls for LONG, puts for SHORT
        side = "CALL" if direction == "LONG" else "PUT"
        filt = [o for o in cands if o.get("type","").upper()==side]
        if not filt:
            filt = cands  # fallback to any

        # sort by our score, best first
        filt.sort(key=score_option, reverse=True)
        best = filt[:2]  # take top 2

        out_rows.append({
            **s,
            "best_options": best
        })

    OUT_FILE.write_text(json.dumps(out_rows, indent=2), encoding="utf-8")
    print(f"[OK] wrote {OUT_FILE} with {len(out_rows)} rows")

if __name__ == "__main__":
    main()
