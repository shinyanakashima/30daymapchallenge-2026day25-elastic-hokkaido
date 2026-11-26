"""Summer satellite layer: NASA Blue Marble Next Generation, warped like the map.

1. Download the Blue Marble Next Generation mosaic for the Hokkaido extent from NASA GIBS (WMS).
2. Keep Hokkaido (the 179 municipalities, 0.5 km feathered buffer); other land (Honshu, Sakhalin,
   the Kuril Islands) and the sea are painted with one ocean colour (#123556), because only
   Hokkaido is warped. Land is brightened slightly (x1.25, gamma 0.85) so it reads on screen.
3. A regular mesh (6 km) over the extent is warped with the same thin-plate spline as the
   boundaries, for the normal map and the summer layouts; the image is draped on it in the browser.
Output: web/data/summer_satellite.jpg, web/data/satellite_mesh.json
"""
import io
import json
import numpy as np
import geopandas as gpd
import requests
from PIL import Image, ImageDraw, ImageFilter
from scipy.interpolate import RBFInterpolator
from common import BUILD, WEB_DATA, to_km, to_lonlat

W_LON, E_LON, S_LAT, N_LAT = 139.0, 146.6, 41.0, 46.0
PX = 2048
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
STEP_KM = 6.0

def download():
    h = int(round(PX * (N_LAT - S_LAT) / (E_LON - W_LON)))
    params = {"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0", "LAYERS": "BlueMarble_NextGeneration",
              "STYLES": "", "CRS": "EPSG:4326", "BBOX": f"{S_LAT},{W_LON},{N_LAT},{E_LON}",
              "WIDTH": PX, "HEIGHT": h, "FORMAT": "image/png"}
    raw = BUILD / "raw" / "bluemarble_hokkaido.png"
    if not raw.exists():
        r = requests.get(GIBS, params=params, timeout=120); r.raise_for_status()
        raw.write_bytes(r.content)
    return Image.open(raw).convert("RGB")

def to_px(lon, lat, w, h):
    return (lon - W_LON) / (E_LON - W_LON) * w, (N_LAT - lat) / (N_LAT - S_LAT) * h

def main():
    img = download(); w, h = img.size
    muni = gpd.read_file(BUILD / "municipalities.geojson")
    land = muni.to_crs("EPSG:6680").buffer(500).to_crs("EPSG:4326").union_all()
    mask = Image.new("L", (w, h), 0); dr = ImageDraw.Draw(mask)
    for poly in getattr(land, "geoms", [land]):
        dr.polygon([to_px(x, y, w, h) for x, y in poly.exterior.coords], fill=255)
        for hole in poly.interiors:
            dr.polygon([to_px(x, y, w, h) for x, y in hole.coords], fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(3))
    a = np.asarray(img).astype(float) / 255
    m = np.asarray(mask).astype(float)[..., None] / 255
    ocean = np.array([0x12, 0x35, 0x56]) / 255
    bright = np.clip((a * 1.25) ** 0.85, 0, 1)
    out = bright * m + ocean * (1 - m)
    Image.fromarray((out * 255).astype(np.uint8)).save(WEB_DATA / "summer_satellite.jpg", quality=85, optimize=True)
    ocean_hex = "#" + "".join(f"{int(v * 255):02x}" for v in ocean)

    # mesh in km over the image extent
    corners = np.array([to_km.transform(lo, la) for lo in (W_LON, E_LON) for la in (S_LAT, N_LAT)])
    x0, y0 = corners.min(0); x1, y1 = corners.max(0)
    xs = np.arange(x0, x1 + STEP_KM, STEP_KM); ys = np.arange(y0, y1 + STEP_KM, STEP_KM)
    GX, GY = np.meshgrid(xs, ys); G = np.c_[GX.ravel(), GY.ravel()]
    lon, lat = to_lonlat.transform(G[:, 0], G[:, 1])
    U = (lon - W_LON) / (E_LON - W_LON); V = (N_LAT - lat) / (N_LAT - S_LAT)
    nx, ny = len(xs), len(ys)
    tris = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            p = j * nx + i
            tris += [p, p + 1, p + nx, p + 1, p + nx + 1, p + nx]
    lay = dict(np.load(BUILD / "layouts.npz")); P0 = lay["km"]
    states = {}
    for key in ["km", "summer-radial-sapporo", "summer-radial-obihiro", "summer-mds"]:
        if key == "km":
            M = G
        else:
            M = G + RBFInterpolator(P0, lay[key] - P0, kernel="thin_plate_spline", smoothing=0.0)(G)
        states[key] = np.round(M * 10).astype(int).ravel().tolist()
    out = {"image": "summer_satellite.jpg", "ocean": ocean_hex,
           "uv": np.round(np.c_[U, V], 5).ravel().tolist(), "tris": tris, "states": states}
    (WEB_DATA / "satellite_mesh.json").write_text(json.dumps(out, separators=(",", ":")))
    print("image", img.size, "ocean", ocean_hex, "mesh", nx, "x", ny, "vertices",
          round((WEB_DATA / "satellite_mesh.json").stat().st_size / 1e6, 2), "MB",
          round((WEB_DATA / "summer_satellite.jpg").stat().st_size / 1e6, 2), "MB")

if __name__ == "__main__":
    main()
