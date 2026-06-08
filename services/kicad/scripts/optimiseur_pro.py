#!/usr/bin/env python3
"""
optimiseur_pro.py — Optimisation de placement via l'API RÉELLE de kicad-tools.

Combine le solver physics (PlacementOptimizer) avec les heuristiques réellement
exposées par l'API Python (la CLI `optimize-placement` ne les a pas) :
  · fixed_refs        → connecteurs (J*/P*) ancrés
  · enable_clustering → regroupe les grappes électriques (caps/quartz près du MCU)
  · run()             → simulation force-directed
  · snap_rotations_to_90() → rotations cardinales (0/90/180/270°)
  · write_to_pcb / save

ATTENTION : les méthodes lock()/add_group()/set_weights()/set_thermal_components()/
optimize()/save() décrites dans certaines docs N'EXISTENT PAS dans cette version
du package (vérifié). Ce script n'utilise que l'API réellement présente :
  PlacementOptimizer.from_pcb(pcb, fixed_refs=..., enable_clustering=...)
  .run(iterations=...) / .snap_rotations_to_90() / .write_to_pcb(pcb)

Usage:
    python scripts/optimiseur_pro.py <input.kicad_pcb> -o <output.kicad_pcb> [--iterations N]
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from kicad_tools.optim import PlacementOptimizer
from kicad_tools.schema.pcb import PCB

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description="Placement optimiseur (API réelle kicad-tools)")
    parser.add_argument("input_pcb", help="PCB KiCad d'entrée")
    parser.add_argument("-o", "--output", required=True, help="PCB KiCad de sortie")
    parser.add_argument("--iterations", type=int, default=1000)
    args = parser.parse_args()

    input_path = Path(args.input_pcb)
    if not input_path.exists():
        logging.error("Fichier introuvable : %s", input_path)
        return 1

    logging.info("Chargement du PCB : %s", input_path)
    pcb = PCB.load(str(input_path))

    # 1. Verrouillage automatique des connecteurs (J*, P*) — ancrage périmètre
    connectors = [
        fp.reference for fp in pcb.footprints
        if fp.reference and fp.reference[0] in ("J", "P")
    ]
    if connectors:
        logging.info("Connecteurs ancrés : %s", ", ".join(connectors))

    # 2. Optimiseur officiel : clustering (groupes) + connecteurs fixes
    optimizer = PlacementOptimizer.from_pcb(
        pcb,
        fixed_refs=connectors,
        enable_clustering=True,
    )

    # 3. Simulation force-directed + rotations cardinales
    logging.info("Optimisation (iterations=%d, clustering=on)…", args.iterations)
    ran = optimizer.run(iterations=args.iterations)
    optimizer.snap_rotations_to_90()
    optimizer.write_to_pcb(pcb)
    pcb.save(args.output)
    logging.info("Terminé (%d itérations) → %s", ran, args.output)

    for fp in PCB.load(args.output).footprints:
        x, y = fp.position
        logging.info("  %-6s (%7.2f, %7.2f)  rot=%.0f", fp.reference, x, y, fp.rotation)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
