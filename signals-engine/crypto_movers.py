import json, datetime as dt
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)

# Map CoinGecko coin IDs -> display symbols your UI expects
ID_TO_TICKER = {
    "bitcoin": "BTC-USD",
    "ethereum": "ETH-USD",
    "solana": "SOL-USD",
    "ripple": "XRP-USD",
    "cardano": "ADA-USD",
    "dogecoin": "DOGE-USD",
    "avalanche-2": "AVAX-USD",
    "chainlink": "LINK-USD",
    "litecoin": "LTC-USD",
    "polkadot": "DOT-USD",
    "binancecoin": "BNB-USD",
    "tron": "TRX-USD",
    "polygon": "MATIC-USD",
    "cosmos": "ATOM-USD",
    "uniswap": "UNI-USD",
    "arbitrum": "ARB-USD",
    "internet-computer": "ICP-USD",
    "near": "NEAR-USD",
    "filecoin": "FIL-USD",
    "stacks": "STX-USD",
    "optimism": "OP-USD",
    "aptos": "APT-USD",
    "sui": "SUI-USD",
    "render-token": "RNDR-USD",
    "injective-protocol": "INJ-USD",
    "hedera-hashgraph": "HBAR-USD",
    "the-graph": "GRT-USD",
    "shiba-inu": "SHIB-USD",
    "pyth-network": "PYTH-USD",
    "theta-token": "THETA-USD",
}

# You can trim/expand this list. We'll fetch a larger page and filter to these if present.
TARGET_IDS = list(ID_TO_TICKER.keys())

CG_URL = "https://api.coingecko.com/api/v3/coins/markets"

def fetch_markets(page_size=100):
    """
    Pull market data from CoinGecko.
    We ask for top 100 by market cap, then we filter to TARGET_IDS if present.
    """
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": page_size,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    headers = {
        "Accept": "application/json",
        "User-Agent": "LogiqSignals/1.0 (+https://logiqsignals.com)"
    }
    r = requests.get(CG_URL, params=params, headers=headers, timeout=20)
    r.raise_for_status()
    return r.json()

def to_row(item: dict):
    """
    Map CoinGecko market item to our row format.
    """
    cid = item.get("id")
    symbol = ID_TO_TICKER.get(cid, (item.get("symbol","") or "").upper() + "-USD")
    price = item.get("current_price") or 0.0
    chg = item.get("price_change_percentage_24h") or 0.0
    vol = item.get("total_volume") or 0.0
    return {
        "symbol": symbol,
        "price": round(float(price), 2),
        "change24h": round(float(chg), 2),
        "vol24h": round(float(vol), 2),
        "asof": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
    }

def main():
    try:
        data = fetch_markets(page_size=100)  # big page, then filter
    except Exception as e:
        # Write an empty but valid file so UI won't crash
        (OUT / "crypto_movers.json").write_text("[]")
        print(f"[ERR] CoinGecko fetch failed: {e}")
        return

    # Prefer our TARGET_IDS, but if some missing, still include others
    by_id = {d.get("id"): d for d in data if isinstance(d, dict)}
    selected = []

    # First pass: take requested IDs if available
    for cid in TARGET_IDS:
        if cid in by_id:
            selected.append(by_id[cid])

    # If we still have less than 20, top up with the biggest movers by abs 24h %
    if len(selected) < 20:
        # exclude ones already selected
        existing = set(d.get("id") for d in selected)
        remaining = [d for d in data if d.get("id") not in existing]
        remaining.sort(key=lambda x: abs(x.get("price_change_percentage_24h") or 0.0), reverse=True)
        selected += remaining[: max(0, 20 - len(selected))]

    # Convert to rows and sort by |change| descending
    rows = [to_row(d) for d in selected]
    rows.sort(key=lambda x: abs(x.get("change24h", 0.0)), reverse=True)
    rows = rows[:20]

    (OUT / "crypto_movers.json").write_text(json.dumps(rows, indent=2))
    print(f"[OK] wrote {len(rows)} crypto movers -> {OUT/'crypto_movers.json'}")

if __name__ == "__main__":
    main()
