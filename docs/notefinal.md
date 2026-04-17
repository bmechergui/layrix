# Layrix — Pipeline Validation (step by step)

> Ce document est mis à jour après chaque step validé ensemble.
> Dernière mise à jour : 2026-04-17

---

## Légende

| Icône | Statut |
|-------|--------|
| ✅ | Validé ensemble |
| 🔲 | À implémenter |
| ⚠️ | Stub / partiel |
| 🔄 | En cours |

---

## Vue d'ensemble du pipeline

```
User Prompt
    ↓
[STEP 1]  Design Agent       → design.json              🔲 À faire
    ↓
[STEP 2]  Schematic Agent    → schematic.json            ✅ Validé
              ↓ Circuit-Synth engine
          .kicad_sch + .kicad_pcb initial                ✅ Validé
              ↓ KiCanvas viewer
    ↓
[STEP 3]  Footprint Agent    → footprints.json           ⚠️ Stub
    ↓
[STEP 4]  Placement Agent    → .kicad_pcb placé          ✅ Validé
              ↓ pcbnew /place/auto
    ↓
[STEP 5]  Routing Agent      → .kicad_pcb routé          🔲 À faire
              ↓ Freerouting /route/auto
    ↓
[STEP 6]  DRC Agent          → violations / DRC_CLEAN    ⚠️ Stub
              ↓ pcbnew DRC
    ↓
[STEP 7]  Export             → Gerbers + BOM + STEP      ⚠️ Stub
    ↓
User "OUI JE CONFIRME"
    ↓
JLCPCB Order                                             🔲 Phase 4
```

---

## STEP 1 — Design Agent

**Statut : 🔲 À implémenter**

### Rôle
Premier agent du pipeline. Analyse le prompt utilisateur et produit
`design.json` — le contexte structuré que tous les agents suivants utilisent.

### Responsable
Agent IA Haiku 4.5 — tool `call_agent_design` (manquant dans `tools.ts`)

### Input
```
Prompt utilisateur : "régulateur 5V LM7805 avec condensateurs"
```

### Output — `design.json`
```json
{
  "type": "power_supply",
  "blocks": ["Power", "Decoupling"],
  "layers": 2,
  "rules": {
    "trace_width_mm": 0.3,
    "clearance_mm": 0.2,
    "via_drill_mm": 0.3,
    "min_text_mm": 1.0
  },
  "constraints": {
    "output_voltage": 5,
    "max_current_A": 1.5,
    "max_board_mm": [50, 50]
  }
}
```

### Fichiers à modifier
- `packages/agents/src/tools.ts` — ajouter `call_agent_design` dans `PCB_TOOLS` + `executeToolStub`
- `packages/agents/src/types.ts` — ajouter interface `DesignJson`

### Critère de validation
```
curl POST /api/agent/stream
  → SSE event { type: 'tool_call', tool: 'call_agent_design' }
  → SSE event { type: 'tool_result', summary: 'power_supply, 2 layers, ...' }
  → SSE event { type: 'tool_call', tool: 'call_agent_schema' }  ← APRÈS design
```

---

## STEP 2 — Schematic Agent + Circuit-Synth

**Statut : ✅ Validé**

### Rôle
Génère les composants + nets à partir du `design.json`.
Circuit-Synth (Python) écrit le `.kicad_sch` et `.kicad_pcb` initial.
KiCanvas affiche le schéma en temps réel.

### Responsable
- Agent IA Haiku 4.5 → `generateSchemaWithHaiku()` (`tools.ts`)
- Engine Python : `POST /circuit-synth/generate` (`services/kicad/`)

### Input
```json
{ "user_description": "...", "design": { "type": "power_supply", ... } }
```

### Output — `schematic.json`
```json
{
  "components": [
    { "ref": "U1", "value": "LM7805", "symbol": "Regulator_Linear:L7805", "footprint": "TO-220" },
    { "ref": "C1", "value": "330nF",  "symbol": "Device:C", "footprint": "0603" },
    { "ref": "C2", "value": "100nF",  "symbol": "Device:C", "footprint": "0603" },
    { "ref": "J1", "value": "VIN_CONN", "symbol": "Connector_Generic:Conn_01x02", "footprint": "Conn_2" },
    { "ref": "J2", "value": "VOUT_5V",  "symbol": "Connector_Generic:Conn_01x02", "footprint": "Conn_2" }
  ],
  "nets": ["GND", "VIN", "VOUT"],
  "connections": [
    { "name": "VIN",  "pins": [{"ref":"J1","pin":1}, {"ref":"U1","pin":"IN"},  {"ref":"C1","pin":1}] },
    { "name": "VOUT", "pins": [{"ref":"U1","pin":"OUT"}, {"ref":"C2","pin":1}, {"ref":"J2","pin":1}] },
    { "name": "GND",  "pins": [{"ref":"J1","pin":2}, {"ref":"U1","pin":"GND"}, {"ref":"C1","pin":2},
                                {"ref":"C2","pin":2}, {"ref":"J2","pin":2}] }
  ]
}
```

### Validations réalisées
- ✅ KiCanvas affiche schéma LM7805 avec labels nets (VIN, VOUT, GND)
- ✅ Composants à l'intérieur du cadre KiCad (margin_side=38mm)
- ✅ Bloc titre masqué automatiquement
- ✅ Testé sur LM7805 / NE555 / ESP32

### PCBStatus après step
```
SCHEMA_DONE
```

---

## STEP 3 — Footprint Agent

**Statut : ⚠️ Stub — recherche LCSC non implémentée**

### Rôle
Pour chaque composant, trouve un footprint KiCad valide + numéro LCSC
disponible chez JLCPCB.

### Responsable
Agent IA Haiku 4.5 — tool `call_agent_footprint`
Cascade 8 étapes : LCSC → SnapMagic → Octopart → pgvector RAG → GitHub → AI → Manuel

### Stub actuel (`tools.ts`)
```typescript
case 'call_agent_footprint':
  return {
    footprint_name: `${part_number}_footprint`,  // hardcodé !
    source: 'lcsc',
  };
```

### Output cible
```json
{
  "footprints": {
    "U1": { "kicad": "TO-220", "lcsc": "C14353", "available_jlc": true },
    "C1": { "kicad": "C_0603", "lcsc": "C1525",  "available_jlc": true }
  }
}
```

### Critère de validation
```
LCSC API → retourne C14353 pour LM7805
→ available_jlc: true vérifié
→ footprint KiCad valide (pcbnew peut le charger)
```

---

## STEP 4 — Placement Agent

**Statut : ✅ Validé**

### Rôle
Calcule les coordonnées (x, y, rotation) de chaque composant sur le PCB.
pcbnew applique le placement via `SetPosition()` + `SetOrientation()`.

### Responsable
- Agent IA Haiku 4.5 → `call_agent_placement`
- Engine Python : `POST /place/auto` (`services/kicad/routers/placement.py`)

### Output
```json
{
  "placements": [
    { "ref": "U1", "x": 15, "y": 20, "rot": 0 },
    { "ref": "C1", "x": 25, "y": 10, "rot": 0 },
    { "ref": "C2", "x": 25, "y": 30, "rot": 0 }
  ]
}
```

### Validations réalisées
- ✅ pcbnew place les composants aux coordonnées calculées
- ✅ `.kicad_pcb` placé généré correctement
- ✅ FastAPI `POST /place/auto` HTTP 200
- ✅ CI KiCad Docker Build vert (PR #31)

### PCBStatus après step
```
PLACEMENT_DONE
```

---

## STEP 5 — Routing Agent

**Statut : 🔲 À implémenter**

### Rôle
Route automatiquement les pistes entre composants placés.
Freerouting (Java JAR headless) génère les traces cuivre.

### Responsable
- Agent IA Haiku 4.5 → `call_agent_routing`
- Engine Java : `POST /route/auto` (`services/kicad/routers/routing.py`)

### Pipeline engine
```
.kicad_pcb placé
    ↓ pcbnew.ExportSpecctraDSN()  → circuit.dsn
    ↓ java -jar freerouting.jar -de circuit.dsn -do circuit.ses -mp 8
    ↓ pcbnew.ImportSpecctraSES()  → .kicad_pcb avec pistes
```

### Output
```json
{
  "stats": {
    "track_count": 12,
    "via_count": 3,
    "routed_percent": 100,
    "duration_ms": 4200
  }
}
```

### Fichiers à créer
- `services/kicad/routers/routing.py`
- `services/kicad/tools/routing.py`
- `services/kicad/tests/test_routing.py`

### Critère de validation
```
curl POST /route/auto (test-lm7805.kicad_pcb placé)
→ HTTP 200
→ stats.track_count >= 1
→ KiCanvas onglet PCB → pistes cuivre visibles
```

### PCBStatus après step
```
ROUTING_DONE
```

---

## STEP 6 — DRC Agent

**Statut : ⚠️ Stub — toujours retourne DRC_CLEAN**

### Rôle
Vérifie le PCB routé contre les design rules (clearance, trace width, vias).
Boucle max 3× avec auto-fix si violations.

### Responsable
- Agent IA Haiku 4.5 → `call_agent_drc`
- Engine Python : `POST /drc` (`services/kicad/routers/drc.py` — à créer)

### Boucle DRC
```
pcbnew DRC → violations?
   ├─ 0    → PCBStatus = DRC_CLEAN → Step 7
   └─ > 0  → Agent choisit fix → loop back Step 4 ou 5
              iter++ ; si iter > 3 → abort + user feedback
```

### Fichiers à créer (Phase 3 Step 3)
- `services/kicad/routers/drc.py`
- `services/kicad/tools/drc.py`

### PCBStatus après step
```
DRC_CLEAN
```

---

## STEP 7 — Export

**Statut : ⚠️ Stub — Gerbers non générés**

### Rôle
Génère les fichiers de fabrication pour JLCPCB :
- Gerbers (F.Cu, B.Cu, F.SilkS, B.SilkS, F.Mask, B.Mask, Edge.Cuts)
- BOM CSV avec numéros LCSC
- Fichier STEP 3D

### Responsable
Engine déterministe (pas d'agent IA) : `POST /export`

### Output
```
gerbers/
  ├── F.Cu.gtl
  ├── B.Cu.gbl
  ├── F.SilkS.gto
  ├── B.SilkS.gbo
  ├── F.Mask.gts
  ├── B.Mask.gbs
  └── Edge.Cuts.gm1
bom.csv      (ref, value, lcsc)
board.step   (3D model)
```

### PCBStatus après step
```
PCB_LIVRÉ (après confirmation user "OUI JE CONFIRME")
```

---

## Prochaine étape à valider

**→ STEP 1 — Design Agent (`call_agent_design`)**

Confirme pour que j'implémente + update ce doc après validation.
