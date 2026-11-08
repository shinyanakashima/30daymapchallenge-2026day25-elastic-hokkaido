"""Shared paths and projection."""
from pathlib import Path
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
RAW = BUILD / "raw"
WEB_DATA = ROOT / "web" / "data"
DATA = ROOT / "data"

# Transverse Mercator centred on Hokkaido, in kilometres.
PROJ = "+proj=tmerc +lat_0=43.5 +lon_0=142.8 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=km +no_defs"
to_km = Transformer.from_crs("EPSG:4326", PROJ, always_xy=True)
to_lonlat = Transformer.from_crs(PROJ, "EPSG:4326", always_xy=True)

CENTERS = {"sapporo": "01100", "obihiro": "01207"}
SCENARIOS = ["summer", "winter"]
