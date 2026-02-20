#!/usr/bin/env python3
# =========================================================
# generate_pwa_icons.py
# - Genera icons PNG para PWA (standard + maskable)
# =========================================================

import argparse
import os
import sys

def ensure_pillow():
    try:
        from PIL import Image  # noqa
        return True
    except Exception:
        return False

def die(msg: str, code: int = 1):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(code)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Ruta de imagen fuente (png/jpg/webp).")
    ap.add_argument("--out", default="assets/icons", help="Directorio de salida")
    args = ap.parse_args()

    if not os.path.exists(args.input):
        die(f"No existe input: {args.input}")

    if not ensure_pillow():
        die("Falta Pillow. Instalar con: pip install pillow")

    from PIL import Image
    os.makedirs(args.out, exist_ok=True)
    src = Image.open(args.input).convert("RGBA")

    def make_square(im: Image.Image, size: int, padding_ratio: float):
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        pad = int(size * padding_ratio)
        max_w = size - pad * 2
        max_h = size - pad * 2
        w, h = im.size
        scale = min(max_w / w, max_h / h)
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        resized = im.resize((nw, nh), Image.LANCZOS)
        x = (size - nw) // 2
        y = (size - nh) // 2
        canvas.alpha_composite(resized, (x, y))
        return canvas

    outputs = [
        ("icon-192.png", 192, 0.08),
        ("icon-512.png", 512, 0.08),
        ("icon-192-maskable.png", 192, 0.20),
        ("icon-512-maskable.png", 512, 0.20),
    ]

    for filename, size, pad in outputs:
        out_path = os.path.join(args.out, filename)
        img = make_square(src, size, pad)
        img.save(out_path, format="PNG", optimize=True)
        print(f"OK: {out_path}")

    print("DONE: PWA icons generados.")

if __name__ == "__main__":
    main()
