"""Add the on-screen notes (EN/JA) to web/data/elastic.json."""
import html
import json
import pandas as pd
from common import BUILD, DATA, WEB_DATA

def main():
    p = WEB_DATA / "elastic.json"
    d = json.loads(p.read_text())
    meta = json.loads((DATA / "sources.json").read_text())
    ws = json.loads((DATA / "winter_speed.json").read_text())
    cl = pd.read_csv(DATA / "winter_closures.csv", dtype=str)
    q = json.loads((BUILD / "warp_quality.json").read_text())
    k = d["scale_km_per_h"]
    folds = max(v["self_intersecting_municipalities"] for v in q.values())
    e = html.escape
    li_en = "".join(f"<li>{e(r.road_en)} {e(r.section_en)}</li>" for r in cl.itertuples())
    li_ja = "".join(f"<li>{e(r.road)} {e(r.section)}</li>" for r in cl.itertuples())
    src = "".join(f'<li><a href="{e(s["url"])}" rel="noopener" target="_blank">{e(s["title"])}</a>{(" (" + e(s["note"]) + ")") if s.get("note") else ""}</li>'
                  for s in meta["sources"])
    fac = ws["factors"]
    fac_en = ", ".join(f'{e(c)} ×{v}' for c, v in ws["display"].items())
    en = f"""
<p><b>Is this a map?</b> A normal map keeps directions and neighbours and measures everything in kilometres.
Here the kilometre is swapped for driving time. The 179 towns keep their directions, the island stretches where roads are slow and shrinks where they are fast.
Push the slider to the end and the directions are dropped too, leaving a single line: a chart, not a map.</p>
<ul>
<li><b>Drive times</b> are computed with OSRM ({e(meta["osrm"])}, car profile) on OpenStreetMap roads (extract of {e(meta["osm_date"])}), between town halls. Congestion, weather and waiting at signals are not considered. Ferries (Rishiri, Rebun, Okushiri) are counted at {meta["ferry_kmh"]} km/h with no waiting time.</li>
<li><b>Winter</b>: {len(cl)} sections that are closed in winter are removed from the road network:<ul>{li_en}</ul>
Speeds are multiplied by {fac_en}. {e(ws["basis_en"])}</li>
<li><b>Two ways to place towns.</b> Radial: each town keeps its direction from the centre and its distance from the centre becomes the drive time (exact for the centre, approximate for other pairs). All pairs: classical multidimensional scaling refined with SMACOF on all town-to-town times, then rotated and shifted to fit the normal map (Procrustes, scale fixed).</li>
<li><b>Scale.</b> 1 hour of driving = {k:.1f} km on the drawing, fitted once on summer times and used for every layout, so winter can grow.</li>
<li><b>Shapes are interpolated.</b> Only the town-hall positions come from the travel times. Boundaries and the coastline are bent with a thin-plate spline through the town halls; another interpolation would give other shapes. In the strongest layouts up to {folds} municipalities fold over themselves.</li>
<li><b>Fit</b>: how far distances on each drawing are from the drive times (all 15,931 town pairs; median of the relative error, RMSE in minutes, Kruskal stress-1).{{{{ACCURACY}}}}</li>
<li>The six villages of the Northern Territories are not included (no road link).</li>
</ul>
<p><b>Sources</b></p><ul>{src}</ul>
<p>Code and data processing: <a href="https://github.com/shinyanakashima/30daymapchallenge-2026day25-elastic-hokkaido" target="_blank" rel="noopener">GitHub</a>. #30DayMapChallenge 2026 Day 25 “Is this a map?”</p>
"""
    fac_ja = "、".join(f'{e(c)} ×{v}' for c, v in ws["display_ja"].items())
    ja = f"""
<p><b>これは地図か？</b> 普通の地図は、方角と隣り合う関係を保ち、km で距離を測って描かれています。
この図では km を車の移動時間に取り替えました。179市町村は方角を保ったまま、道路が遅いところで北海道が伸び、速いところで縮みます。
スライダーを右端まで動かすと方角も捨て、1本の線（図表）になります。</p>
<ul>
<li><b>移動時間</b>は、OpenStreetMap の道路データ（{e(meta["osm_date"])} 時点の抽出）と OSRM（{e(meta["osrm"])}、車のプロファイル）で計算した市町村役場どうしの時間です。渋滞・天候・信号待ちは考慮していません。フェリー（利尻・礼文・奥尻）は待ち時間なしの {meta["ferry_kmh"]} km/h としています。</li>
<li><b>冬</b>：冬期通行止めの {len(cl)} 区間を道路網から除いています。<ul>{li_ja}</ul>
速度は {fac_ja} としています。{e(ws["basis_ja"])}</li>
<li><b>町の置き方は2通り</b>。中心型：中心から見た方角を保ち、中心からの距離を移動時間に置き換えます（中心との組は正確、それ以外の組は近似）。全点型：全ての町どうしの時間から多次元尺度法（古典的MDS＋SMACOF）で配置を求め、普通の地図に最も合うよう回転・平行移動しています（プロクラステス解析、縮尺は固定）。</li>
<li><b>縮尺</b>：車で1時間＝図の上の {k:.1f} km。夏の時間で一度だけ求め、全ての図で同じ値を使うので、冬は夏より大きくなります。</li>
<li><b>形は補間によるもの</b>です。移動時間から決まるのは役場の位置だけで、境界と海岸線は役場を通る薄板スプラインで曲げています。補間の方法が変われば形も変わります。変形の大きい図では、最大 {folds} 市町村で境界が折り重なっています。</li>
<li><b>精度</b>：図の上の距離と移動時間のずれ（全15,931組。相対誤差の中央値、RMSE（分）、Kruskal の stress-1）。{{{{ACCURACY}}}}</li>
<li>北方領土の6村は道路で結ばれていないため含めていません。</li>
</ul>
<p><b>出典</b></p><ul>{src}</ul>
<p>コードと処理手順：<a href="https://github.com/shinyanakashima/30daymapchallenge-2026day25-elastic-hokkaido" target="_blank" rel="noopener">GitHub</a>。#30DayMapChallenge 2026 Day 25「Is this a map?」</p>
"""
    d["notes"] = {"en": {"html": en}, "ja": {"html": ja}}
    p.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    print("notes added")

if __name__ == "__main__":
    main()
