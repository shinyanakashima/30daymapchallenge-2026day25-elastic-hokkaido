"""Turn the winter closure list (data/winter_closures.csv) into OSM way ids.

For each closed section the summer OSRM graph is asked for the route between the
two ends of the section; the OSM ways on that route that carry the section's road
number (ref) are marked as closed. Output: build/winter_blocked_ways.json
"""
import json
import subprocess
import time
import osmium
import pandas as pd
import requests
from common import BUILD, DATA, RAW, ROOT

IMG = "ghcr.io/project-osrm/osrm-backend:v5.27.1"
PORT = 5001

def route_nodes(sess, a, b):
    url = f"http://127.0.0.1:{PORT}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}"
    r = sess.get(url, params={"overview": "false", "annotations": "nodes"}, timeout=60).json()
    if r.get("code") != "Ok":
        return [], None
    nodes = [n for leg in r["routes"][0]["legs"] for n in leg["annotation"]["nodes"]]
    return nodes, r["routes"][0]["distance"] / 1000

class WayFinder(osmium.SimpleHandler):
    def __init__(self, pairs):
        super().__init__(); self.pairs = pairs; self.hits = {}
    def way(self, w):
        if "highway" not in w.tags:
            return
        ns = [n.ref for n in w.nodes]
        for a, b in zip(ns, ns[1:]):
            for sec in self.pairs.get((a, b), ()) | self.pairs.get((b, a), set()):
                self.hits.setdefault(sec, {})[w.id] = (w.tags.get("ref"), w.tags.get("name"), w.tags.get("highway"))

def main():
    cl = pd.read_csv(DATA / "winter_closures.csv", dtype=str)
    name = "osrm-closures"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    subprocess.run(["docker", "run", "-d", "--name", name, "-p", f"{PORT}:5000",
                    "-v", f"{ROOT / 'build' / 'osrm' / 'summer'}:/data", IMG,
                    "osrm-routed", "--algorithm", "mld", "/data/hokkaido.osrm"], check=True)
    sess = requests.Session(); sess.trust_env = False
    for _ in range(120):
        try:
            sess.get(f"http://127.0.0.1:{PORT}/nearest/v1/driving/141.35,43.06", timeout=2); break
        except requests.RequestException:
            time.sleep(1)
    pairs, lengths = {}, {}
    try:
        for r in cl.itertuples():
            a = (float(r.from_lat), float(r.from_lon)); b = (float(r.to_lat), float(r.to_lon))
            nodes, km = route_nodes(sess, a, b)
            lengths[r.id] = km
            for x, y in zip(nodes, nodes[1:]):
                pairs.setdefault((x, y), set()).add(r.id)
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    wf = WayFinder(pairs); wf.apply_file(str(RAW / "hokkaido-latest.osm.pbf"))
    out = []
    for r in cl.itertuples():
        hits = wf.hits.get(r.id, {})
        refs = set(str(r.route_no).split("|"))
        keep = {w: v for w, v in hits.items() if v[0] and set(v[0].split(";")) & refs}
        out.append({"id": r.id, "road": r.road, "section": r.section, "route_km": lengths[r.id],
                    "way_ids": sorted(keep), "ways_on_route": len(hits),
                    "names": sorted({v[1] or "" for v in keep.values()})})
        print(f"{r.id:4s} {r.road:14s} {r.section:16s} route {lengths[r.id] or 0:6.1f} km  ways {len(keep):3d}/{len(hits):3d}")
    (BUILD / "winter_blocked_ways.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
