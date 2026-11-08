"""Build the 179 municipality polygons and town-hall points.

Inputs : build/raw/N03 (国土数値情報 行政区域), build/raw/P05 (市町村役場等及び公的集会施設)
Outputs: build/municipalities.geojson (simplified, shared topology), build/points.csv
"""
import json
import subprocess
import geopandas as gpd
import pandas as pd
from common import BUILD, RAW

N03 = RAW / "N03" / "N03-20260101_01.geojson"
P05 = RAW / "P05" / "P05-22_01.geojson"
NORTHERN_TERRITORIES = {"01695", "01696", "01697", "01698", "01699", "01700"}

MAIN_OFFICE_OVERRIDES = {("01204", "総合庁舎"), ("01559", "上湧別庁舎"), ("01610", "静内庁舎")}

# English names (Hepburn) are kept in data/municipality_names_en.csv
def main():
    n03 = gpd.read_file(N03)
    n03 = n03[n03["N03_007"].notna()]
    n03 = n03[~n03["N03_007"].isin(NORTHERN_TERRITORIES)].copy()
    n03["code"] = n03["N03_007"].where(~n03["N03_007"].str.startswith("011"), "01100")
    n03["name"] = n03["N03_004"]
    n03["subpref"] = n03["N03_002"]
    pre = BUILD / "n03_prep.geojson"
    n03[["code", "name", "subpref", "geometry"]].to_file(pre, driver="GeoJSON")

    out = BUILD / "municipalities.geojson"
    subprocess.run([
        "mapshaper", str(pre),
        "-dissolve2", "code", "copy-fields=name,subpref",
        "-filter-islands", "min-area=4km2", "remove-empty",
        "-simplify", "dp", "interval=250", "keep-shapes",
        "-clean",
        "-o", str(out), "format=geojson", "precision=0.00001",
    ], check=True)
    muni = gpd.read_file(out)
    print("municipalities:", len(muni))

    # Town halls: P05_002 == '1' is 本庁 (city hall / town or village office).
    p05 = gpd.read_file(P05)
    halls = p05[p05["P05_002"] == "1"].copy()
    # Three main offices are recorded as 支所・庁舎 (code 2) in P05-22.
    extra = p05[p05["P05_002"] == "2"]
    extra = extra[[(c, n) in MAIN_OFFICE_OVERRIDES for c, n in zip(extra["P05_001"], extra["P05_003"])]]
    halls = pd.concat([halls, extra])
    halls["code"] = halls["P05_001"].where(~halls["P05_001"].str.startswith("011"), "01100")
    sapporo = halls[halls["P05_003"] == "札幌市役所"]
    halls = pd.concat([halls[halls["code"] != "01100"], sapporo])
    halls = halls.drop_duplicates("code")
    pts = muni[["code", "name", "subpref"]].merge(
        pd.DataFrame({"code": halls["code"], "hall": halls["P05_003"],
                      "lon": halls.geometry.x, "lat": halls.geometry.y}),
        on="code", how="left")
    missing = pts[pts["lon"].isna()]
    if len(missing):
        print("missing town halls:", missing[["code", "name"]].values.tolist())
    pts.to_csv(BUILD / "points_raw.csv", index=False)

if __name__ == "__main__":
    main()
