"""Warp municipality polygons with a thin-plate spline and export web data.

For every layout in build/layouts.npz the displacement of the 179 town halls is
interpolated over the plane with a thin-plate spline (scipy RBFInterpolator,
kernel='thin_plate_spline', smoothing=0, i.e. exact at the town halls) and applied to every
boundary vertex. Shared vertices stay shared, so neighbours stay neighbours.
Output: web/data/elastic.json
"""
import json
import numpy as np
import pandas as pd
import geopandas as gpd
from scipy.interpolate import RBFInterpolator
from shapely.geometry import Polygon
from common import BUILD, CENTERS, SCENARIOS, WEB_DATA, to_km

DUP_EN = {"01206": "Kushiro", "01661": "Kushiro (town)", "01361": "Esashi (Hiyama)",
          "01514": "Esashi (Soya)", "01220": "Shibetsu (Kamikawa)", "01693": "Shibetsu (Nemuro)"}

def build_topology(gdf):
    key_to_idx, verts, rings, polys = {}, [], [], []
    def vid(xy):
        k = (round(xy[0], 6), round(xy[1], 6))
        if k not in key_to_idx:
            key_to_idx[k] = len(verts); verts.append(k)
        return key_to_idx[k]
    for code, geom in zip(gdf.code, gdf.geometry):
        parts = geom.geoms if geom.geom_type == "MultiPolygon" else [geom]
        ring_ids = []
        for part in parts:
            for ring in [part.exterior, *part.interiors]:
                ids = [vid(c) for c in list(ring.coords)[:-1]]
                ring_ids.append(len(rings)); rings.append(ids)
        polys.append({"code": code, "rings": ring_ids})
    return np.array(verts), rings, polys

def coast_lines(rings):
    from collections import Counter, defaultdict
    cnt = Counter()
    for r in rings:
        for a, b in zip(r, r[1:] + r[:1]):
            cnt[(min(a, b), max(a, b))] += 1
    edges = [e for e, c in cnt.items() if c == 1]
    adj = defaultdict(list)
    for a, b in edges:
        adj[a].append(b); adj[b].append(a)
    seen, lines = set(), []
    for a, b in edges:
        if (a, b) in seen:
            continue
        line = [a, b]; seen.add((a, b))
        while True:
            last, prev = line[-1], line[-2]
            nxt = [v for v in adj[last] if v != prev and (min(last, v), max(last, v)) not in seen]
            if not nxt or last == line[0]:
                break
            v = nxt[0]; seen.add((min(last, v), max(last, v))); line.append(v)
        lines.append(line)
    return lines

def main():
    muni = gpd.read_file(BUILD / "municipalities.geojson")
    pts = pd.read_csv(BUILD / "points_raw.csv", dtype={"code": str})
    names = pd.read_csv(BUILD / "names_en_osm.csv", dtype=str).set_index("code")["name_en"].to_dict()
    names.update(DUP_EN)
    lay = dict(np.load(BUILD / "layouts.npz"))
    P0 = lay["km"]

    verts_ll, rings, polys = build_topology(muni)
    vx, vy = to_km.transform(verts_ll[:, 0], verts_ll[:, 1])
    V0 = np.c_[vx, vy]
    print("vertices:", len(V0), "rings:", len(rings))

    states, town_pos, quality = {}, {}, {}
    for key, P in lay.items():
        if key == "km":
            V = V0
        else:
            f = RBFInterpolator(P0, P - P0, kernel="thin_plate_spline", smoothing=0.0)
            V = V0 + f(V0)
        states[key] = np.round(V * 10).astype(int).ravel().tolist()
        town_pos[key] = np.round(P * 10).astype(int).ravel().tolist()
        bad = 0
        for poly in polys:
            for ri in poly["rings"]:
                if not Polygon(V[rings[ri]]).is_valid:
                    bad += 1; break
        quality[key] = {"self_intersecting_municipalities": bad}
        print(f"{key:24s} self-intersecting municipalities: {bad}")

    mats = {s: json.loads((BUILD / f"matrix_{s}.json").read_text()) for s in SCENARIOS}
    towns = []
    for i, r in pts.iterrows():
        t = {"code": r.code, "ja": r["name"], "en": names[r.code], "subpref": r.subpref,
             "hall": r.hall}
        for cname, ccode in CENTERS.items():
            c = int(np.where(pts.code == ccode)[0][0])
            t[f"km_{cname}"] = round(float(np.hypot(*(P0[i] - P0[c]))), 1)
            for s in SCENARIOS:
                m = mats[s]
                d = (m["durations"][c][i] + m["durations"][i][c]) / 2 / 60
                l = (m["distances"][c][i] + m["distances"][i][c]) / 2 / 1000
                t[f"min_{s}_{cname}"] = round(d, 1)
                t[f"road_{s}_{cname}"] = round(l, 1)
        towns.append(t)

    acc = json.loads((BUILD / "accuracy.json").read_text())
    out = {
        "scale_km_per_h": acc["scale_km_per_h"],
        "towns": towns,
        "rings": rings,
        "polys": polys,
        "coast": coast_lines(rings),
        "states": states,
        "towns_pos": town_pos,
        "accuracy": acc["rows"],
        "warp_quality": quality,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "elastic.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    (BUILD / "warp_quality.json").write_text(json.dumps(quality, indent=1))
    print("wrote", WEB_DATA / "elastic.json", round((WEB_DATA / "elastic.json").stat().st_size / 1e6, 2), "MB")

if __name__ == "__main__":
    main()
