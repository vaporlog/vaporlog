"""Generate public/brand/og-default.jpg — the default Open Graph card.

1200x630, pure-black background (blends seamlessly with the mascot art),
wordmark on the left, mascot on the right. WhatsApp/X/iMessage pick this
up for every shared vaporlog link that has no session-specific image.

Run with the managed Python:  python scripts/make-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MASCOT = ROOT / "public" / "brand" / "vaporlog-mascot.png"
OUT = ROOT / "public" / "brand" / "og-default.jpg"

W, H = 1200, 630
HERB_BRIGHT = (116, 198, 157)  # #74C69D — readable herb on black
WHITE = (245, 245, 245)
MUTED = (148, 163, 154)

FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def main() -> None:
    card = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(card)

    # --- Mascot, right block (background is pure black → direct paste) ---
    mascot = Image.open(MASCOT).convert("RGB")
    size = 490
    mascot = mascot.resize((size, size), Image.LANCZOS)
    card.paste(mascot, (W - size - 50, (H - size) // 2))

    # --- Wordmark, left block ---
    word_font = load_font(118)
    x, y = 90, 210
    draw.text((x, y), "vapor", font=word_font, fill=WHITE)
    vapor_w = draw.textlength("vapor", font=word_font)
    draw.text((x + vapor_w, y), "log", font=word_font, fill=HERB_BRIGHT)

    # Herb accent line above the wordmark
    draw.rectangle([x, y - 46, x + 120, y - 34], fill=HERB_BRIGHT)

    # --- Tagline ---
    tag_font = load_font(40)
    draw.text(
        (x + 4, y + 150),
        "The journal of the art of vaporizing",
        font=tag_font,
        fill=MUTED,
    )

    # --- Domain, bottom-left ---
    dom_font = load_font(32)
    draw.text((x + 4, H - 90), "vaporlog.online", font=dom_font, fill=HERB_BRIGHT)

    card.save(OUT, "JPEG", quality=88, optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
