import json, shutil, pathlib

ENGINE = pathlib.Path(__file__).resolve().parent
OUT = ENGINE / "output"
SITE_DATA = pathlib.Path(r"C:\Users\trave\Documents\LogiQDominicus\logiqsignals-site\public\data")
SITE_DATA.mkdir(parents=True, exist_ok=True)

def normalize_and_copy(name):
    src = OUT / name
    if not src.exists():
        print(f"skip {name}: not found")
        return
    with open(src, "r") as f:
        data = json.load(f)
    # if wrapped like {"signals":[...]}, unwrap to array
    if isinstance(data, dict) and "signals" in data:
        data = data["signals"]
    with open(src, "w") as f:
        json.dump(data, f)
    dst = SITE_DATA / name
    shutil.copy2(src, dst)
    print(f"wrote {dst} with {len(data)} items")

normalize_and_copy("signals.json")
normalize_and_copy("signals_swing.json")
print("done.")
