"""
Pipeline complet : .kicad_sch → PCB non-placé → CMA-ES placement
Solution portable : auto-détecte KiCad sur Windows et Linux/Docker.

Étapes :
  1. Auto-détecter KICAD_SYMBOL_DIR + KICAD_FOOTPRINT_DIR
  2. PCBFromSchematic → ajouter les footprints (place_all_components)
  3. Déplacer tous les footprints hors-board  →  état "non-placé"
  4. place_unplaced CMA-ES (cluster=True)     →  placement optimisé
  5. Sauvegarder meteo_arduino.kicad_pcb

Usage :
  python test_pipeline_sch_to_placed_pcb.py
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

# ─── 1. Auto-détection KiCad (portable Windows + Linux/Docker) ────────────────

def _find_kicad_dir(subdir: str) -> str | None:
    candidates = [
        # Windows
        rf"C:\Program Files\KiCad\10.99\share\kicad\{subdir}",
        rf"C:\Program Files\KiCad\9.0\share\kicad\{subdir}",
        rf"C:\Program Files\KiCad\8.0\share\kicad\{subdir}",
        # Linux / Docker
        f"/usr/share/kicad/{subdir}",
        f"/usr/local/share/kicad/{subdir}",
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    return None

def _setup_kicad_env() -> tuple[str | None, str | None]:
    sym_dir = os.environ.get("KICAD_SYMBOL_DIR") or _find_kicad_dir("symbols")
    fp_dir  = os.environ.get("KICAD_FOOTPRINT_DIR") or _find_kicad_dir("footprints")
    if sym_dir:
        os.environ["KICAD_SYMBOL_DIR"]    = sym_dir
    if fp_dir:
        os.environ["KICAD_FOOTPRINT_DIR"] = fp_dir
    return sym_dir, fp_dir

# ─── Paths ────────────────────────────────────────────────────────────────────

SCH_PATH  = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_sch")
OUT_DIR   = SCH_PATH.parent
BOARD_W   = 200.0   # mm — 3×Arduino largeur (~68mm) + marges
BOARD_H   = 160.0   # mm — 3×Arduino hauteur (~53mm) + marges

# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    # Environnement
    sym_dir, fp_dir = _setup_kicad_env()
    print(f"KICAD_SYMBOL_DIR   : {sym_dir or 'NOT FOUND'}")
    print(f"KICAD_FOOTPRINT_DIR: {fp_dir  or 'NOT FOUND'}")
    if not fp_dir:
        print("ERREUR — KiCad footprints introuvables. Installez KiCad.")
        sys.exit(1)

    if not SCH_PATH.exists():
        print(f"ERREUR — schéma non trouvé : {SCH_PATH}")
        sys.exit(1)

    print(f"\nSchéma : {SCH_PATH.name}")
    print(f"Board  : {BOARD_W}×{BOARD_H}mm\n")

    from kicad_tools.workflow import PCBFromSchematic
    from kicad_tools.schema.pcb import PCB
    from kicad_tools.placement.place_unplaced import place_unplaced

    with tempfile.TemporaryDirectory() as tmp:
        sch_tmp     = Path(tmp) / "schematic.kicad_sch"
        pcb_unplaced = Path(tmp) / "unplaced.kicad_pcb"
        pcb_placed   = Path(tmp) / "placed.kicad_pcb"
        shutil.copy(SCH_PATH, sch_tmp)

        # ── Étape 2 : PCBFromSchematic → charge les vrais footprints ──────────
        print("Étape 2 — Génération PCB + chargement footprints...")
        wf = PCBFromSchematic(sch_tmp)
        wf.create_pcb(width=BOARD_W, height=BOARD_H, layers=2, title="Meteo Arduino")
        wf.place_all_components(spacing=20.0, margin=5.0)
        wf.assign_nets()
        wf.save(pcb_unplaced)

        pcb = PCB.load(str(pcb_unplaced))
        n_fp = len(pcb.footprints)
        print(f"  {n_fp} footprints chargés")
        if n_fp == 0:
            print("  ERREUR — aucun footprint. Vérifiez KICAD_FOOTPRINT_DIR.")
            sys.exit(1)

        # ── Étape 3 : Déplacer hors-board → état "non-placé" ─────────────────
        print("\nÉtape 3 — Déplacement hors-board (y = -(BOARD_H + 20))...")
        for fp in pcb.footprints:
            # Au-dessus du board (y négatif) → outside_bounds = True
            fp.position = (fp.position[0], -(BOARD_H + 20.0))
        pcb.save(str(pcb_unplaced))

        # Vérification
        pcb_check = PCB.load(str(pcb_unplaced))
        print("  Positions avant CMA-ES :")
        for fp in pcb_check.footprints:
            print(f"    {fp.reference:6s}  ({fp.position[0]:.1f}, {fp.position[1]:.1f})mm  [hors-board]")

        # ── Étape 4 : CMA-ES placement ────────────────────────────────────────
        print(f"\nÉtape 4 — CMA-ES place_unplaced (cluster=True, margin=3mm)...")
        result = place_unplaced(
            str(pcb_unplaced),
            output_path=str(pcb_placed),
            margin=3.0,
            spacing=3.0,
            cluster=True,
        )
        print(f"  total_unplaced : {result.total_unplaced}")
        print(f"  placed_refs    : {result.placed_refs}")
        print(f"  overflow_refs  : {result.overflow_refs}")

        # Fallback : placer les overflows en grille en bas du board
        if result.overflow_refs:
            print(f"  Overflow : {result.overflow_refs} → placement grille fallback")
            pcb_tmp = PCB.load(str(pcb_placed if pcb_placed.exists() else pcb_unplaced))
            overflow_fps = [fp for fp in pcb_tmp.footprints if fp.reference in result.overflow_refs]
            fallback_x = 5.0
            fallback_y = BOARD_H - 20.0   # dernière rangée
            for fp in overflow_fps:
                fp.position = (fallback_x, fallback_y)
                fallback_x += 20.0
                print(f"    {fp.reference} → ({fp.position[0]:.1f}, {fp.position[1]:.1f})mm [fallback]")
            pcb_tmp.save(str(pcb_placed))

        # ── Étape 5 : Sauvegarder + rapport ───────────────────────────────────
        src_for_save = pcb_placed if pcb_placed.exists() else pcb_unplaced
        final_pcb = PCB.load(str(src_for_save))
        out_path = OUT_DIR / "meteo_arduino.kicad_pcb"
        shutil.copy(src_for_save, out_path)

        print("\nPositions FINALES :")
        all_inside = True
        for fp in final_pcb.footprints:
            x, y = fp.position
            inside = 0 <= x <= BOARD_W and 0 <= y <= BOARD_H
            status = "OK" if inside else "HORS-BOARD"
            if not inside:
                all_inside = False
            print(f"  {fp.reference:6s}  ({x:6.1f}, {y:6.1f})mm  [{status}]")

        print(f"\n{'─'*50}")
        print(f"Fichier : {out_path.name}  ({out_path.stat().st_size:,} octets)")
        if all_inside:
            print("SUCCES — tous les composants sont dans le board.")
            print("Ouvrir dans KiCad : meteo_arduino.kicad_pcb")
        else:
            print("PARTIEL — certains composants hors-board.")
            print("Cause probable : footprint trop grand pour le board.")
            print(f"Solution : augmenter BOARD_W/BOARD_H (actuellement {BOARD_W}×{BOARD_H}mm)")


if __name__ == "__main__":
    main()
