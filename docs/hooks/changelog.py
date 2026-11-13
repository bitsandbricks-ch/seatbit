"""Renders the changelog entries (changelog/*.yml) into the docs' changelog pages.

A page with the marker <!-- changelog:en --> or <!-- changelog:de --> gets the entries in
that language, newest day first. The app reads the same files (src/lib/changelog.ts);
`npm run check:changelog` validates them.
"""

import datetime
import os
from collections import OrderedDict

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR = os.path.join(ROOT, "changelog")

TYPES = {
    "en": {"new": "New", "improved": "Improved", "fixed": "Fixed"},
    "de": {"new": "Neu", "improved": "Verbessert", "fixed": "Behoben"},
}
ORDER = {"new": 0, "improved": 1, "fixed": 2}
ADMINS = {"en": "platform admins", "de": "Plattform-Admins"}
WEEKDAYS = {
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "de": ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
}


def _entries():
    out = []
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(".yml"):
            continue
        with open(os.path.join(DIR, name), encoding="utf-8") as f:
            data = yaml.safe_load(f)
        date = data["date"]
        if not isinstance(date, datetime.date):
            date = datetime.date.fromisoformat(str(date))
        prs = data.get("pr", [])
        out.append(
            {
                "id": name[:-4],
                "date": date,
                "type": data["type"],
                "admins": data.get("audience") == "admins",
                "prs": prs if isinstance(prs, list) else [prs],
                "en": data["en"],
                "de": data["de"],
            }
        )
    out.sort(key=lambda e: (-e["date"].toordinal(), ORDER.get(e["type"], 9), e["id"]))
    return out


def _render(lang, repo_url):
    days = OrderedDict()
    for e in _entries():
        days.setdefault(e["date"], []).append(e)
    lines = []
    for date, entries in days.items():
        lines.append(f"## {WEEKDAYS[lang][date.weekday()]} {date:%d.%m.%Y} {{ #{date.isoformat()} }}\n")
        for e in entries:
            text = e[lang]
            meta = [f"**{TYPES[lang][e['type']]}**"]
            if e["admins"]:
                meta.append(f"*{ADMINS[lang]}*")
            prs = " ".join(f"[#{n}]({repo_url}/pull/{n})" for n in e["prs"])
            lines.append(f"- {' · '.join(meta)}: {text['title'].strip()}" + (f" ({prs})" if prs else ""))
            body = (text.get("text") or "").strip()
            if body:
                lines.append("")
                lines.extend(f"    {line}" if line else "" for line in body.splitlines())
            lines.append("")
    return "\n".join(lines)


def on_page_markdown(markdown, page, config, files):
    repo = (config.get("repo_url") or "").rstrip("/")
    for lang in ("en", "de"):
        marker = f"<!-- changelog:{lang} -->"
        if marker in markdown:
            markdown = markdown.replace(marker, _render(lang, repo))
    return markdown
