#!/usr/bin/env bash
# Download the source data into build/raw.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/raw && cd build/raw
curl -fsSLO https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2026/N03-20260101_01_GML.zip
curl -fsSLO https://nlftp.mlit.go.jp/ksj/gml/data/P05/P05-22/P05-22_01_GML.zip
unzip -oq N03-20260101_01_GML.zip -d N03
unzip -oq P05-22_01_GML.zip -d P05
curl -fsSL -o hokkaido-latest.osm.pbf https://download.geofabrik.de/asia/japan/hokkaido-latest.osm.pbf \
  || curl -fsSL -o hokkaido-latest.osm.pbf https://download.openstreetmap.fr/extracts/asia/japan/hokkaido-latest.osm.pbf
docker pull ghcr.io/project-osrm/osrm-backend:v5.27.1
