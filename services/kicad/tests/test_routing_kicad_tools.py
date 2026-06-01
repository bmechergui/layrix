"""
Test routage kicad-tools A* — Station météo Arduino
Niveau 1 : kicad_tools.cli route (negotiated, skip GND)

Entrée : meteo_arduino.kicad_pcb (avec composants placés)
Sortie : meteo_arduino_routed.kicad_pcb

Note : 75 nets au total mais ~70 sont mono-pad (Arduino pins non connectés)
→ seuls VCC_5V, DHT_DATA ont réellement besoin d'être routés.
"""

import logging
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

_KICAD_BASE = Path(r"C:\Program Files\KiCad\10.99")
os.environ.setdefault("KICAD_SYMBOL_DIR",    str(_KICAD_BASE / "share/kicad/symbols"))
os.environ.setdefault("KICAD_FOOTPRINT_DIR", str(_KICAD_BASE / "share/kicad/footprints"))

PCB_PATH = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_pcb")
OUT_DIR  = PCB_PATH.parent

sys.path.insert(0, str(Path(__file__).parents[1]))


def count_routable_nets(pcb_bytes: bytes) -> tuple[int, int]:
    """Retourne (total_nets, routable_nets) — nets avec ≥2 pads."""
    txt = pcb_bytes.decode("utf-8", errors="replace")
    all_nets = re.findall(r'\(net\s+(\d+)\s+"([^"]+)"\)', txt)
    all_named = [(int(nid), name) for nid, name in all_nets if name]

    # Compter les pads par net
    pad_nets = re.findall(r'\(net\s+(\d+)\s+"([^"]+)"\)', txt)
    # Compter occurrences de chaque net_id dans les pads
    pad_net_ids = re.findall(r'\(pad\s+[^\)]+\(net\s+(\d+)\s+"[^"]+"\)', txt)
    from collections import Counter
    pad_count = Counter(int(n) for n in pad_net_ids)

    routable = [(nid, name) for nid, name in all_named
                if pad_count.get(nid, 0) >= 2 and name != "GND"]

    return len(all_named), routable


def route_kicad_tools(pcb_bytes: bytes, timeout_s: int = 90) -> tuple[bytes, str]:
    """Niveau 1 — kicad_tools.cli route negotiated. Retourne (routed_bytes, info)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.kicad_pcb"
        dst = Path(tmp) / "output.kicad_pcb"
        src.write_bytes(pcb_bytes)

        cmd = [
            sys.executable, "-m", "kicad_tools.cli", "route",
            str(src),
            "--output", str(dst),
            "--strategy", "negotiated",
            "--per-net-timeout", "30",
            "--timeout", str(timeout_s),
            "--skip-nets", "GND",
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout_s + 15, check=False,
        )

        info = result.stdout[-500:] if result.stdout else result.stderr[-300:]

        if not dst.exists():
            raise RuntimeError(
                f"kicad-tools route: no output (rc={result.returncode})\n{info}"
            )
        return dst.read_bytes(), info


def main() -> None:
    if not PCB_PATH.exists():
        print(f"ERREUR — PCB non trouvé : {PCB_PATH}")
        print("Lancez d'abord test_pipeline_sch_to_placed_pcb.py")
        sys.exit(1)

    pcb_bytes = PCB_PATH.read_bytes()
    print(f"PCB entrée : {PCB_PATH.name}  ({len(pcb_bytes):,} octets)")

    # Analyse nets
    total_nets, routable = count_routable_nets(pcb_bytes)
    print(f"\nNets total    : {total_nets}")
    print(f"Nets routables: {len(routable)} (>=2 pads, hors GND)")
    for nid, name in routable:
        print(f"  net {nid:3d}  {name}")

    # Niveau 1 — kicad-tools A*
    print(f"\nRoutage kicad-tools A* (negotiated, timeout=90s)...")
    try:
        routed_bytes, info = route_kicad_tools(pcb_bytes, timeout_s=90)
        print("  OK")

        out_path = OUT_DIR / "meteo_arduino_routed.kicad_pcb"
        out_path.write_bytes(routed_bytes)

        # Compter pistes générées
        routed_txt = routed_bytes.decode("utf-8", errors="replace")
        segments = len(re.findall(r'\(segment\s', routed_txt))
        vias     = len(re.findall(r'\(via\s', routed_txt))
        print(f"\n  Segments routés : {segments}")
        print(f"  Vias            : {vias}")
        print(f"\nOK  {out_path.name}  ({out_path.stat().st_size:,} octets)")

        if info.strip():
            print(f"\nInfo routeur :\n{info[:400]}")

    except Exception as exc:
        print(f"  kicad-tools A* échoué : {exc}")
        print("\n  → Freerouting (Java) absent sur cette machine")
        print("  → En production Docker : Freerouting disponible (/opt/freerouting/freerouting.jar)")
        print("  → Niveau 3 : skipped=True → TypeScript addGroundPlane() GND plane B.Cu")


if __name__ == "__main__":
    main()
