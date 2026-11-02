#!/usr/bin/env python3
"""Draws the README's SVGs: GitHub strips scripts and CSS from a README, but an SVG in <img> keeps its animations.

Text becomes outlines, so the look doesn't depend on the viewer's fonts. Needs fontTools; run with the folder
holding the LiberationSans-Regular, LiberationSans-Bold and JetBrainsMono-Regular TTFs:
    python3 assets/make.py <fonts dir>
Colors are the app's own, from src/renderer/src/styles/global.css.
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
FONTS = Path(sys.argv[1])
PAGE, PANEL, HOVER, SELECTED = "#000000", "#0a0a0a", "#151515", "#1a1a1a"
EDGE, LINE = "#222222", "#333333"
INK, SOFT, MUTED, OFF = "#ededed", "#a1a1a1", "#888888", "#555555"
OK = "#22c55e"
SANS, BOLD, MONO = "LiberationSans-Regular", "LiberationSans-Bold", "JetBrainsMono-Regular"
_fonts = {}


def font(name):
    if name not in _fonts:
        f = TTFont(FONTS / f"{name}.ttf")
        _fonts[name] = (f.getGlyphSet(), f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm)
    return _fonts[name]


def width(s, size, name, ls=0.0):
    _, cmap, hmtx, em = font(name)
    return sum(hmtx[cmap.get(ord(c), ".notdef")][0] * size / em + ls for c in s) - ls


def text(s, x, y, size, name=SANS, fill=SOFT, anchor="start", ls=0.0):
    gs, cmap, hmtx, em = font(name)
    if anchor != "start":
        x -= width(s, size, name, ls) * (0.5 if anchor == "middle" else 1)
    k, d = size / em, ""
    for c in s:
        g = cmap.get(ord(c), ".notdef")
        pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, y)))
        d += pen.getCommands()
        x += hmtx[g][0] * k + ls
    return f'<path d="{d}" fill="{fill}"/>'


def icon(x, y, s):
    """resources/icon.svg"""
    return (f'<g transform="translate({x} {y}) scale({s / 512})"><rect x="16" y="16" width="480" height="480" rx="108" '
            f'fill="{PANEL}" stroke="{LINE}" stroke-width="6"/><g transform="translate(8 8)" fill="none" stroke="{INK}" '
            'stroke-width="36" stroke-linecap="round" stroke-linejoin="round"><circle cx="184" cy="312" r="72"/>'
            '<path d="M235 261 384 112M336 160 384 208M296 200 328 232"/></g></g>')


def svg(w, h, alt, style, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" '
            f'aria-label="{alt}"><title>{alt}</title><style>{style}'
            '@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>'
            f'{body}</svg>\n')


def save(name, content):
    (HERE / name).write_text(content, encoding="utf-8")
    print(name, f"{len(content) // 1024} KiB")


ACCOUNTS = [("github", "work", "TOTP", "482 917", "HMAC-SHA1 · 6"),
            ("cloudflare", "admin", "TOTP", "305 661", "HMAC-SHA256 · 6"),
            ("yandex", "personal", "Yandex OTP", "mtrkqpwz", "HMAC-SHA256 · 8")]
TEXT = {
    "en": {"alt": "yakey: Yandex Key codes on your Linux or Windows desktop", "lead": "Yandex Key codes on your desktop",
           "sub": "Linux and Windows. Free. Encrypted vault, no telemetry.", "search": "Search", "params": "Parameters",
           "copy": "Copy", "copied": "Copied", "next": "next code", "unit": "s", "locked": "Vault unlocked"},
    "ru": {"alt": "yakey: коды Яндекс Ключа на компьютере с Linux или Windows", "lead": "Коды Яндекс Ключа на компьютере",
           "sub": "Linux и Windows. Бесплатно. Шифрованное хранилище, без телеметрии.", "search": "Поиск", "params": "Параметры",
           "copy": "Копировать", "copied": "Скопировано", "next": "новый код", "unit": "с", "locked": "Хранилище открыто"},
}


def hero(lang):
    t = TEXT[lang]
    W, H, CYCLE, N = 860, 420, 15, len(ACCOUNTS)
    wx, wy, ww, wh = 24, 104, W - 48, H - 128
    side = 232
    px, pw = wx + side + 24, ww - side - 48
    # Each account is on screen for a third of the loop, its progress bar running out meanwhile.
    pill = "".join(f"{i * 100 / N:.2f}%,{(i + 1) * 100 / N - 1:.2f}%{{transform:translateY({i * 52}px)}}" for i in range(N))
    show = f"@keyframes sl{{0%{{opacity:0}}1.5%,{100 / N - 1.5:.2f}%{{opacity:1}}{100 / N:.2f}%,100%{{opacity:0}}}}"
    copied = (f"@keyframes cp{{0%,{100 / N * .55:.2f}%{{opacity:0}}{100 / N * .6:.2f}%,{100 / N * .85:.2f}%{{opacity:1}}"
              f"{100 / N * .9:.2f}%,100%{{opacity:0}}}}")
    style = (f".pill{{animation:pill {CYCLE}s ease-in-out infinite}}@keyframes pill{{{pill}100%{{transform:none}}}}{show}{copied}"
             + "".join(f".s{i}{{opacity:0;animation:sl {CYCLE}s infinite;animation-delay:{i * CYCLE / N}s}}"
                       f".c{i}{{opacity:0;animation:cp {CYCLE}s infinite;animation-delay:{i * CYCLE / N}s}}" for i in range(N))
             + f".bar{{transform-origin:{px}px 0;animation:bar {CYCLE / N}s linear infinite}}@keyframes bar{{from{{transform:scaleX(1)}}to{{transform:scaleX(0)}}}}"
             ".dot{animation:dot 2s ease-in-out infinite}@keyframes dot{50%{opacity:.25}}")
    rows, slides = "", ""
    for i, (name, who, kind, code, algo) in enumerate(ACCOUNTS):
        y = wy + 92 + i * 52
        rows += text(name, wx + 28, y, 13, BOLD, INK) + text(who, wx + 28, y + 16, 11, MONO, MUTED)
        slides += f'''<g class="s{i}">{text(name, px + 16, wy + 75, 14, BOLD, INK)}{text(f"· {who}", px + 16 + width(name, 14, BOLD) + 7, wy + 75, 13, SANS, MUTED)}
{text(kind, px + pw - 16, wy + 75, 12, MONO, MUTED, "end", 1)}{text(code, px + 16, wy + 142, 44, MONO, INK, ls=4)}
{text(algo, px + 16, wy + 232, 12, MONO, MUTED)}</g>'''
    cw = width(t["copy"], 13, SANS) + 28
    cx = px + pw - 16 - cw
    tw = width(t["copied"], 12, MONO)
    copied_marks = "".join(f'<g class="c{i}"><rect x="{cx - tw - 34}" y="{wy + 214}" width="{tw + 24}" height="26" rx="6" fill="{HOVER}"/>'
                           f'<circle cx="{cx - tw - 24}" cy="{wy + 227}" r="3" fill="{OK}"/>{text(t["copied"], cx - tw - 16, wy + 231, 12, MONO, INK)}</g>' for i in range(N))
    body = f'''<rect width="{W}" height="{H}" rx="14" fill="{PAGE}"/><rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="14" fill="none" stroke="{EDGE}"/>
{icon(24, 22, 60)}{text("yakey", 100, 50, 30, BOLD, INK, ls=-.5)}{text(t["lead"], 100, 74, 14, SANS, SOFT)}
{text(t["sub"], W - 28, 74, 12, MONO, MUTED, "end")}
<clipPath id="w"><rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" rx="10"/></clipPath>
<g clip-path="url(#w)"><rect x="{wx}" y="{wy}" width="{ww}" height="{wh}" fill="{PAGE}"/>
<rect x="{wx}" y="{wy}" width="{side}" height="{wh}" fill="{PANEL}"/>
<rect class="pill" x="{wx + 12}" y="{wy + 74}" width="{side - 24}" height="46" rx="6" fill="{SELECTED}"/></g>
<rect x="{wx + .5}" y="{wy + .5}" width="{ww - 1}" height="{wh - 1}" rx="10" fill="none" stroke="{LINE}"/>
<path d="M{wx} {wy + 36.5}H{wx + ww}M{wx + side + .5} {wy + 36}V{wy + wh}" stroke="{EDGE}"/>
{text("yakey", wx + 16, wy + 23, 12, MONO, SOFT)}<path d="M{wx + ww - 44} {wy + 18.5}h10M{wx + ww - 20} {wy + 14}l9 9m0-9l-9 9" stroke="{MUTED}" stroke-width="1.3" fill="none"/>
<rect x="{wx + 12}" y="{wy + 44}" width="{side - 24}" height="24" rx="6" fill="{PAGE}" stroke="{LINE}"/>{text(t["search"], wx + 22, wy + 60, 12, SANS, OFF)}
{rows}<circle class="dot" cx="{wx + 22}" cy="{wy + wh - 18}" r="3" fill="{OK}"/>{text(t["locked"], wx + 32, wy + wh - 14, 11, MONO, MUTED)}
<rect x="{px + .5}" y="{wy + 52.5}" width="{pw - 1}" height="{wh - 68}" rx="8" fill="{PANEL}" stroke="{EDGE}"/><path d="M{px} {wy + 90.5}H{px + pw}M{px} {wy + 205.5}H{px + pw}" stroke="{EDGE}"/>
{slides}{text(t["next"], px + 16, wy + 174, 11, MONO, MUTED)}{text("30 " + t["unit"], px + pw - 16, wy + 174, 11, MONO, MUTED, "end")}
<rect x="{px + 16}" y="{wy + 183}" width="{pw - 32}" height="3" rx="1.5" fill="{EDGE}"/><rect class="bar" x="{px + 16}" y="{wy + 183}" width="{pw - 32}" height="3" rx="1.5" fill="{INK}"/>
<rect x="{cx}" y="{wy + 214}" width="{cw}" height="26" rx="6" fill="{INK}"/>{text(t["copy"], cx + cw / 2, wy + 231, 13, SANS, PAGE, "middle")}{copied_marks}'''
    save(f"hero-{lang}.svg", svg(W, H, t["alt"], style, body))


def button(file, title, sub, alt):
    W, H = 196, 62
    style = ".ar{animation:ar 1.8s ease-in-out infinite}@keyframes ar{50%{transform:translateY(3px)}}"
    body = f'''<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="8" fill="{PANEL}" stroke="{LINE}"/>
{text(title, 16, 27, 15, BOLD, INK)}{text(sub, 16, 46, 11, MONO, MUTED)}
<g class="ar"><path d="M{W - 28} 22v15m-6-6l6 6 6-6" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>'''
    save(file, svg(W, H, alt, style, body))


hero("en")
hero("ru")
button("dl-arch.svg", "Arch Linux", ".pkg.tar.zst", "Arch Linux: .pkg.tar.zst")
button("dl-debian.svg", "Debian / Ubuntu", ".deb", "Debian and Ubuntu: .deb")
button("dl-fedora.svg", "Fedora", ".rpm", "Fedora: .rpm")
button("dl-windows.svg", "Windows", "setup.exe", "Windows: setup.exe")
