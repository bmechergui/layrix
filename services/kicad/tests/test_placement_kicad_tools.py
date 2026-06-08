"""
Test placement kicad-tools CMA-ES — Station météo Arduino
Niveau 1 : kicad_tools.placement.place_unplaced (cluster=True, margin=1.5mm)
Fallback  : pcbnew grille simple

Entrée : meteo_arduino.kicad_pcb  (généré par test_pcb_gen_kicad_tools.py)
Sortie : meteo_arduino_placed.kicad_pcb
"""

import base64
import logging
import os
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

_KICAD_BASE = Path(r"C:\Program Files\KiCad\10.99")
os.environ.setdefault("KICAD_SYMBOL_DIR",    str(_KICAD_BASE / "share/kicad/symbols"))
os.environ.setdefault("KICAD_FOOTPRINT_DIR", str(_KICAD_BASE / "share/kicad/footprints"))

PCB_PATH = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_pcb")
OUT_DIR  = PCB_PATH.parent
BOARD_W  = 50.0
BOARD_H  = 50.0

sys.path.insert(0, str(Path(__file__).parents[1]))


def positions_from_pcb(content: str) -> list[dict]:
    """Extrait les positions (ref, x, y) des footprints dans le .kicad_pcb."""
    results = []
    for m in re.finditer(
        r'\(footprint\s+"[^"]+"\s+\(layer\s+"[^"]+"\)\s+\(at\s+([\d.\-]+)\s+([\d.\-]+)',
        content,
    ):
        x, y = float(m.group(1)), float(m.group(2))
        ref_m = re.search(r'\(property\s+"Reference"\s+"([^"]+)"', content[m.start():m.start()+500])
        ref = ref_m.group(1) if ref_m else "?"
        results.append({"ref": ref, "x": x, "y": y})
    return results


def main() -> None:
    if not PCB_PATH.exists():
        print(f"ERREUR — PCB non trouvé : {PCB_PATH}")
        print("Lancez d'abord test_pcb_gen_kicad_tools.py")
        sys.exit(1)

    pcb_content = PCB_PATH.read_bytes()
    pcb_b64 = base64.b64encode(pcb_content).decode()

    print(f"PCB entrée : {PCB_PATH.name}  ({len(pcb_content):,} octets)")

    # Positions avant placement
    content_before = pcb_content.decode("utf-8", errors="replace")
    pos_before = positions_from_pcb(content_before)
    if pos_before:
        print("\nPositions AVANT placement :")
        for p in pos_before:
            print(f"  {p['ref']:6s}  x={p['x']:6.2f}mm  y={p['y']:6.2f}mm")

    # ── Placement ──────────────────────────────────────────────────────────────
    print(f"\nPlacement kicad-tools CMA-ES (cluster=True, margin=1.5mm)...")
    from tools.placement import auto_place
    result = auto_place(pcb_b64, BOARD_W, BOARD_H)

    placed_count = result.get("placed_count", 0)
    engine = "kicad-tools CMA-ES" if placed_count > 0 else "fallback grille"
    print(f"  Composants placés : {placed_count}  [{engine}]")

    if result.get("positions"):
        for p in result["positions"]:
            print(f"  → {p['ref']}")

    # ── Sauvegarder ────────────────────────────────────────────────────────────
    out_bytes = base64.b64decode(result["kicad_pcb_b64"])
    out_content = out_bytes.decode("utf-8", errors="replace")
    out_path = OUT_DIR / "meteo_arduino_placed.kicad_pcb"
    out_path.write_text(out_content, encoding="utf-8")

    # Positions après placement
    pos_after = positions_from_pcb(out_content)
    if pos_after:
        print("\nPositions APRES placement :")
        for p in pos_after:
            print(f"  {p['ref']:6s}  x={p['x']:6.2f}mm  y={p['y']:6.2f}mm")

    print(f"\nOK  {out_path.name}  ({out_path.stat().st_size:,} octets)")
    print("Pret pour routage.")


if __name__ == "__main__":
    main()
