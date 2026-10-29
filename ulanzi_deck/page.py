"""Build page packages for the D200."""
from __future__ import annotations

import io
import json
import zipfile
from dataclasses import dataclass, field

KEY_SIZE = 196
COLUMNS = 5
ROWS = 3

DEFAULT_FONT = {
    "Align": "bottom",
    "Color": 0xFFFFFF,
    "FontName": "Source Han Sans SC",
    "ShowTitle": True,
    "Size": 10,
    "Weight": 80,
}


@dataclass
class Key:
    """One key of a page.

    ``icon`` is raw image bytes (PNG/SVG).  ``text`` is drawn by the device
    on top of the image using ``font``.
    """

    icon: bytes | None = None
    text: str = ""
    font: dict = field(default_factory=lambda: dict(DEFAULT_FONT))
    state: int = 0
    small_view_mode: int | None = None


def build_page(keys: dict[tuple[int, int], Key]) -> bytes:
    """Return a ZIP package ready for ``Deck.send_frame(0, PROTO_PAGE, zip)``.

    ``keys`` is keyed by ``(column, row)``.
    """
    buf = io.BytesIO()
    manifest: dict[str, dict] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Images/", b"")
        for (col, row), key in keys.items():
            if not (0 <= col < COLUMNS and 0 <= row < ROWS):
                raise ValueError(f"slot out of range: {(col, row)}")
            view: dict = {"Font": key.font, "Text": key.text}
            if key.icon is not None:
                ext = "svg" if key.icon.lstrip()[:4].lower() == b"<svg" else "png"
                name = f"Images/{col}_{row}.{ext}"
                z.writestr(name, key.icon)
                view["Icon"] = name
            entry: dict = {"State": key.state, "ViewParam": [view]}
            if key.small_view_mode is not None:
                entry["SmallViewMode"] = key.small_view_mode
            manifest[f"{col}_{row}"] = entry
        z.writestr("manifest.json", json.dumps(manifest, separators=(",", ":")))
    return buf.getvalue()


def render_icon(text: str, *, bg: tuple[int, int, int] = (20, 24, 34),
                fg: tuple[int, int, int] = (255, 255, 255),
                border: tuple[int, int, int] | None = None,
                font_path: str | None = None,
                font_size: int = 78) -> bytes:
    """Render a simple 196x196 PNG key with centred text. Requires Pillow."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (KEY_SIZE, KEY_SIZE), bg)
    draw = ImageDraw.Draw(img)
    if border:
        draw.rounded_rectangle([6, 6, KEY_SIZE - 7, KEY_SIZE - 7], radius=18, outline=border, width=3)
    if font_path is None:
        font_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    try:
        font = ImageFont.truetype(font_path, font_size)
    except OSError:
        font = ImageFont.load_default()
    box = draw.textbbox((0, 0), text, font=font)
    x = (KEY_SIZE - (box[2] - box[0])) / 2 - box[0]
    y = (KEY_SIZE - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), text, fill=fg, font=font)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()
