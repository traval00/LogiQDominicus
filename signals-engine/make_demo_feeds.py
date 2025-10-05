# make_demo_feeds.py  — writes demo rows if any feed is empty
import json, time
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)

def write_if_empty(path, data):
    if not path.exists() or not json.loads(path.read_text() or "[]"):
        path.write_text(json.dumps(data, indent=2))
        return True
    return False

now = time.strftime("%Y-%m-%d %H:%M:%S")

demo_intraday = [
  {"ticker":"SPY","timeframe":"15m","strategy":"ORB+EMA retest","side":"LONG",
   "prob":0.68,"entry":512.34,"stop":508.9,"targets":[514.3,515.6,518.7],"asof":now},
  {"ticker":"BTC-USD","timeframe":"15m","strategy":"ORB+EMA retest","side":"SHORT",
   "prob":0.61,"entry":64123,"stop":64850,"targets":[63500,63000,62200],"asof":now}
]

demo_swing = [
  {"ticker":"AAPL","timeframe":"1d-swing","strategy":"EMA20 retest + trend",
   "prob":0.63,"entry":224.1,"stop":218.7,"targets":[229.5,232.9,236.3],
   "trail":{"method":"ema20_atr","atr_mult":1.5},"asof":now},
  {"ticker":"ETH-USD","timeframe":"1d-swing","strategy":"EMA20 retest + trend",
   "prob":0.66,"entry":2710,"stop":2580,"targets":[2790,2860,2950],
   "trail":{"method":"ema20_atr","atr_mult":1.5},"asof":now}
]

demo_options = [
  {"symbol":"SPY","type":"CALL","strike":515,"expiry":"2025-10-18",
   "delta":0.62,"spread":0.03,"note":"ATM call 2w — trend up","score":0.72},
  {"symbol":"AAPL","type":"PUT","strike":220,"expiry":"2025-10-18",
   "delta":0.55,"spread":0.02,"note":"EMA20 loss risk hedge","score":0.64}
]

demo_swing_plus_options = [
  {"ticker":"AAPL","timeframe":"1d-swing","prob":0.63,"entry":224.1,"stop":218.7,
   "targets":[229.5,232.9,236.3],"opt_type":"PUT","opt_strike":220,"opt_exp":"2025-10-18",
   "opt_delta":0.55,"opt_note":"EMA20 loss risk hedge"}
]

changed = []
changed += [("signals.json", write_if_empty(OUT/"signals.json", demo_intraday))]
changed += [("signals_swing.json", write_if_empty(OUT/"signals_swing.json", demo_swing))]
changed += [("options.json", write_if_empty(OUT/"options.json", demo_options))]
changed += [("swing_plus_options.json", write_if_empty(OUT/"swing_plus_options.json", demo_swing_plus_options))]

print("Demo written for:", [name for name, ok in changed if ok] or "none (feeds already had data)")
