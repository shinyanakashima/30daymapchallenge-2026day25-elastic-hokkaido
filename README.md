# Elastic Hokkaido

**#30DayMapChallenge 2026 · Day 25 “Is this a map?”** (posted 25 November 2026)

**Live:** https://shinyanakashima.github.io/30daymapchallenge-2026day25-elastic-hokkaido/

![Elastic Hokkaido](docs/screenshot.png)

A normal map keeps directions and neighbours and measures everything in kilometres.
Elastic Hokkaido keeps the directions and neighbours of Hokkaido's 179 municipalities but swaps the kilometre for **car driving time**, in summer and in winter.
The island stretches where roads are slow, shrinks where they are fast, and grows in winter when passes close and speeds drop.
At the end of the slider the directions are dropped as well and the towns collapse onto a single line ordered by driving time: a chart, no longer a map.

普通の地図は、方角と隣り合う関係を保ち、km で距離を測って描かれています。
この作品では北海道179市町村の方角と隣り合う関係はそのままに、地図の単位を km から **車の移動時間（夏・冬）** に取り替えました。
道路が遅いところで北海道が伸び、速いところで縮み、冬は峠の通行止めと速度の低下で大きくなります。
スライダーを右端まで動かすと方角も捨て、町を中心からの時間の順に1本の線に並べます。どこで地図でなくなるかを見る作品です。

## What you can do / 画面でできること

- **Unit / 単位**: km (normal map) · drive time, summer · drive time, winter
- **Method / 作り方**: radial from a centre (Sapporo or Obihiro) · all town pairs (MDS)
- **Slider / スライダー**: normal map → time map → a single line
- Tap a town for its straight-line and road distance and its summer and winter drive time from the centre. Towns that get much farther in winter are coloured and labelled; the summer outline is drawn as a dashed line over the winter map.
- English by default, 日本語 with one click. The state is kept in the URL hash (`#unit=winter&method=mds&center=obihiro&lang=ja&s=1`).
- Works on phones. With “reduce motion” enabled the shape changes without animation.

## Method / 計算と変形の方法

1. **Towns** – the 179 municipalities from 国土数値情報 N03 (Sapporo's 10 wards merged; the six villages of the Northern Territories are excluded because no road reaches them). Each town is represented by its town hall from 国土数値情報 P05 (本庁, code 1). For 旭川市, 湧別町 and 新ひだか町 the main building is recorded under code 2 and is picked by name (総合庁舎, 上湧別庁舎, 静内庁舎). Boundaries are dissolved and simplified with mapshaper (topology kept, so neighbours share the same vertices). Coordinates are projected to a transverse Mercator centred on Hokkaido, in km.
2. **Drive times** – OSRM v5.27.1 runs locally in Docker (MLD, car profile) on the OpenStreetMap Hokkaido extract. A 179 × 179 table of town-hall-to-town-hall durations is requested from the local server; the public demo server is never used. The profile (`profiles/car_hokkaido.lua`) is OSRM's `car.lua` with three changes:
   - ferries without a `duration` tag run at 30 km/h (OSRM's default of 5 km/h makes Rishiri, Rebun and Okushiri 14 hours away), no waiting time;
   - winter: listed OSM ways are treated as closed;
   - winter: every road speed is multiplied by a factor.
   Times are averaged over both directions.
3. **Winter** – WINTER_PLACEHOLDER
4. **Scale** – one scale *k* (km on the drawing per hour of driving) is fitted by least squares between straight-line distances and summer drive times over all town pairs, and used for every layout, so the winter map can grow relative to the summer one. *k* = SCALE_PLACEHOLDER km/h.
5. **Radial layout (中心型)** – each town keeps its bearing from the centre (Sapporo or Obihiro city hall) and its distance from the centre becomes *k* × drive time.
6. **All-pairs layout (全点型)** – metric MDS (classical MDS as the start, refined with SMACOF, scikit-learn) on *k* × drive time for all pairs, then an orthogonal Procrustes fit (rotation, reflection allowed, translation; scale fixed at *k*) to the normal map.
7. **Warping the map (補間)** – the displacement of the 179 town halls is interpolated over the plane with a **thin-plate spline** (`scipy.interpolate.RBFInterpolator`, kernel `thin_plate_spline`, smoothing 0, so it passes exactly through every town hall) and applied to every boundary and coastline vertex. Only the town-hall positions come from the travel times; everything in between is a choice of interpolation.
8. **Line (1本の線)** – the last stage of the slider places each town at *k* × drive time from the centre on a horizontal line (the same scale as the map), with a small vertical offset only to keep dots from overlapping.

## Results / 結果

ACCURACY_PLACEHOLDER

## Notes / 注記

- Drive times are computed with OSRM on OpenStreetMap road data. Congestion, weather and waiting at signals are not considered. / 時間は OpenStreetMap の道路データと OSRM による計算で、渋滞や天候は考慮していません。
- NOTES_WINTER_PLACEHOLDER
- The warp is an interpolation: only the town positions are fixed by data, the other shapes change with the method. / 変形は補間によるもので、町の位置以外の形は方法によって変わります。

## Data sources / データの出典

| Data | Source | Retrieved |
|---|---|---|
| Municipal boundaries and coastline | 国土数値情報（行政区域データ）N03, 2026-01-01 版, 北海道 (`N03-20260101_01_GML.zip`) – 出典：国土数値情報（行政区域データ）を加工して作成 | 2026-11-08 |
| Town halls | 国土数値情報（市町村役場等及び公的集会施設データ）P05, 2022 版, 北海道 (`P05-22_01_GML.zip`) – 出典：国土数値情報（市町村役場等及び公的集会施設データ）を加工して作成 | 2026-11-08 |
| Roads | OpenStreetMap, Hokkaido extract (data as of 2026-11-07 00:12 UTC), © OpenStreetMap contributors, ODbL. Geofabrik's `hokkaido-latest.osm.pbf` was not reachable from the build environment, so the same-scope extract from download.openstreetmap.fr (`extracts/asia/japan/hokkaido-latest.osm.pbf`) was used. | 2026-11-08 |
| Routing | OSRM v5.27.1 (`ghcr.io/project-osrm/osrm-backend:v5.27.1`) | 2026-11-08 |
| English names | OpenStreetMap `name:en` of the municipal boundaries | 2026-11-08 |
WINTER_SOURCES_PLACEHOLDER

## Reproduce / 再現手順

Requirements: Docker, Python 3.11+, Node.js 18+.

```sh
pip install geopandas shapely pyproj scipy scikit-learn requests osmium pandas
npm install -g mapshaper
scripts/download.sh                       # N03, P05, OSM extract → build/raw
cd scripts
python 01_municipalities.py               # polygons + town halls
python 02_names_en.py                     # English names from OSM
python 05_profile_params.py summer && ./osrm_build.sh summer
python 03_matrix.py summer                # 179 × 179 summer matrix (local OSRM)
python 04_winter_closures.py              # closed sections → OSM way ids
python 05_profile_params.py winter && ./osrm_build.sh winter
python 03_matrix.py winter
python 04_layout.py                       # layouts + accuracy
python 06_warp.py                         # thin-plate spline warp → web/data/elastic.json
python 07_notes.py                        # on-screen notes
cd ..
python -m http.server -d web 8123         # open http://127.0.0.1:8123/
node tests/check_page.mjs                 # Playwright check + docs/screenshot.png
```

The site in `web/` is deployed to GitHub Pages by `.github/workflows/pages.yml`.

## License

Code: MIT (see LICENSE). Data: © OpenStreetMap contributors (ODbL); 国土数値情報 (国土交通省); see the sources above.
