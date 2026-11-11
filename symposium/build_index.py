"""Собирает symposium/index.json из файлов symposium/NN-slug.md.

Запуск из корня репозитория:  python3 symposium/build_index.py
Проверяет, что JSON в блоках ```table разбирается и что все философы есть в assets/thinkers/thinkers.json.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "symposium"
people = json.loads((ROOT / "assets/thinkers/thinkers.json").read_text())["thinkers"]

issues, errors = [], []
for f in sorted(DIR.glob("[0-9][0-9]-*.md")):
    text = f.read_text()
    m = re.match(r"^---\s*\n([\s\S]*?)\n---\s*\n", text)
    if not m:
        errors.append(f"{f.name}: нет шапки"); continue
    meta = {}
    for line in m.group(1).splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    body = text[m.end():]
    t = re.search(r"```table\n([\s\S]*?)```", body)
    seats = []
    if t:
        try:
            seats = [s["id"] for s in json.loads(t.group(1))["seats"]]
        except Exception as e:
            errors.append(f"{f.name}: table не JSON: {e}")
    else:
        errors.append(f"{f.name}: нет блока table")
    for blk in re.findall(r"```dialogue\n([\s\S]*?)```", body):
        for line in blk.strip().splitlines():
            who = line.split(":", 1)[0].strip()
            if who not in seats:
                errors.append(f"{f.name}: в диалоге '{who}', которого нет за столом")
    for pid in seats:
        if pid not in people:
            errors.append(f"{f.name}: нет философа '{pid}' в thinkers.json")
    words = len(re.findall(r"[А-Яа-яЁёA-Za-z][\wЁё-]*", re.sub(r'"(id|x|stance|work|axis|seats)"', " ", body)))
    issues.append({
        "n": int(meta["n"]),
        "slug": f.stem,
        "title": meta["title"],
        "ask": meta.get("ask", ""),
        "short": meta.get("short", ""),
        "reading": max(1, round(words / 200)),
        "words": words,
        "thinkers": seats,
    })

issues.sort(key=lambda i: i["n"])
(DIR / "index.json").write_text(json.dumps({"issues": issues}, ensure_ascii=False, indent=2) + "\n")
for i in issues:
    print(f'{i["n"]:>2}  {i["words"]:>5} слов  {len(i["thinkers"])} за столом  {i["title"]}')
if errors:
    print("\nОШИБКИ:\n" + "\n".join(errors)); sys.exit(1)
