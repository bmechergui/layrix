"""
Pipeline complet : .kicad_sch → PCB → Placement CMA-ES → Routage A*
Chaque étape sauvegardée séparément.

Sortie :
  meteo_arduino.kicad_pcb          — PCB généré (footprints + nets)
  meteo_arduino_placed.kicad_pcb   — après optimize-placement CMA-ES
  meteo_arduino_routed.kicad_pcb   — après routage kicad-tools A*
"""

import base64
import logging
import os
import re
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

_KICAD = Path(r"C:\Program Files\KiCad\10.99")
os.environ.setdefault("KICAD_SYMBOL_DIR",    str(_KICAD / "share/kicad/symbols"))
os.environ.setdefault("KICAD_FOOTPRINT_DIR", str(_KICAD / "share/kicad/footprints"))

SCH_PATH = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_sch")
OUT_DIR  = SCH_PATH.parent
BOARD_W, BOARD_H = 100.0, 100.0  # assez grand pour Arduino UNO R3 (68×53mm) + composants

sys.path.insert(0, str(Path(__file__).parents[1]))


def pcb_stats(content: str) -> str:
    fps  = content.count("(footprint ")
    segs = len(re.findall(r"\(segment[\s\n]", content))
    zones = len(re.findall(r"\(zone[\s\n]", content))
    vias = len(re.findall(r"\(via[\s\n]", content))
    return f"{fps} footprints · {segs} segments · {zones} zones · {vias} vias"


def main() -> None:
    if not SCH_PATH.exists():
        print(f"ERREUR — schéma non trouvé : {SCH_PATH}")
        sys.exit(1)

    print(f"Schéma : {SCH_PATH.name}")
    print(f"Board  : {BOARD_W}×{BOARD_H}mm\n")

    # ── Étape 1 : Génération PCB ──────────────────────────────────────────────
    print("═" * 60)
    print("ÉTAPE 1 — Génération PCB (PCBFromSchematic)")
    print("═" * 60)
    # Utiliser generate_pcb() avec kicad_sch_content — même pipeline que POST /pcb/generate.
    # generate_pcb() niveau 1 = _generate_with_kicad_tools (PCBFromSchematic + kicad-cli netlist).
    from tools.pcb import generate_pcb
    from tools.schematic import SchemaComponent, SchemaNet

    # Pas de composants/connexions JSON (test minimal) — PCBFromSchematic lit le .kicad_sch
    pcb_content = generate_pcb(
        components=[],
        connections=[],
        board_w=BOARD_W,
        board_h=BOARD_H,
        kicad_sch_content=SCH_PATH.read_text(encoding="utf-8"),
    )
    if not pcb_content:
        print("ERREUR génération PCB")
        sys.exit(1)

    pcb_path = OUT_DIR / "meteo_arduino.kicad_pcb"
    pcb_path.write_text(pcb_content, encoding="utf-8")
    print(f"OK  {pcb_path.name}  ({pcb_path.stat().st_size:,} octets)")
    print(f"    {pcb_stats(pcb_content)}")

    # ── Étape 2 : Placement CMA-ES ────────────────────────────────────────────
    print()
    print("═" * 60)
    print("ÉTAPE 2 — Placement (kct optimize-placement CMA-ES)")
    print("═" * 60)
    from tools.placement import auto_place

    pcb_b64    = base64.b64encode(pcb_content.encode()).decode()
    place_res  = auto_place(pcb_b64, BOARD_W, BOARD_H)
    placed_bytes  = base64.b64decode(place_res["kicad_pcb_b64"])
    placed_content = placed_bytes.decode("utf-8", errors="replace")

    placed_path = OUT_DIR / "meteo_arduino_placed.kicad_pcb"
    placed_path.write_bytes(placed_bytes)
    print(f"OK  {placed_path.name}  ({placed_path.stat().st_size:,} octets)")
    print(f"    {pcb_stats(placed_content)}")
    print(f"    placed_count = {place_res['placed_count']}")

    # Positions finales — vérifier contre le contour réel du board placé
    from kicad_tools.schema.pcb import PCB as _PCB
    pcb2 = _PCB.load(str(placed_path))
    from kicad_tools.placement.place_unplaced import _get_board_bounds as _bb
    bnds = _bb(pcb2) or (0, 0, BOARD_W, BOARD_H)
    bx0, by0, bx1, by1 = bnds
    print(f"    Board: {bx1-bx0:.0f}×{by1-by0:.0f}mm")
    all_inside = True
    for fp in pcb2.footprints:
        x, y = fp.position
        inside = bx0 <= x <= bx1 and by0 <= y <= by1
        if not inside:
            all_inside = False
        print(f"    {fp.reference:6s}  ({x:.1f}, {y:.1f})mm  {'OK' if inside else 'HORS-BOARD'}")
    if not all_inside:
        print("    ATTENTION — certains composants hors-board")

    # ── Étape 3 : Routage A* ──────────────────────────────────────────────────
    print()
    print("═" * 60)
    print("ÉTAPE 3 — Routage (kicad-tools A* negotiated)")
    print("═" * 60)
    from routers.routing import _route_with_kicad_tools

    # Router depuis le PCB placé (étape 2) — placement et routage cohérents
    routed_bytes, pct = _route_with_kicad_tools(placed_bytes)
    routed_content = routed_bytes.decode("utf-8", errors="replace")

    routed_path = OUT_DIR / "meteo_arduino_routed.kicad_pcb"
    routed_path.write_bytes(routed_bytes)
    print(f"OK  {routed_path.name}  ({routed_path.stat().st_size:,} octets)")
    print(f"    {pcb_stats(routed_content)}")
    print(f"    Routé : {pct}%")

    # ── Bilan ─────────────────────────────────────────────────────────────────
    print()
    print("═" * 60)
    print("BILAN PIPELINE")
    print("═" * 60)
    print(f"  1. PCB généré    → {pcb_path.name}")
    print(f"  2. PCB placé     → {placed_path.name}")
    print(f"  3. PCB routé     → {routed_path.name}")
    print()
    print("Ouvrir dans KiCad :")
    print(f"  Placed : {placed_path}")
    print(f"  Routed : {routed_path}")
    print("  → Appuyer B pour remplir les zones GND/VCC")


if __name__ == "__main__":
    main()
