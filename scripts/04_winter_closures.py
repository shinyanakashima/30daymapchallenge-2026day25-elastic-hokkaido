"""Turn the winter closure list (data/winter_closures.csv) into OSM way ids.

The official lists give each closed section as a road number and two place names
(gates), whose coordinates in the CSV are approximate. A way is treated as closed when
  * it is a road (highway=*) whose ref contains the section's route number, and
  * at least half of its nodes lie within R km of the straight line between the two ends,
    R = max(2.5 km, 0.25 x section length); when both ends share one approximate point,
    R = max(3 km, 0.6 x section length) around that point.
Output: build/winter_blocked_ways.json (way ids and blocked length per section).
"""
import json
import numpy as np
import osmium
import pandas as pd
from common import BUILD, DATA, RAW, to_km

class Roads(osmium.SimpleHandler):
    def __init__(self, refs):
        super().__init__(); self.refs = refs; self.ways = []
    def way(self, w):
        t = w.tags
        if "highway" not in t or "ref" not in t:
            return
        refs = {r.strip() for r in t["ref"].replace("；", ";").split(";")}
        hit = refs & self.refs
        if not hit:
            return
        try:
            ll = np.array([(n.lon, n.lat) for n in w.nodes])
        except osmium.InvalidLocationError:
            return
        self.ways.append((w.id, hit, t.get("name", ""), t["highway"], ll))

def seg_dist(P, A, B):
    AB = B - A; L2 = AB @ AB
    if L2 < 1e-9:
        return np.hypot(*(P - A).T)
    t = np.clip(((P - A) @ AB) / L2, 0, 1)
    return np.hypot(*(P - (A + t[:, None] * AB)).T)

def main():
    cl = pd.read_csv(DATA / "winter_closures.csv", dtype={"route_no": str})
    h = Roads(set(cl.route_no)); h.apply_file(str(RAW / "hokkaido-latest.osm.pbf"), locations=True)
    ways = []
    for wid, refs, name, hw, ll in h.ways:
        x, y = to_km.transform(ll[:, 0], ll[:, 1]); P = np.c_[x, y]
        ways.append((wid, refs, name, hw, P, float(np.sum(np.hypot(*np.diff(P, axis=0).T)))))
    out = []
    for r in cl.itertuples():
        A = np.array(to_km.transform(r.from_lon, r.from_lat)); B = np.array(to_km.transform(r.to_lon, r.to_lat))
        L = float(r.length_km)
        same = np.hypot(*(A - B)) < 0.5
        R = max(3.0, 0.6 * L) if same else max(2.5, 0.25 * L)
        sel, km = [], 0.0
        for wid, refs, name, hw, P, wl in ways:
            if r.route_no not in refs:
                continue
            if np.mean(seg_dist(P, A, B) <= R) >= 0.5:
                sel.append(wid); km += wl
        out.append({"id": r.id, "road": r.road, "section": r.section, "listed_km": L,
                    "blocked_km": round(km, 1), "way_ids": sorted(sel)})
        print(f"{r.id} {r.road:10s} {r.section:24s} listed {L:5.1f} km  blocked {km:5.1f} km  ways {len(sel)}")
    (BUILD / "winter_blocked_ways.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
