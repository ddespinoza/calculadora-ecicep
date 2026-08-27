# -*- coding: utf-8 -*-
"""Genera la pagina 'Codigos ECICEP estratificacion' ENRIQUECIDA:
normalizada (1 codigo/fila) + nombre oficial CIE-10 de maestro y subcodigo.
Fuente titulos: CIE-10 Vol.1 OPS (paho_titles.json) + bloques de 4o caracter
compartido extraidos del PDF + verificacion multi-agente (N18.x, I48.x, K52.3).
"""
import csv, json, io, contextlib

import os, pathlib
# Output location. Defaults to this repository's datos/ directory; override with
# ECICEP_OUT to write somewhere else. It used to be one hardcoded absolute path
# into the author's cloud-sync folder, which meant this script could not be run
# by anyone, anywhere, including on the server that ships its output.
_AQUI = pathlib.Path(__file__).resolve()
IN_DIR = _AQUI.parent
OUT_DIR = pathlib.Path(os.environ.get("ECICEP_OUT", _AQUI.parents[2] / "datos"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

# importa datos del generador base (silencia su salida al importar)
with contextlib.redirect_stdout(io.StringIO()):
    from gen_codigos_ecicep import COND, REGLA38, fila

titles = json.load(open(IN_DIR / "paho_titles.json", encoding="utf-8"))

# --- bloques de 4o caracter comun (extraidos de CIE-10 Vol.1 OPS) ---
F1x = {".0": "Intoxicación aguda", ".1": "Uso nocivo", ".2": "Síndrome de dependencia",
       ".3": "Estado de abstinencia", ".4": "Estado de abstinencia con delirio",
       ".5": "Trastorno psicótico", ".6": "Síndrome amnésico",
       ".7": "Trastorno psicótico residual y de comienzo tardío",
       ".8": "Otros trastornos mentales y del comportamiento",
       ".9": "Trastorno mental y del comportamiento no especificado"}
E1x = {".0": "Con coma", ".1": "Con cetoacidosis", ".2": "Con complicaciones renales",
       ".3": "Con complicaciones oftálmicas", ".4": "Con complicaciones neurológicas",
       ".5": "Con complicaciones circulatorias periféricas",
       ".6": "Con otras complicaciones especificadas", ".7": "Con complicaciones múltiples",
       ".8": "Con complicaciones no especificadas", ".9": "Sin mención de complicación"}
F7x = {".0": "Deterioro del comportamiento nulo o mínimo",
       ".1": "Deterioro del comportamiento significativo, que requiere atención o tratamiento",
       ".8": "Otros deterioros del comportamiento",
       ".9": "Deterioro del comportamiento de grado no especificado"}
SET_F1x = {f"F{n}" for n in range(10, 20)}
SET_E1x = {"E10", "E11", "E12", "E13", "E14"}
SET_F7x = {f"F{n}" for n in range(70, 80)}

# --- codigos resueltos por verificacion multi-agente (no estan en Vol.1 2008) ---
MANUAL = {
 "N18.1": ("Enfermedad renal crónica, estadio 1", ""),
 "N18.2": ("Enfermedad renal crónica, estadio 2", ""),
 "N18.3": ("Enfermedad renal crónica, estadio 3", ""),
 "N18.4": ("Enfermedad renal crónica, estadio 4", ""),
 "N18.5": ("Enfermedad renal crónica, estadio 5", ""),
 "N18.6": ("Enfermedad renal crónica terminal",
           "Código CIE-10-ES/CM; la base OMS/OPS llega hasta N18.5"),
 "I48.0": ("Fibrilación auricular paroxística", ""),
 "I48.1": ("Fibrilación auricular persistente", ""),
 "I48.2": ("Fibrilación auricular crónica", ""),
 "I48.3": ("Aleteo auricular típico", ""),
 "I48.4": ("Aleteo auricular atípico", ""),
 "I48.9": ("Fibrilación y aleteo auricular, no especificado", ""),
 "K52.3": ("Colitis indeterminada", "Añadido en actualización CIE-10; ausente en Vol.1 OPS 2008"),
 # titulo completo (la tabular lo envuelve tras palabra de contenido); nota la pone NOTA_ESPECIAL
 "I23.2": ("Defecto del tabique ventricular como complicación presente posterior al infarto del miocardio", ""),
}
NOTA_ESPECIAL = {
 "I23.2": ("Probable errata del Marco ECICEP: en contexto de Hipertensión "
           "correspondería I13.2 (enf. cardíaca y renal hipertensiva con IC e IR). "
           "Código transcrito fiel al documento."),
}

def shared(maestro, cod):
    """devuelve (nombre, nota) si el subcodigo pertenece a un bloque comun, si no None"""
    if "." not in cod:
        return None
    sfx = cod[cod.index("."):]
    if maestro in SET_F1x and sfx in F1x:
        return F1x[sfx], "4º carácter común F10–F19"
    if maestro in SET_E1x and sfx in E1x:
        return E1x[sfx], "4º carácter común E10–E14"
    if maestro in SET_F7x and sfx in F7x:
        return F7x[sfx], "4º carácter común F70–F79"
    return None

HDR = ["N°", "Patología", "Puntaje", "Grupo", "Código maestro",
       "Nombre maestro (CIE-10)", "Código CIE-10", "Nombre código (CIE-10)", "Tipo", "Nota"]
rows = [HDR]
sin_nombre = []

for n, nombre, pje, toks in COND:
    if toks == ["__REGLA38__"]:
        for letra, rango, texto, tipo in REGLA38:
            rows.append([str(n), nombre, str(pje), rango[0], rango, texto,
                         rango, texto, "Regla", "Incluye todos los códigos del rango"])
        continue
    for tok in toks:
        maestro, cod, tipo = fila(tok)
        nom_m = titles.get(maestro, "")
        nota = ""
        if cod in MANUAL:
            nom_c, nota = MANUAL[cod]
        elif tipo == "Maestro":
            nom_c = nom_m
        else:
            sh = shared(maestro, cod)
            if sh:
                nom_c, nota = sh
            else:
                nom_c = titles.get(cod, "")
        if cod in NOTA_ESPECIAL:
            nota = NOTA_ESPECIAL[cod]
        if not nom_c:
            sin_nombre.append(cod)
        rows.append([str(n), nombre, str(pje), maestro[0], maestro, nom_m,
                     cod, nom_c, tipo, nota])

out_tsv = str(OUT_DIR / "codigos_ecicep_estratificacion.tsv")
with open(out_tsv, "w", newline="", encoding="utf-8") as f:
    csv.writer(f, delimiter="\t").writerows(rows)
# tambien CSV (respaldo / import alternativo)
with open(OUT_DIR / "codigos_ecicep_estratificacion.csv", "w", newline="", encoding="utf-8") as f:
    csv.writer(f).writerows(rows)

tot = len(rows) - 1
print(f"TSV: {out_tsv}")
print(f"Filas de datos: {tot}  | columnas: {len(HDR)}")
print(f"Sin nombre CIE-10: {len(sin_nombre)}  {sin_nombre}")
print("-- muestra (primeras 8 filas) --")
for r in rows[1:9]:
    print(" | ".join(r))
print("-- muestra Diabetes E11 (bloque comun) --")
for r in rows[1:]:
    if r[4] == "E11":
        print(" | ".join(r))
