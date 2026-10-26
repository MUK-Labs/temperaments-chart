#!/usr/bin/env python3
"""Build the atlas coastline without a map service or JavaScript dependency.

Source: Natural Earth, 1:110m land polygons, public domain; the copy used by
Adrián Artacho's Tuning/sandbox/Preferences research is kept in assets/land.geojson.
No political borders or historical areas of tuning practice are represented.

Run from any directory: python scripts/build-map.py
The shared projection contract is emitted to assets/map-projection.json.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1000, 660
WEST, EAST, SOUTH = -15.0, 35.0, 36.0
SCALE = WIDTH / math.radians(EAST - WEST)
SOUTH_M = math.log(math.tan(math.pi / 4 + math.radians(SOUTH) / 2))
NORTH_M = SOUTH_M + HEIGHT / SCALE
NORTH = math.degrees(2 * math.atan(math.exp(NORTH_M)) - math.pi / 2)


def project(point):
    """Return SVG pixels for a (longitude, latitude) pair."""
    lon, lat = point[:2]
    return (
        math.radians(lon - WEST) * SCALE,
        (NORTH_M - math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
        * SCALE,
    )


def clip_ring(points):
    """Clip a polygon ring to the geographic rectangle before projection."""
    ring = [list(p[:2]) for p in points]
    if ring and ring[0] == ring[-1]:
        ring.pop()
    for axis, bound, greater in ((0, WEST, True), (0, EAST, False),
                                  (1, SOUTH, True), (1, NORTH, False)):
        if not ring:
            break
        result = []
        previous = ring[-1]
        previous_inside = previous[axis] >= bound if greater else previous[axis] <= bound
        for current in ring:
            inside = current[axis] >= bound if greater else current[axis] <= bound
            if inside != previous_inside:
                fraction = (bound - previous[axis]) / (current[axis] - previous[axis])
                crossing = [previous[i] + fraction * (current[i] - previous[i]) for i in (0, 1)]
                crossing[axis] = bound
                result.append(crossing)
            if inside:
                result.append(current)
            previous, previous_inside = current, inside
        ring = result
    return ring


def svg_ring(points):
    ring = clip_ring(points)
    if len(ring) < 3:
        return ""
    projected = [project(point) for point in ring]
    return "M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in projected) + "Z"


def polygons(geometry):
    kind = geometry["type"]
    if kind == "Polygon":
        return [geometry["coordinates"]]
    if kind == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"Unsupported land geometry: {kind}")


def main():
    source_path = ROOT / "assets" / "land.geojson"
    data = json.loads(source_path.read_text(encoding="utf-8"))
    paths = []
    for feature in data["features"]:
        for polygon in polygons(feature["geometry"]):
            path = "".join(svg_ring(ring) for ring in polygon)
            if path:
                paths.append(f'<path d="{path}"/>')

    grid = []
    for longitude in range(-10, 36, 10):
        x, _ = project((longitude, SOUTH))
        grid.append(f'<path d="M{x:.2f},0V{HEIGHT}"/>')
    for latitude in range(40, 59, 5):
        _, y = project((WEST, latitude))
        grid.append(f'<path d="M0,{y:.2f}H{WIDTH}"/>')

    description = (
        "European coastlines in a spherical Mercator projection. "
        "Natural Earth 1:110m land, public domain. No political or historical borders. "
        "Background geography only; evidence markers are overlaid by the atlas."
    )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 660" '
        'role="img" aria-labelledby="map-title map-description">\n'
        '<title id="map-title">Europe: geographic reference map</title>\n'
        f'<desc id="map-description">{escape(description)}</desc>\n'
        '<rect width="1000" height="660" fill="#f3f0ea"/>\n'
        '<g fill="#e5e1d8" stroke="#c9c1b5" stroke-width="1" '
        'stroke-linejoin="round" fill-rule="evenodd">\n'
        + "\n".join(paths)
        + '\n</g>\n<g fill="none" stroke="#cec7ba" stroke-width="0.65" '
        'opacity="0.40">\n'
        + "\n".join(grid)
        + '\n</g>\n</svg>\n'
    )
    (ROOT / "assets" / "europe.svg").write_text(svg, encoding="utf-8")
    metadata = {
        "projection": "spherical-mercator",
        "width": WIDTH,
        "height": HEIGHT,
        "west": WEST,
        "east": EAST,
        "south": SOUTH,
        "north": NORTH,
        "scale": SCALE,
        "northMercator": NORTH_M,
        "coordinateOrder": "longitude, latitude",
        "formula": {
            "x": "(longitude - west) * Math.PI / 180 * scale",
            "y": "(northMercator - Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360))) * scale",
        },
        "source": "Natural Earth 1:110m land",
        "sourceUrl": "https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/",
        "license": "public domain",
        "note": "Current coastlines as geographic orientation; no historical borders or tuning territories.",
    }
    (ROOT / "assets" / "map-projection.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Built {len(paths)} land shapes; {len(svg.encode('utf-8')):,} bytes.")


if __name__ == "__main__":
    main()
