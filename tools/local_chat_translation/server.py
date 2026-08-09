"""Local translation-to-image bridge for the QOLLOCK Panorama prototype."""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


MAX_TEXT_BYTES = 500
MAX_CACHE_ITEMS = 256
RENDER_SCALE = 2
MYMEMORY_URL = "https://api.mymemory.translated.net/get"
FONT_CANDIDATES = (
    Path("C:/Program Files (x86)/Steam/steamapps/common/Deadlock/game/citadel/panorama/fonts/valveoracle-semibold.ttf"),
    Path("C:/Windows/Fonts/segoeui.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
)


class TranslationService:
    def __init__(self) -> None:
        self._cache: OrderedDict[str, bytes] = OrderedDict()
        self._lock = threading.Lock()
        self._translation_cache: OrderedDict[str, str] = OrderedDict()
        # Top and bottom chat panels can request the same new message at nearly
        # the same time. Serialize translation cache misses so that race still
        # consumes only one external API call.
        self._translation_lock = threading.Lock()
        self._font = self._load_font(15 * RENDER_SCALE)
        self._indicator_font = self._load_font(11 * RENDER_SCALE)

    @staticmethod
    def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        for path in FONT_CANDIDATES:
            if path.exists():
                return ImageFont.truetype(str(path), size=size)
        return ImageFont.load_default()

    def translate(self, text: str, source: str, target: str) -> str:
        query = urllib.parse.urlencode({"q": text, "langpair": f"{source}|{target}"})
        request = urllib.request.Request(
            f"{MYMEMORY_URL}?{query}",
            headers={"User-Agent": "QOLLOCK-local-chat-translation/0.1"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            payload = json.load(response)
        translated = payload.get("responseData", {}).get("translatedText", "")
        translated = html.unescape(str(translated)).strip()
        if not translated:
            raise RuntimeError("translation API returned no translatedText")
        return translated

    def translated_text_for(self, text: str, source: str, target: str) -> str:
        cache_key = hashlib.sha256(f"{source}\0{target}\0{text}".encode("utf-8")).hexdigest()
        with self._translation_lock:
            cached = self._translation_cache.get(cache_key)
            if cached is not None:
                self._translation_cache.move_to_end(cache_key)
                return cached

            translated = self.translate(text, source, target)
            self._translation_cache[cache_key] = translated
            self._translation_cache.move_to_end(cache_key)
            while len(self._translation_cache) > MAX_CACHE_ITEMS:
                self._translation_cache.popitem(last=False)
            return translated

    def image_for(self, text: str, source: str, target: str, layout: str) -> bytes:
        cache_key = hashlib.sha256(f"{source}\0{target}\0{layout}\0{text}".encode("utf-8")).hexdigest()
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.move_to_end(cache_key)
                return cached

        translated = self.translated_text_for(text, source, target)
        image_bytes = self._render(translated, layout)
        with self._lock:
            self._cache[cache_key] = image_bytes
            self._cache.move_to_end(cache_key)
            while len(self._cache) > MAX_CACHE_ITEMS:
                self._cache.popitem(last=False)
        return image_bytes

    def _render(self, translated: str, layout: str) -> bytes:
        # Panorama places this inside an existing chat bubble. Keep the image
        # transparent and compact so it reads like a second line, not a card
        # nested inside another card.
        # Render at 3x and let Panorama's max-width scale it back to the native
        # chat dimensions. This supersampling avoids the visibly pixelated
        # edges produced by a bitmap rendered directly at 15px.
        logical_width = 390 if layout == "bottom" else 215
        max_width = logical_width * RENDER_SCALE
        padding_x = RENDER_SCALE
        padding_y = RENDER_SCALE
        indicator = "RU"
        indicator_gap = 5 * RENDER_SCALE
        indicator_width = self._text_width(indicator, self._indicator_font)
        text_width_limit = max_width - (padding_x * 2) - indicator_gap - indicator_width
        lines = self._wrap(translated, text_width_limit, self._font)
        line_height = 16 * RENDER_SCALE
        line_widths = [self._text_width(line, self._font) for line in lines]
        last_combined_width = line_widths[-1] + indicator_gap + indicator_width
        content_width = max(line_widths[:-1] + [last_combined_width])
        width = min(max_width, max(80 * RENDER_SCALE, content_width + padding_x * 2))
        height = padding_y * 2 + line_height * len(lines)
        image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        y = padding_y
        for index, line in enumerate(lines):
            draw.text(
                (padding_x, y),
                line,
                font=self._font,
                fill=(0, 0, 0, 255),
            )
            if index == len(lines) - 1:
                line_width = self._text_width(line, self._font)
                draw.text(
                    (padding_x + line_width + indicator_gap, y + (3 * RENDER_SCALE)),
                    indicator,
                    font=self._indicator_font,
                    fill=(90, 78, 72, 220),
                )
            y += line_height
        output = io.BytesIO()
        image.save(output, format="WEBP", lossless=True, method=4)
        return output.getvalue()

    @staticmethod
    def _text_width(text: str, font: ImageFont.ImageFont) -> int:
        left, _, right, _ = font.getbbox(text)
        return right - left

    def _wrap(self, text: str, max_width: int, font: ImageFont.ImageFont) -> list[str]:
        words = text.replace("\r", "").replace("\n", " ").split()
        if not words:
            return ["(empty translation)"]
        lines: list[str] = []
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if self._text_width(candidate, font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
        return lines[:8]


SERVICE = TranslationService()


class Handler(BaseHTTPRequestHandler):
    server_version = "QOLLOCKTranslation/0.1"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(200, {"ok": True, "backend": "mymemory", "bind": "localhost"})
            return
        if parsed.path != "/translate.webp":
            self._send_json(404, {"error": "not found"})
            return

        params = urllib.parse.parse_qs(parsed.query)
        text = params.get("text", [""])[0].strip()
        source = params.get("source", ["ru"])[0].lower()
        target = params.get("target", ["en"])[0].lower()
        layout = params.get("layout", ["top"])[0].lower()
        if not text:
            self._send_json(400, {"error": "text is required"})
            return
        if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
            self._send_json(413, {"error": f"text exceeds {MAX_TEXT_BYTES} UTF-8 bytes"})
            return
        if (source, target) not in (("ru", "en"), ("en", "ru")):
            self._send_json(400, {"error": "only ru|en and en|ru are enabled"})
            return
        if layout not in ("top", "bottom"):
            self._send_json(400, {"error": "layout must be top or bottom"})
            return
        try:
            image_bytes = SERVICE.image_for(text, source, target, layout)
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError) as exc:
            self._send_json(502, {"error": str(exc)})
            return

        self.send_response(200)
        self.send_header("Content-Type", "image/webp")
        self.send_header("Content-Length", str(len(image_bytes)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(image_bytes)

    def log_message(self, format: str, *args: object) -> None:
        print(f"[translation] {self.address_string()} {format % args}")

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"QOLLOCK local translation server: http://{args.host}:{args.port}")
    print("Health check: /health | Translation image: /translate.webp?text=...&source=ru&target=en")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
