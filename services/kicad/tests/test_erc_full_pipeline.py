"""
Test ERC pipeline complet — Station météo Arduino
  Étape 1 : kicad-cli sch erc → violations avec coordonnées
  Étape 2 : apply_no_connect_fixes sur pin_not_connected
  Étape 3 : kicad-cli sch erc → rapport final

Entrée  : C:\\Users\\Mechegui\\Downloads\\Kicadmcptest\\test\\meteo_arduino\\meteo_arduino.kicad_sch
Sortie  : meteo_arduino_erc_clean.kicad_sch (si ERC clean après auto-fix)
"""

import json
import logging
import subprocess
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

KICAD_CLI    = Path(r"C:\Program Files\KiCad\10.99\bin\kicad-cli.exe")
SCH_PATH     = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_sch")
OUT_DIR      = SCH_PATH.parent
MAX_ITER     = 3

# Layrix tools sur le PYTHONPATH
sys.path.insert(0, str(Path(__file__).parents[1]))
from tools.erc import apply_no_connect_fixes, parse_erc_report


# ─── helpers ──────────────────────────────────────────────────────────────────

def run_kicad_cli_erc(sch_path: Path) -> list[dict]:
    """Lance kicad-cli sch erc et retourne les violations parsées."""
    with tempfile.TemporaryDirectory() as tmp:
        report_path = Path(tmp) / "erc.json"
        # kicad-cli a besoin d'un .kicad_pro dans le même dossier
        pro_path = Path(tmp) / "tmp.kicad_pro"
        pro_path.write_text("{}", encoding="utf-8")
        sch_copy  = Path(tmp) / sch_path.name
        sch_copy.write_text(sch_path.read_text(encoding="utf-8"), encoding="utf-8")

        cmd = [
            str(KICAD_CLI), "sch", "erc",
            str(sch_copy),
            "--output", str(report_path),
            "--format", "json",
            "--severity-all",
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=False,
        )
        if result.returncode != 0 and not report_path.exists():
            print(f"  kicad-cli stderr: {result.stderr[:300]}")
            return []
        if not report_path.exists():
            return []
        return parse_erc_report(report_path.read_text(encoding="utf-8"))


def _run_on_content(content: str) -> list[dict]:
    """Lance kicad-cli erc sur un contenu schéma (via fichier temporaire)."""
    with tempfile.TemporaryDirectory() as tmp:
        sch_path = Path(tmp) / "schematic.kicad_sch"
        sch_path.write_text(content, encoding="utf-8")
        pro_path = Path(tmp) / "schematic.kicad_pro"
        pro_path.write_text("{}", encoding="utf-8")
        report_path = Path(tmp) / "erc.json"

        cmd = [
            str(KICAD_CLI), "sch", "erc",
            str(sch_path),
            "--output", str(report_path),
            "--format", "json",
            "--severity-all",
        ]
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30, check=False,
        )
        if not report_path.exists():
            return []
        return parse_erc_report(report_path.read_text(encoding="utf-8"))


def print_violations(violations: list[dict], label: str) -> None:
    errors   = [v for v in violations if v.get("severity") == "error"]
    warnings = [v for v in violations if v.get("severity") == "warning"]
    print(f"\n{'─'*60}")
    print(f"  {label}")
    print(f"{'─'*60}")
    print(f"  Erreurs     : {len(errors)}")
    print(f"  Warnings    : {len(warnings)}")
    print(f"  Total       : {len(violations)}")
    if violations:
        print("\n  Violations :")
        for v in violations[:30]:          # max 30 lignes
            sev  = v.get("severity","?").upper()
            vtyp = v.get("type") or v.get("message","")
            ref  = v.get("ref","")
            pin  = v.get("pin","")
            loc  = f" [{ref} pin {pin}]" if ref else ""
            x    = v.get("x_mm")
            coord= f" @({x:.2f},{v.get('y_mm',0):.2f})" if x is not None else ""
            print(f"    [{sev:7s}] {vtyp}{loc}{coord}")
        if len(violations) > 30:
            print(f"    ... et {len(violations)-30} autres")


# ─── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    if not SCH_PATH.exists():
        print(f"ERREUR — schéma non trouvé : {SCH_PATH}")
        sys.exit(1)
    if not KICAD_CLI.exists():
        print(f"ERREUR — kicad-cli non trouvé : {KICAD_CLI}")
        sys.exit(1)

    print(f"Schéma : {SCH_PATH.name}")
    print(f"kicad-cli : {KICAD_CLI}\n")

    # ── Étape 1 : ERC initial ─────────────────────────────────────────────────
    print("Étape 1 — kicad-cli ERC initial...")
    current_content = SCH_PATH.read_text(encoding="utf-8")
    violations = _run_on_content(current_content)
    print_violations(violations, "ERC initial (avant auto-fix)")

    if not violations:
        print("\nERC CLEAN dès le départ — aucun fix nécessaire.")
        return

    # ── Étape 2 : boucle auto-fix no_connect (max 3×) ────────────────────────
    print(f"\nÉtape 2 — auto-fix no_connect (max {MAX_ITER} itérations)...")
    total_fixed = 0

    for iteration in range(1, MAX_ITER + 1):
        fixable = [
            v for v in violations
            if v.get("type") == "pin_not_connected"
            and v.get("x_mm") is not None
            and v.get("y_mm") is not None
        ]
        if not fixable:
            print(f"  Iter {iteration} — aucune violation pin_not_connected avec coords → stop")
            break

        new_content, fixed_this = apply_no_connect_fixes(current_content, fixable)
        total_fixed += fixed_this
        print(f"  Iter {iteration} — {fixed_this} marqueurs no_connect ajoutés (total: {total_fixed})")

        if fixed_this == 0:
            break

        current_content = new_content

        # Re-lancer ERC pour voir si violations restantes
        violations = _run_on_content(current_content)
        remaining_fixable = [
            v for v in violations
            if v.get("type") == "pin_not_connected"
        ]
        if not remaining_fixable:
            print(f"  → Plus de pin_not_connected après iter {iteration}")
            break

    # ── Étape 3 : ERC final ───────────────────────────────────────────────────
    print("\nÉtape 3 — kicad-cli ERC final (après auto-fix)...")
    final_violations = _run_on_content(current_content)
    print_violations(final_violations, f"ERC final (après {total_fixed} auto-fix)")

    # ── Sauvegarde ────────────────────────────────────────────────────────────
    final_errors = [v for v in final_violations if v.get("severity") == "error"]
    erc_clean = len(final_errors) == 0

    if total_fixed > 0:
        suffix = "_erc_clean" if erc_clean else "_erc_fixed"
        out_path = OUT_DIR / f"{SCH_PATH.stem}{suffix}.kicad_sch"
        out_path.write_text(current_content, encoding="utf-8")
        print(f"\nSchéma sauvegardé : {out_path.name}  ({out_path.stat().st_size:,} octets)")

    print()
    if erc_clean:
        print("OK — ERC CLEAN apres auto-fix. Pret pour generation PCB.")
    else:
        remaining = [v.get("type","?") for v in final_violations if v.get("severity")=="error"]
        from collections import Counter
        counts = Counter(remaining)
        print("KO — Violations restantes (non auto-fixables) :")
        for vtype, cnt in counts.most_common():
            print(f"  {cnt}x {vtype}")


if __name__ == "__main__":
    main()
