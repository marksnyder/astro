#!/usr/bin/env python3
"""Render docs/docs/*.md to _site/docs/**/index.html (for environments without Jekyll).

Run: python3 docs/build_docs_site.py  (from repo root)
Requires: pip install markdown pyyaml
"""
from __future__ import annotations

import re
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "_site"
DOCS_SRC = ROOT / "docs"
NAV_PATH = ROOT / "_data" / "docs_nav.yml"


def static_nav_for_docs() -> str:
    nav = (ROOT / "_includes" / "nav.html").read_text(encoding="utf-8")
    nav = nav.replace("{{ '/' | relative_url }}", "/")
    nav = nav.replace("{{ '/assets/img/logo.png' | relative_url }}", "/assets/img/logo.png")
    nav = nav.replace("{{ '/docs/' | relative_url }}", "/docs/")
    nav = nav.replace("{{ '/install/' | relative_url }}", "/install/")
    nav = nav.replace('class="{% if page.url == \'/\' %}active{% endif %}"', 'class=""')
    nav = nav.replace(
        'class="{% if page.url contains \'/docs\' %}active{% endif %}"', 'class="active"'
    )
    nav = nav.replace(
        'class="{% if page.url == \'/install/\' %}active{% endif %}"', 'class=""'
    )
    return nav


def static_footer() -> str:
    foot = (ROOT / "_includes" / "footer.html").read_text(encoding="utf-8")
    foot = foot.replace("{{ '/docs/' | relative_url }}", "/docs/")
    foot = foot.replace("{{ '/install/' | relative_url }}", "/install/")
    return foot


HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Run Astro</title>
<meta name="description" content="{desc}">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
"""


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---\n", 3)
    if end == -1:
        return {}, text
    fm_raw = text[3:end]
    body = text[end + 5 :]
    meta: dict[str, str] = {}
    for line in fm_raw.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    return meta, body


def sidebar(nav_pages: list[dict], active_id: str) -> str:
    parts = [
        '<nav class="docs-toc">\n  <div class="docs-toc-label">Documentation</div>\n'
    ]
    for item in nav_pages:
        nid = item["id"]
        title = item["title"]
        path = item["path"]
        cls = "docs-toc-link active" if nid == active_id else "docs-toc-link"
        parts.append(f'    <a href="{path}" class="{cls}">{title}</a>\n')
    parts.append("</nav>\n")
    return "".join(parts)


def main() -> None:
    nav_pages = yaml.safe_load(NAV_PATH.read_text(encoding="utf-8"))["pages"]
    md = markdown.Markdown(extensions=["tables", "fenced_code", "nl2br"])
    nav_html = static_nav_for_docs()
    foot_html = static_footer()

    for path in sorted(DOCS_SRC.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        meta, body = parse_front_matter(raw)
        title = meta.get("title", path.stem)
        subtitle = meta.get("subtitle", "")
        nav_id = meta.get("nav_id", "")
        html_body = md.convert(body)
        md.reset()

        desc = "Astro documentation: " + title
        page = HEAD.format(
            title=title.replace('"', "&quot;"),
            desc=desc.replace('"', "&quot;"),
        )
        page += nav_html
        page += '<div class="docs-layout">\n'
        page += '<aside class="docs-sidebar" aria-label="Documentation table of contents">\n'
        page += sidebar(nav_pages, nav_id)
        page += "</aside>\n"
        page += '<div class="docs-main">\n'
        page += '<div class="page-header"><div class="page-header-inner">\n'
        page += f"<h1>{title}</h1>\n"
        if subtitle:
            page += f'<p class="page-subtitle">{subtitle}</p>\n'
        page += "</div></div>\n"
        page += '<div class="page-content docs-page-content"><div class="page-inner">\n'
        page += html_body
        page += "\n</div></div></div></div>\n"
        page += foot_html + "\n</body></html>\n"

        permalink = meta.get("permalink", "").strip()
        if path.name == "index.md" or permalink.rstrip("/") in ("/docs", "/docs/"):
            out_path = SITE / "docs" / "index.html"
        else:
            slug = permalink.strip("/").split("/")[-1]
            out_path = SITE / "docs" / slug / "index.html"

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(page, encoding="utf-8")
        print("Wrote", out_path)

    patch_static_site_root()


def patch_static_site_root() -> None:
    """Align pre-built marketing pages in _site/ with Docs (sources may be Jekyll-only)."""
    for rel in ("index.html", "install/index.html"):
        path = SITE / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        text = text.replace('href="/features/"', 'href="/docs/"')
        text = text.replace(">Explore Features</a>", ">Explore Docs</a>")
        text = text.replace(">See All Features</a>", ">Browse Docs</a>")
        text = text.replace(
            '<a href="/docs/" class="">Features</a>',
            '<a href="/docs/" class="">Docs</a>',
        )
        text = text.replace(
            '<a href="/docs/">Features</a>',
            '<a href="/docs/">Docs</a>',
        )
        path.write_text(text, encoding="utf-8")
        print("Patched", path)


if __name__ == "__main__":
    main()
