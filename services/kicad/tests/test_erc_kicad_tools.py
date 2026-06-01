"""
Test ERC kicad-tools — Station météo Arduino
Niveau 1 : kicad-tools Schematic.validate() uniquement (pur Python, sans Docker).

Entrée  : C:\\Users\\Mechegui\\Downloads\\Kicadmcptest\\test\\meteo_arduino\\meteo_arduino.kicad_sch
Sortie  : résultats ERC + schéma corrigé si auto-fix appliqué
"""

import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.WARNING)

# Chemin du schéma à vérifier
SCH_PATH = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test\meteo_arduino\meteo_arduino.kicad_sch")

# Ajouter le router Layrix au PYTHONPATH
KICAD_SERVICE = Path(__file__).parents[1]
sys.path.insert(0, str(KICAD_SERVICE))


def run_erc_kicad_tools(sch_content: str, auto_fix: bool = True):
    """Appelle run_kicad_tools_erc depuis tools/erc.py."""
    from tools.erc import run_kicad_tools_erc
    return run_kicad_tools_erc(sch_content, auto_fix=auto_fix)


def main() -> None:
    if not SCH_PATH.exists():
        print(f"ERREUR — schéma non trouvé : {SCH_PATH}")
        sys.exit(1)

    sch_content = SCH_PATH.read_text(encoding="utf-8")
    print(f"Schéma lu : {SCH_PATH.name}  ({len(sch_content):,} chars)")
    print("ERC kicad-tools en cours...\n")

    violations, updated_content, fixed_count = run_erc_kicad_tools(sch_content, auto_fix=True)

    # Résultats
    errors   = [v for v in violations if v.get("severity") == "error"]
    warnings = [v for v in violations if v.get("severity") == "warning"]
    erc_clean = len(errors) == 0

    print(f"{'ERC CLEAN' if erc_clean else 'ERC VIOLATIONS TROUVEES':^60}")
    print("=" * 60)
    print(f"  Total violations  : {len(violations)}")
    print(f"  Erreurs bloquantes: {len(errors)}")
    print(f"  Avertissements    : {len(warnings)}")
    print(f"  Auto-fixes        : {fixed_count}")
    print("=" * 60)

    if violations:
        print("\nDétail des violations :")
        for v in violations:
            sev  = v.get("severity", "?").upper()
            msg  = v.get("message", "")
            vtyp = v.get("type") or ""
            ref  = v.get("ref") or ""
            pin  = v.get("pin") or ""
            loc  = f" [{ref} pin {pin}]" if ref else ""
            print(f"  [{sev:7s}] {vtyp or msg}{loc}")
            if vtyp and msg and vtyp != msg:
                print(f"           {msg}")

    if fixed_count > 0:
        fixed_path = SCH_PATH.with_stem(SCH_PATH.stem + "_erc_fixed")
        fixed_path.write_text(updated_content, encoding="utf-8")
        print(f"\nSchéma corrigé sauvegardé : {fixed_path.name}")

    print()
    if erc_clean:
        print("OK — ERC CLEAN, prêt pour l'étape PCB.")
    else:
        print(f"KO — {len(errors)} erreur(s) bloquante(s) à corriger avant PCB.")
        sys.exit(1)


if __name__ == "__main__":
    main()
