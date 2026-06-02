# Dépendances vendorées — KiCad Service

Ces deux librairies sont installées localement en mode éditable (`pip install -e .`).
Elles sont **ignorées par git** mais leurs versions sont trackées ici.

## circuit_synth

- **Source :** https://github.com/circuit-synth/circuit-synth
- **Version locale :** 3.12 (0.12.1 selon git commit)
- **Chemin :** `services/kicad/circuit_synth/`
- **Install Docker :** `pip3 install --no-cache-dir ./circuit_synth`
- **Patches Layrix :**
  - `src/circuit_synth/kicad/sch_gen/circuit_loader.py` — fix pin_identifier vide
    → `_parse_circuit`: exclure `""` et `None` (pas seulement `"~"`) du test de nom de pin.
    Sans ce fix: Device:R et Device:C → pin_identifier="" → find_pin retourne toujours pin 1
    → VCC_5V ET DHT_DATA tous deux au même endroit (pin1) → R1.pin2=unconnected.
    Ligne ~286: `if "name" in pin_data and pin_data["name"] not in ("~", "", None):`
  - `src/circuit_synth/kicad/schematic/geometry_utils.py` — fallback index-based
    → `get_actual_pin_position`: si pin.number absent, utiliser l'index (défensif).

## kicad_tools

- **Source :** https://github.com/rjwalters/kicad-tools
- **Version locale :** 0.13.0
- **Chemin :** `services/kicad/kicad_tools/`
- **Install Docker :** `pip3 install --no-cache-dir "/tmp/kicad_tools[placement,drc,geometry]"`
- **Patches Layrix :**
  - `src/kicad_tools/cli/route_cmd.py` — fix fsync sur handle read-only (Windows OSError [Errno 9])
    → `_write_routed_pcb`: ouverture en mode write pour fsync, best-effort
  - `src/kicad_tools/cli/optimize_placement_cmd.py` — **fix pad-collapse (2026-06-02)**
    → `_write_placements_to_pcb`: réécrit pour utiliser le modèle PCB
    (`PCB.load` + `update_footprint_position(ref, x, y, rotation)` + `pcb.save`)
    au lieu d'un remplacement texte des lignes `(at …)`.
    Sans ce fix : la regex matchait **toutes** les lignes `(at …)` d'un footprint
    (y compris les pads) et, une fois la référence connue, les remplaçait toutes
    par la position du footprint → **tous les pads empilés sur un seul point**
    → PCB non routable (`No path found`, routage 0%). Mirror du chemin `place_unplaced`.
    Voir test : `services/kicad/tests/test_placement_pad_integrity.py`.

## Mise à jour

Pour mettre à jour une librairie :
```bash
# circuit_synth
cd services/kicad/circuit_synth && git pull && pip install -e .

# kicad_tools
cd services/kicad/kicad_tools && git pull && pip install -e .[placement,drc,geometry]
```

Puis mettre à jour ce fichier avec la nouvelle version.
