#!/usr/bin/env bash
# Build an OSRM (MLD) dataset for one scenario with profiles/car_hokkaido.lua.
# usage: scripts/osrm_build.sh summer|winter   (needs build/params_<scenario>.lua)
set -euo pipefail
cd "$(dirname "$0")/.."
SCEN="$1"
IMG=ghcr.io/project-osrm/osrm-backend:v5.27.1
DIR="build/osrm/$SCEN"
rm -rf "$DIR"; mkdir -p "$DIR"
ln -f build/raw/hokkaido-latest.osm.pbf "$DIR/hokkaido.osm.pbf"
cp profiles/car_hokkaido.lua "$DIR/car_hokkaido.lua"
cp "build/params_$SCEN.lua" "$DIR/params.lua"
docker run --rm -v "$PWD/$DIR:/data" -w /data $IMG osrm-extract -p /data/car_hokkaido.lua /data/hokkaido.osm.pbf
docker run --rm -v "$PWD/$DIR:/data" $IMG osrm-partition /data/hokkaido.osrm
docker run --rm -v "$PWD/$DIR:/data" $IMG osrm-customize /data/hokkaido.osrm
