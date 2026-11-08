"""Write build/params_<scenario>.lua for profiles/car_hokkaido.lua.

summer: ferry speed only.
winter: ferry speed + speed factors (data/winter_speed.json) + blocked OSM way ids
        (build/winter_blocked_ways.json, from 04_winter_closures.py).
"""
import json
import sys
from common import BUILD, DATA

FERRY_SPEED_KMH = 30

def lua_table(d):
    items = []
    for k, v in d.items():
        key = f"[{k}]" if isinstance(k, int) else f"['{k}']"
        items.append(f"{key}={str(v).lower() if isinstance(v, bool) else v}")
    return "{" + ",".join(items) + "}"

def main(scen):
    factors, blocked = {}, {}
    if scen == "winter":
        factors = json.loads((DATA / "winter_speed.json").read_text())["factors"]
        ways = json.loads((BUILD / "winter_blocked_ways.json").read_text())
        blocked = {int(w): True for sec in ways for w in sec["way_ids"]}
    lua = (f"return {{\n  ferry_speed = {FERRY_SPEED_KMH},\n"
           f"  speed_factor = {lua_table(factors)},\n"
           f"  blocked_ways = {lua_table(blocked)}\n}}\n")
    (BUILD / f"params_{scen}.lua").write_text(lua)
    print(scen, "factors:", factors, "blocked ways:", len(blocked))

if __name__ == "__main__":
    main(sys.argv[1])
