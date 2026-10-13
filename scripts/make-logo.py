"""Generate the vaporlog brand mark — a flat, geometric cannabis leaf.

Single-color vector mark (no gradients, no face): a seven-leaflet palmate
leaf with serrated edges and vein cutouts. Rendered variants:

  public/brand/logo-512.png        — herb-green tile, white leaf (512)
  public/brand/favicon-192.png     — tile (192)
  public/brand/favicon-32x32.png   — tile (32)
  public/brand/favicon-16x16.png   — simplified 5-leaflet tile (16)
  public/brand/favicon.ico         — multi-size ICO (16/32/48)
  public/brand/apple-touch-icon.png— full-bleed square (180)
  public/brand/logo-mark.png       — transparent mark, herb green (512)
  public/brand/logo-mark-bright.png— transparent mark, #74C69D (512, dark bg)
  src/assets/logo.png              — header mark (transparent, 256)

Requires rsvg-convert on PATH. Run:  python scripts/make-logo.py
"""

import math
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "public" / "brand"

HERB = "#2D6A4F"  # site accent (light theme)
HERB_BRIGHT = "#74C69D"  # accent on dark surfaces
PAPER = "#F5F8F6"

NODE = (256.0, 392.0)
STEM = ((256.0, 400.0), (256.0, 472.0), 16.0)  # (from, to, width)

# (angle from vertical, length, half-width)
FULL_LEAFLETS = [
    (0, 292, 36),
    (27, 270, 33),
    (-27, 270, 33),
    (55, 212, 28),
    (-55, 212, 28),
    (82, 146, 23),
    (-82, 146, 23),
]
SIMPLE_LEAFLETS = [
    (0, 292, 44),
    (32, 262, 40),
    (-32, 262, 40),
    (72, 190, 32),
    (-72, 190, 32),
]


def envelope(t: float, width: float) -> float:
    """Half-width of a leaflet at t in [0,1]: pointed at both ends, max ~42%."""
    if t < 0.42:
        return width * (t / 0.42) ** 0.75
    return width * ((1.0 - t) / 0.58) ** 1.05


def leaflet_path(angle_deg: float, length: float, width: float, teeth: int) -> str:
    """One serrated leaflet as a closed path, base at NODE."""
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)  # direction (0 = straight up)
    px, py = math.cos(a), math.sin(a)  # perpendicular
    left, right = [], []
    n = teeth * 2
    for i in range(n + 1):
        t = i / n
        w = envelope(t, width)
        if 0 < i < n and i % 2 == 1:
            w *= 0.78  # tooth notch
        cx, cy = NODE[0] + dx * length * t, NODE[1] + dy * length * t
        left.append((cx + px * w, cy + py * w))
        right.append((cx - px * w, cy - py * w))
    pts = left + right[::-1]
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def vein_line(angle_deg: float, length: float) -> str:
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)
    x1, y1 = NODE[0] + dx * 14, NODE[1] + dy * 14
    x2, y2 = NODE[0] + dx * length * 0.72, NODE[1] + dy * length * 0.72
    return (
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
        f'stroke="black" stroke-width="6" stroke-linecap="round"/>'
    )


def build_svg(
    fill: str,
    tile: bool,
    simple: bool,
    pad: float = 1.0,
    size: int = 512,
) -> str:
    leaflets = SIMPLE_LEAFLETS if simple else FULL_LEAFLETS
    paths = "\n".join(
        f'<path d="{leaflet_path(a, l, w, 9)}"/>' for a, l, w in leaflets
    )
    (sx1, sy1), (sx2, sy2), sw = STEM
    stem = (
        f'<line x1="{sx1}" y1="{sy1}" x2="{sx2}" y2="{sy2}" '
        f'stroke-width="{sw}" stroke-linecap="round"/>'
    )
    mask = ""
    mask_attr = ""
    if not simple:
        veins = "\n".join(vein_line(a, l) for a, l, _ in leaflets)
        mask = (
            f'<mask id="veins"><g fill="white" stroke="white">'
            f"{paths}\n{stem}</g>\n{veins}</mask>"
        )
        mask_attr = ' mask="url(#veins)"'
    rect = ""
    if tile:
        rx = 0 if pad < 1.0 else 116
        rect = f'<rect width="{size}" height="{size}" rx="{rx}" fill="{HERB}"/>'
    inner_fill = PAPER if tile else fill
    group = (
        f'<g fill="{inner_fill}" stroke="{inner_fill}"{mask_attr}>'
        f"{paths}\n{stem}</g>"
    )
    if pad < 1.0:
        c = size / 2
        group = (
            f'<g transform="translate({c} {c}) scale({pad}) '
            f'translate({-c} {-c})">{group}</g>'
        )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" '
        f'height="{size}" viewBox="0 0 {size} {size}">\n'
        f"{rect}\n{mask}\n{group}\n</svg>\n"
    )


def render(svg: str, out: Path, px: int) -> None:
    with tempfile.NamedTemporaryFile(
        "w", suffix=".svg", delete=False, encoding="utf-8"
    ) as f:
        f.write(svg)
        tmp = f.name
    subprocess.run(
        ["rsvg-convert", "-w", str(px), "-h", str(px), tmp, "-o", str(out)],
        check=True,
    )
    Path(tmp).unlink()


def main() -> None:
    # Tiles (rounded-square badge, white leaf on herb green)
    render(build_svg(PAPER, tile=True, simple=False), BRAND / "logo-512.png", 512)
    render(build_svg(PAPER, tile=True, simple=False), BRAND / "favicon-192.png", 192)
    render(build_svg(PAPER, tile=True, simple=False), BRAND / "favicon-32x32.png", 32)
    render(build_svg(PAPER, tile=True, simple=True), BRAND / "favicon-16x16.png", 16)
    render(
        build_svg(PAPER, tile=True, simple=False, pad=0.78),
        BRAND / "apple-touch-icon.png",
        180,
    )

    # Multi-size favicon.ico (48 rendered from the full-detail tile)
    render(build_svg(PAPER, tile=True, simple=True), BRAND / "._favicon-48.png", 48)
    icons = [
        Image.open(BRAND / f"._favicon-48.png"),
        Image.open(BRAND / "favicon-32x32.png"),
        Image.open(BRAND / "favicon-16x16.png"),
    ]
    icons[0].save(
        BRAND / "favicon.ico",
        format="ICO",
        sizes=[(48, 48), (32, 32), (16, 16)],
        append_images=icons[1:],
    )
    (BRAND / "._favicon-48.png").unlink()

    # Transparent marks
    render(build_svg(HERB, tile=False, simple=False), BRAND / "logo-mark.png", 512)
    render(
        build_svg(HERB_BRIGHT, tile=False, simple=False),
        BRAND / "logo-mark-bright.png",
        512,
    )
    render(build_svg(HERB, tile=False, simple=False), ROOT / "src" / "assets" / "logo.png", 256)

    for f in sorted(BRAND.iterdir()):
        print(f"{f.name:28s} {f.stat().st_size:8d} B")
    print("src/assets/logo.png written")


if __name__ == "__main__":
    main()
