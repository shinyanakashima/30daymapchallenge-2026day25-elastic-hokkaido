"""English municipality names from OpenStreetMap administrative boundaries (name:en)."""
import csv
import osmium
import pandas as pd
from common import BUILD, RAW

class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.rows = []
    def relation(self, r):
        t = r.tags
        if t.get("boundary") == "administrative" and t.get("admin_level") in ("7",):
            self.rows.append((t.get("name"), t.get("name:en"), t.get("ref"), t.get("jisx0402") or t.get("ref:jisx0402")))

h = H(); h.apply_file(str(RAW / "hokkaido-latest.osm.pbf"))
osm = pd.DataFrame(h.rows, columns=["name", "name_en", "ref", "jis"])
pts = pd.read_csv(BUILD / "points_raw.csv", dtype={"code": str})
osm["jis5"] = osm["jis"].fillna("").str[:5]
by_code = {r.jis5: r.name_en for r in osm.itertuples() if r.jis5 and isinstance(r.name_en, str)}
by_name = {r.name: r.name_en for r in osm.itertuples() if isinstance(r.name_en, str)}
pts["name_en"] = [by_code.get(c) or by_name.get(n) for c, n in zip(pts.code, pts.name)]
print(pts[pts.name_en.isna()][["code", "name"]].to_string())
pts[["code", "name", "name_en"]].to_csv(BUILD / "names_en_osm.csv", index=False)
