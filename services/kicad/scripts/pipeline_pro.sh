#!/bin/bash
# Pipeline PCB pro de bout en bout (démo / validation) basé sur kicad-tools officiel.
#   sync -> placement (optimiseur_pro.py) -> route -> reason (rescue IA) -> check
#
# Usage : ./pipeline_pro.sh <dossier_board>
#   ex.  ./pipeline_pro.sh ../kicad-tools/boards/01-voltage-divider
#
# Le board doit déjà contenir .kicad_sch et .kicad_pcb (généré par `kct build`
# ou generate_design.py). Sorties écrites dans <board>/output/.
set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <board_directory>"
    echo "Example: $0 ../kicad-tools/boards/01-voltage-divider"
    exit 1
fi

BOARD_DIR=$1
if [ ! -d "$BOARD_DIR" ]; then
    echo "Error: Directory $BOARD_DIR not found!"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Portable runner : `uv run` si dispo, sinon python/kct direct (pip install -e .)
if command -v uv >/dev/null 2>&1; then
    KCT="uv run kct"
    PY="uv run python"
else
    KCT="python -m kicad_tools.cli"
    PY="python"
fi

SCH_FILE=$(find "$BOARD_DIR" -name "*.kicad_sch" | head -n 1)
PCB_FILE=$(find "$BOARD_DIR" -name "*.kicad_pcb" ! -name "*_routed*" ! -name "*_optim*" | head -n 1)

if [ -z "$SCH_FILE" ] || [ -z "$PCB_FILE" ]; then
    echo "Error: Could not find .kicad_sch or .kicad_pcb in $BOARD_DIR"
    exit 1
fi

BASENAME=$(basename "$PCB_FILE" .kicad_pcb)
OUT_DIR="$(dirname "$PCB_FILE")"
OPTIM_FILE="${OUT_DIR}/${BASENAME}_optimised.kicad_pcb"
ROUTED_FILE="${OUT_DIR}/${BASENAME}_routed.kicad_pcb"

echo "=========================================================="
echo " Pipeline end-to-end : $BASENAME"
echo "=========================================================="

echo "=== ETAPE 1 : Synchronisation (Schema -> PCB) ==="
$KCT sync "$SCH_FILE" "$PCB_FILE" || echo "Sync skipped or already up-to-date."

echo "=== ETAPE 2 : Placement (physics + clustering + connecteurs ancres) ==="
$PY "$SCRIPT_DIR/optimiseur_pro.py" "$PCB_FILE" -o "$OPTIM_FILE" --iterations 1000

echo "=== ETAPE 3 : Routage automatique ==="
set +e
$KCT route "$OPTIM_FILE" --output "$ROUTED_FILE" --auto-layers --auto-fix --seed 42 --timeout 1500
ROUTE_EXIT_CODE=$?
set -e

if [ $ROUTE_EXIT_CODE -eq 0 ]; then
    echo "Succes : routage classique termine."
else
    echo "AVERTISSEMENT : le routeur s'est bloque."
    echo "=== ETAPE 4 : Sauvetage par l'IA (kct reason) ==="
    $KCT reason "$ROUTED_FILE" --auto-route
fi

echo "=== ETAPE 5 : Validation DRC finale (JLCPCB) ==="
$KCT check "$ROUTED_FILE" --mfr jlcpcb --format json || echo "Violations DRC subsistent, a verifier."

echo "=========================================================="
echo " Pipeline termine. Fichier final : $ROUTED_FILE"
echo "=========================================================="
