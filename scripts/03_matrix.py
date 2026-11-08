"""Query a local OSRM server for the town-hall travel-time matrix.

usage: python 03_matrix.py summer|winter
Starts osrm-routed in Docker on localhost:5000 (never the public demo server),
writes build/matrix_<scenario>.json with durations (s) and distances (m).
"""
import json
import subprocess
import sys
import time
import pandas as pd
import requests
from common import BUILD, ROOT

IMG = "ghcr.io/project-osrm/osrm-backend:v5.27.1"
PORT = 5000

def start_server(scen):
    name = f"osrm-{scen}"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    subprocess.run(["docker", "run", "-d", "--name", name, "-p", f"{PORT}:5000",
                    "-v", f"{ROOT / 'build' / 'osrm' / scen}:/data", IMG,
                    "osrm-routed", "--algorithm", "mld", "--max-table-size", "1000",
                    "/data/hokkaido.osrm"], check=True)
    for _ in range(120):
        try:
            requests.get(f"http://127.0.0.1:{PORT}/nearest/v1/driving/141.35,43.06", timeout=2)
            return name
        except requests.RequestException:
            time.sleep(1)
    raise RuntimeError("osrm-routed did not start")

def main(scen):
    pts = pd.read_csv(BUILD / "points_raw.csv", dtype={"code": str})
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in zip(pts.lon, pts.lat))
    name = start_server(scen)
    try:
        s = requests.Session()
        s.trust_env = False
        r = s.get(f"http://127.0.0.1:{PORT}/table/v1/driving/{coords}",
                  params={"annotations": "duration,distance"}, timeout=600)
        r.raise_for_status()
        j = r.json()
        snap = [w["distance"] for w in j["sources"]]
        out = {"codes": pts.code.tolist(), "durations": j["durations"],
               "distances": j["distances"], "snap_m": snap}
        (BUILD / f"matrix_{scen}.json").write_text(json.dumps(out))
        nulls = sum(v is None for row in j["durations"] for v in row)
        print(scen, "matrix", len(pts), "x", len(pts), "unreachable cells:", nulls,
              "max snap m:", round(max(snap)))
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)

if __name__ == "__main__":
    main(sys.argv[1])
