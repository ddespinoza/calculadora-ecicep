#!/usr/bin/env bash
# Every check this repository has. No dependencies beyond node and python3, no network,
# no database.
#
#   scripts/check.sh
#
# Run it before committing. There is no build step and no package.json to catch a mistake
# later: motor.mjs and ecicep-codigos.mjs are copied straight into the Site's theme, so a
# break here is a break there.
#
# No tier skips itself. A missing tool is a FAILURE, never a skip: a tier that skips itself
# is indistinguishable from a tier that checks nothing, and green then means something the
# gate never measured. Every tier prints what it actually measured, not that it ran.
set -uo pipefail

cd "$(dirname "$0")/.."
fallos=0
REGISTRO=/tmp/ecicep-motor-test.log

echo "== pruebas del motor =="
if ! command -v node >/dev/null 2>&1; then
  echo "   node no está instalado — no se pueden correr las pruebas"
  fallos=$((fallos + 1))
elif node --test 'tests/*.test.mjs' >"$REGISTRO" 2>&1; then
  n=$(sed -n 's/^# pass //p' "$REGISTRO" | head -1)
  # An empty suite exits 0 and would pass vacuously; count the tests, don't trust the code.
  if [ "${n:-0}" -gt 0 ] 2>/dev/null; then
    echo "   $n prueba(s) OK — motor, fixture dorada y contraste con el Anexo 4"
  else
    echo "   node --test no corrió ninguna prueba — el gate no midió nada"
    fallos=$((fallos + 1))
  fi
else
  sed -n '/^not ok/,+3p' "$REGISTRO" | head -40
  echo "   las pruebas FALLARON — registro completo en $REGISTRO"
  fallos=$((fallos + 1))
fi

echo
echo "== archivo generado =="
# ecicep-codigos.mjs is committed but GENERATED from the CSV. tests/datos.test.mjs already
# runs this same command through execFileSync; it is repeated here as its own visible tier
# because a gate nobody can see running is a gate nobody maintains.
if ! command -v node >/dev/null 2>&1; then
  echo "   node no está instalado — no se puede comprobar ecicep-codigos.mjs"
  fallos=$((fallos + 1))
elif ! node scripts/build-codigos.mjs --check; then
  fallos=$((fallos + 1))
fi

echo
echo "== sintaxis de los generadores =="
# The generators are not exercised by the test suite — regenerating the CSV is a manual,
# deliberate act — so a syntax error in them would otherwise surface only the day someone
# needs to reproduce the clinical data.
if ! command -v python3 >/dev/null 2>&1; then
  echo "   python3 no está instalado — no se pueden comprobar los generadores"
  fallos=$((fallos + 1))
else
  n=0
  sanos=0
  while IFS= read -r f; do
    n=$((n + 1))
    if salida=$(python3 -m py_compile "$f" 2>&1); then
      sanos=$((sanos + 1))
    else
      echo "$salida"
      fallos=$((fallos + 1))
    fi
  done < <(find scripts/fuente -name '*.py' -type f)
  if [ "$n" -eq 0 ]; then
    echo "   no se encontró ningún generador en scripts/fuente — el gate no midió nada"
    fallos=$((fallos + 1))
  elif [ "$sanos" -eq "$n" ]; then
    echo "   $n archivo(s) Python sin errores de sintaxis"
  else
    echo "   $sanos de $n archivo(s) Python sin errores de sintaxis"
  fi
fi

echo
if [ "$fallos" -eq 0 ]; then
  echo "todo en orden"
  exit 0
fi
echo "$fallos comprobación(es) fallaron"
exit 1
