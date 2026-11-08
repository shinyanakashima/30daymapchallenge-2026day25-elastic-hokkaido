"""New town positions for each unit and method, plus accuracy figures.

Units  : km (original map), summer drive time, winter drive time
Methods: radial (centre = Sapporo or Obihiro), all-pairs (MDS + Procrustes)

One scale k (km of drawing per hour of driving) is fitted once on the summer
matrix and reused for every layout, so the winter map can grow relative to summer.
"""
import json
import warnings
import numpy as np
import pandas as pd
from scipy.linalg import orthogonal_procrustes
from sklearn.manifold import MDS
from common import BUILD, CENTERS, SCENARIOS, to_km

warnings.filterwarnings("ignore", category=FutureWarning)

def load_matrix(scen, n):
    m = json.loads((BUILD / f"matrix_{scen}.json").read_text())
    T = np.array([[np.nan if v is None else v for v in row] for row in m["durations"]], float) / 3600
    L = np.array([[np.nan if v is None else v for v in row] for row in m["distances"]], float) / 1000
    assert T.shape == (n, n)
    return (T + T.T) / 2, (L + L.T) / 2

def pair_mask(n):
    return np.triu(np.ones((n, n), bool), 1)

def classical_mds(D):
    n = len(D)
    J = np.eye(n) - 1 / n
    B = -0.5 * J @ (D ** 2) @ J
    w, v = np.linalg.eigh(B)
    idx = np.argsort(w)[::-1][:2]
    return v[:, idx] * np.sqrt(np.maximum(w[idx], 0))

def mds_layout(D, P0):
    init = classical_mds(D)
    mds = MDS(n_components=2, metric=True, dissimilarity="precomputed", n_init=1,
              max_iter=3000, eps=1e-9, normalized_stress=False, random_state=0)
    X = mds.fit_transform(D, init=init)
    # Procrustes: rotation (reflection allowed, MDS has no handedness) + translation, scale fixed.
    Xc, Pc = X - X.mean(0), P0 - P0.mean(0)
    R, _ = orthogonal_procrustes(Xc, Pc)
    return Xc @ R + P0.mean(0)

def radial_layout(T, P0, c, k):
    d = P0 - P0[c]
    r = np.hypot(d[:, 0], d[:, 1])
    u = np.divide(d, r[:, None], out=np.zeros_like(d), where=r[:, None] > 0)
    return P0[c] + u * (k * T[c])[:, None]

def errors(P, T, k, mask):
    D = np.hypot(*(P[:, None, :] - P[None, :, :]).transpose(2, 0, 1))
    m = mask & np.isfinite(T)
    t_map = D[m] / k               # hours implied by the drawing
    t = T[m]
    diff = (t_map - t) * 60
    return {
        "rmse_min": float(np.sqrt(np.mean(diff ** 2))),
        "mae_min": float(np.mean(np.abs(diff))),
        "median_abs_pct": float(np.median(np.abs(t_map - t) / t) * 100),
        "stress1": float(np.sqrt(np.sum((D[m] - k * t) ** 2) / np.sum(D[m] ** 2))),
    }

def main():
    pts = pd.read_csv(BUILD / "points_raw.csv", dtype={"code": str})
    n = len(pts)
    x, y = to_km.transform(pts.lon.values, pts.lat.values)
    P0 = np.c_[x, y]
    mats = {s: load_matrix(s, n) for s in SCENARIOS}
    mask = pair_mask(n)
    D0 = np.hypot(*(P0[:, None, :] - P0[None, :, :]).transpose(2, 0, 1))
    Ts = mats["summer"][0]
    m = mask & np.isfinite(Ts)
    k = float(np.sum(D0[m] * Ts[m]) / np.sum(Ts[m] ** 2))
    print(f"scale k = {k:.2f} km per hour")

    layouts = {"km": P0}
    acc = {"scale_km_per_h": k, "rows": []}
    for s in SCENARIOS:
        T = mats[s][0]
        acc["rows"].append({"unit": s, "method": "original map", "center": None, **errors(P0, T, k, mask)})
    for s in SCENARIOS:
        T = mats[s][0]
        for cname, ccode in CENTERS.items():
            c = int(np.where(pts.code == ccode)[0][0])
            P = radial_layout(T, P0, c, k)
            layouts[f"{s}-radial-{cname}"] = P
            e = errors(P, T, k, mask)
            acc["rows"].append({"unit": s, "method": "radial", "center": cname, **e})
        T_f = np.where(np.isfinite(T), T, np.nanmax(T))
        P = mds_layout(k * T_f, P0)
        layouts[f"{s}-mds"] = P
        acc["rows"].append({"unit": s, "method": "mds", "center": None, **errors(P, T, k, mask)})
    for r in acc["rows"]:
        print(f'{r["unit"]:7s} {r["method"]:13s} {str(r["center"]):8s} rmse {r["rmse_min"]:6.1f} min  '
              f'mae {r["mae_min"]:6.1f} min  median|%| {r["median_abs_pct"]:5.1f}  stress {r["stress1"]:.3f}')
    np.savez(BUILD / "layouts.npz", **layouts)
    (BUILD / "accuracy.json").write_text(json.dumps(acc, indent=1))

if __name__ == "__main__":
    main()
