# -*- coding: utf-8 -*-
"""codigo CIE-10 -> titulo espanol desde paho_vol1.txt (CIE-10 Vol.1 OPS).
- Maestros (3 char): desde 'Lista de categorias de tres caracteres' (indice),
  uniendo lineas de continuacion (indentadas) -> titulos completos.
- Subcodigos (4 char): desde 'Lista tabular', linea unica + union por guion.
Reporta cobertura vs codigos del TSV/dataset."""
import re, csv, collections, json

import os, pathlib
# Input and output locations. Both used to be one hardcoded absolute path into the
# author's cloud-sync folder, which meant this script could not be run by anyone,
# anywhere. IN_DIR is this directory; OUT_DIR defaults to the repository's datos/
# and honours ECICEP_OUT.
_AQUI = pathlib.Path(__file__).resolve()
IN_DIR = _AQUI.parent
OUT_DIR = pathlib.Path(os.environ.get("ECICEP_OUT", _AQUI.parents[2] / "datos"))
OUT_DIR.mkdir(parents=True, exist_ok=True)
lines = open(IN_DIR / "paho_vol1.txt", encoding="utf-8").read().split("\n")

# inicio de la 'Lista tabular' (fin del indice de 3 caracteres)
TAB = next(i for i, l in enumerate(lines) if i > 4000 and "Lista tabular de inclusiones" in l)

rx = re.compile(r'^(\s*)([A-Z]\d{2}(?:\.\d)?)[*†‡+]?\s{2,}(\S.*)$')
STOP = ("Excluye", "Incluye", "Usar", "Use", "Véase", "Vease", "Nota", "Codifique")

def limpia(t):
    t = re.sub(r'\s*\([A-Z]\d{2}.*\)\s*$', '', t)        # quita cruce final "(I66.0†)"
    return re.sub(r'\s+', ' ', t).strip()

# ---- maestros desde el indice (3 caracteres, union por indentacion) ----
maestros = {}
i = 0
while i < TAB:
    m = rx.match(lines[i])
    if m and len(m.group(2)) == 3:
        code, title = m.group(2), m.group(3).strip()
        j = i + 1
        while j < TAB and lines[j].strip() and lines[j][:1] == " " and not rx.match(lines[j]):
            if lines[j].strip().startswith(STOP):
                break
            title += " " + lines[j].strip()
            j += 1
        maestros[code] = limpia(title)
        i = j
    else:
        i += 1

# palabras-funcion: si el titulo termina en una de estas, la linea siguiente
# es continuacion del titulo (wrap por limite de palabra), no descripcion.
INCOMPLETO = {"de","del","la","el","los","las","un","una","unos","unas","y","e","o","u",
    "a","al","con","en","por","para","sin","sobre","ante","tras","su","sus","se","que",
    "no","ni","lo","le","les","nos","según","segun","otras","otros","más","mas","como",
    "sus","esta","este","estos","estas","muy","ya"}
NOJOIN = ("•","[","(","–","-","*","⎫","⎬","⎭","†")

def cont_ok(ln):
    s = ln.strip()
    return bool(s) and ln[:1] == " " and not rx.match(ln) \
        and not s.startswith(STOP) and not s.startswith(NOJOIN)

# ---- todos los codigos desde la tabular (union por guion y por palabra-funcion) ----
tab = collections.defaultdict(collections.Counter)
i = TAB
while i < len(lines):
    m = rx.match(lines[i])
    if m:
        code, title = m.group(2), m.group(3).strip()
        while i + 1 < len(lines):
            last = title.rstrip(" ,;:").split()[-1].lower() if title.split() else ""
            if title.endswith("-") and cont_ok(lines[i + 1]):
                title = title[:-1] + lines[i + 1].strip(); i += 1
            elif last in INCOMPLETO and cont_ok(lines[i + 1]):
                title = title + " " + lines[i + 1].strip(); i += 1
            else:
                break
        if not title.startswith(STOP):
            t = limpia(title)
            if len(t) >= 3:
                tab[code][t] += 1
    i += 1

# titulo tabular final = mas frecuente (desempate: mas largo)
titles = {}
for code, ctr in tab.items():
    titles[code] = sorted(ctr.items(), key=lambda kv: (kv[1], len(kv[0])), reverse=True)[0][0]
# maestros del indice mandan para 3 caracteres (mas completos)
for code, t in maestros.items():
    titles[code] = t

json.dump(titles, open(IN_DIR / "paho_titles.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
print("Titulos:", len(titles), "| maestros indice:", len(maestros))

# ---- cobertura ----
rows = list(csv.reader(open(OUT_DIR / "codigos_ecicep_estratificacion.tsv", encoding="utf-8"), delimiter="\t"))[1:]
codes = list(dict.fromkeys(r[6] for r in rows if r[8] != "Regla"))  # col Codigo CIE-10
miss = [c for c in codes if c not in titles]
print(f"Codigos unicos: {len(codes)} | con titulo: {len(codes)-len(miss)} | SIN: {len(miss)}")
if miss:
    print("FALTAN:", miss)
print("-- spot check maestros envueltos --")
for c in ["F10", "F11", "E10", "E11", "F70", "I20", "K71", "Z57", "G46", "F00"]:
    print(f"  {c}: {titles.get(c, '??')}")
