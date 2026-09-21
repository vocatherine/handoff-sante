#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconstruit index.html a partir de escale.html (source de travail).
Usage: python3 build_index.py
"""
import re

with open("escale.html", encoding="utf-8") as f:
    src = f.read()

title_m = re.search(r"<title>(.*?)</title>", src, re.S)
title = title_m.group(1) if title_m else "Handoff Santé"
font_links = re.findall(r'<link[^>]+fonts\.googleapis[^>]*>', src)
style_m = re.search(r"<style>.*?</style>", src, re.S)
style_block = style_m.group(0) if style_m else ""

body_src = src
if title_m: body_src = body_src.replace(title_m.group(0), "")
for fl in font_links: body_src = body_src.replace(fl, "")
if style_m: body_src = body_src.replace(style_m.group(0), "")
body_src = body_src.strip()

html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Handoff Santé — avis entre soignants sur les services de soin, pour savoir où on met les pieds avant une mission.">
<title>{title}</title>
<!-- Vérification Google AdSense (21/09/2026) -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7148612339271747"
     crossorigin="anonymous"></script>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0E6B5C">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{chr(10).join(font_links)}
{style_block}
</head>
<body>
{body_src}
</body>
</html>
"""
with open("index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("OK", len(html), "chars")
