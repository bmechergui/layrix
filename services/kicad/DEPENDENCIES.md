# Dépendances vendorées — KiCad Service

Ces deux librairies sont installées localement en mode éditable (`pip install -e .`).
Elles sont **ignorées par git** mais leurs versions sont trackées ici.

## circuit_synth

- **Source :** https://github.com/circuit-synth/circuit-synth
- **Version locale :** 3.12 (0.12.1 selon git commit)
- **Chemin :** `services/kicad/circuit_synth/`
- **Install Docker :** `pip3 install --no-cache-dir ./circuit_synth`
- **Patches Layrix :** aucun (bug labels hiérarchiques → workaround via kicad_net_content dans generate_pcb)

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
