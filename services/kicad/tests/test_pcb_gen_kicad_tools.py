"""
Test génération PCB — kicad-tools PCBFromSchematic (Niveau 1)
Sans Docker. Entrée : meteo_arduino.kicad_sch (ERC-clean)
Sortie  : meteo_arduino.kicad_pcb

Pipeline :
  Niveau 1 : kicad_tools.workflow.PCBFromSchematic  ← ce test
  Niveau 2 : pcbnew direct                          (fallback)
  Niveau 3 : TypeScript S-expr                      (fallback final)
"""

import logging
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

# KiCad 10.99 — requis par kicad-tools pour charger les vrais footprints
import os
_KICAD_BASE = Path(r"C:\Program Files\KiCad\10.99")
os.environ.setdefault("KICAD_SYMBOL_DIR",   str(_KICAD_BASE / "share" / "kicad" / "symbols"))
os.environ.setdefault("KICAD_FOOTPRINT_DIR", str(_KICAD_BASE / "share" / "kicad" / "footprints"))

SCH_PATH  = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_sch")
OUT_DIR   = SCH_PATH.parent
BOARD_W   = 50.0   # mm
BOARD_H   = 50.0   # mm

# Layrix tools
sys.path.insert(0, str(Path(__file__).parents[1]))


def generate_pcb_kicad_tools(sch_content: str, board_w: float, board_h: float) -> str | None:
    """Niveau 1 — kicad-tools PCBFromSchematic."""
    from kicad_tools.workflow import PCBFromSchematic

    with tempfile.TemporaryDirectory() as tmp:
        sch_path = Path(tmp) / "schematic.kicad_sch"
        pcb_path = Path(tmp) / "schematic.kicad_pcb"
        sch_path.write_text(sch_content, encoding="utf-8")

        workflow = PCBFromSchematic(sch_path)
        workflow.create_pcb(width=board_w, height=board_h, layers=2, title="Meteo Arduino")
        workflow.place_all_components(spacing=15.0, margin=5.0)
        workflow.assign_nets()
        workflow.save(pcb_path)

        if pcb_path.exists():
            content = pcb_path.read_text(encoding="utf-8")
            # Compter les composants et nets dans le PCB
            import re
            fps   = len(re.findall(r'\(footprint ', content))
            nets  = len(re.findall(r'^\s*\(net \d+', content, re.MULTILINE))
            print(f"  Footprints placés : {fps}")
            print(f"  Nets assignés     : {nets}")
            return content
        return None


def main() -> None:
    if not SCH_PATH.exists():
        print(f"ERREUR — schéma non trouvé : {SCH_PATH}")
        sys.exit(1)

    sch_content = SCH_PATH.read_text(encoding="utf-8")
    print(f"Schéma : {SCH_PATH.name}  ({len(sch_content):,} chars)")
    print(f"Board  : {BOARD_W}mm x {BOARD_H}mm\n")

    # ── Niveau 1 : kicad-tools ────────────────────────────────────────────────
    print("Niveau 1 — kicad-tools PCBFromSchematic...")
    try:
        pcb_content = generate_pcb_kicad_tools(sch_content, BOARD_W, BOARD_H)
    except Exception as exc:
        print(f"  ECHEC kicad-tools : {exc}")
        pcb_content = None

    if pcb_content:
        out_path = OUT_DIR / "meteo_arduino.kicad_pcb"
        out_path.write_text(pcb_content, encoding="utf-8")
        size = out_path.stat().st_size
        print(f"\nOK  {out_path.name}  ({size:,} octets)")
        print("Pret pour placement / routage.")
    else:
        # ── Niveau 2 : generate_pcb (pcbnew) ─────────────────────────────────
        print("  kicad-tools echoue — tentative niveau 2 (generate_pcb)...")
        try:
            from tools.pcb import generate_pcb
            from tools.schematic import SchemaComponent, SchemaNet
            pcb_content = generate_pcb(
                components=[],
                connections=[],
                board_w=BOARD_W,
                board_h=BOARD_H,
                kicad_sch_content=sch_content,
            )
        except Exception as exc:
            print(f"  ECHEC niveau 2 : {exc}")
            pcb_content = None

        if pcb_content:
            out_path = OUT_DIR / "meteo_arduino.kicad_pcb"
            out_path.write_text(pcb_content, encoding="utf-8")
            size = out_path.stat().st_size
            print(f"\nOK (niveau 2)  {out_path.name}  ({size:,} octets)")
        else:
            print("\nKO — tous les niveaux Python ont echoue.")
            print("     → TypeScript runCircuitSynthEngine() prendrait le relais en production.")
            sys.exit(1)


if __name__ == "__main__":
    main()
