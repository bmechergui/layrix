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

## Mise à jour

Pour mettre à jour une librairie :
```bash
# circuit_synth
cd services/kicad/circuit_synth && git pull && pip install -e .

# kicad_tools
cd services/kicad/kicad_tools && git pull && pip install -e .[placement,drc,geometry]
```

Puis mettre à jour ce fichier avec la nouvelle version.
