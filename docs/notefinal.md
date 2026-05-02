# Layrix — Journal de Décisions

> Chaque décision prise ensemble est documentée ici : ce qu'on a décidé, pourquoi, et ce qu'on a écarté.
> Mis à jour au fil des conversations.

---

## Format

```
### [DATE] — [Sujet de la décision]
**Décision :** ce qu'on a choisi
**Pourquoi :** la raison technique ou business
**Écarté :** ce qu'on n'a pas retenu et pourquoi
```

---

## 2026-05-02

### Renommer `call_agent_design` → `call_agent_spec`

**Décision :** Le premier agent du pipeline s'appelle désormais `call_agent_spec` (Spec Parser).

**Pourquoi :** Le nom `call_agent_design` créait une confusion avec `call_agent_schema` (qui génère le schéma électronique). "Design" en anglais peut vouloir dire "concevoir" ou "schéma" — ambigu. "Spec Parser" est le terme exact du domaine EDA : il parse la description utilisateur et produit une spécification structurée (`DesignJson`) que les agents suivants consomment.

**Écarté :** `call_agent_analyze`, `call_agent_parse` — moins précis sur le rôle.

**Fichiers modifiés :** `tools.ts`, `prompts.ts`, `orchestrator.ts`, `types/index.ts`, `app-store.ts`, `AgentProgressBar.tsx`, `ViewerPanel.tsx`

---

### Circuit-Synth génère les deux fichiers KiCad

**Décision :** Un seul appel à Circuit-Synth retourne `.kicad_sch` ET `.kicad_pcb` simultanément.

**Pourquoi :** Le `.kicad_sch` contient le schéma électronique (symboles, fils, netliste). Le `.kicad_pcb` contient les footprints placés sur le board (grille TS pour Phase 2, pcbnew réel pour Phase 3). Les deux sont nécessaires pour KiCanvas. Les générer ensemble évite un aller-retour API supplémentaire.

**Écarté :** Générer `.kicad_sch` d'abord, puis `.kicad_pcb` séparément — trop de state à maintenir entre les deux appels.

---

### Le placement Phase 2 est un stub grille TypeScript

**Décision :** En Phase 2, `call_agent_placement` appelle `runPCBEngine()` (TS inline) qui place les composants en grille régulière via `autoLayout()`.

**Pourquoi :** Suffisant pour afficher quelque chose dans KiCanvas. L'objectif Phase 2 était le viewer fonctionnel, pas la qualité du placement. Cela permettait de livrer sans dépendre du service FastAPI.

**Écarté :** Appeler directement `POST /place/auto` en Phase 2 — le service FastAPI n'était pas encore stable, et pcbnew n'était pas installé en CI.

**Phase 3 :** `call_agent_placement` appellera `POST /place/auto` → pcbnew `SetPosition()` réel.

---

### FastAPI placement existe mais n'est pas encore branché

**Décision :** `services/kicad/tools/placement.py` est implémenté avec pcbnew (`place_components` + `auto_place`) mais l'agent ne l'appelle pas encore.

**Pourquoi :** Le router FastAPI était prêt avant que l'agent soit câblé. La Phase 3 consistera précisément à brancher `tools.ts:call_agent_placement` sur `POST /place/auto`.

---

### `@anthropic-ai/sdk` mis à jour 0.28.0 → 0.92.0

**Décision :** Upgrade vers la version 0.92.0 (latest au 2026-05-02).

**Pourquoi :** La version 0.28.0 avait 64 versions de retard. Le SDK 0.92 apporte des features nécessaires pour Phase 3 (meilleure gestion du streaming, nouveaux modèles). Deux casts (`as TextBlock`, `as ToolUseBlock`) ajoutés dans `orchestrator.ts` car le SDK 0.92 a rendu `citations` et `caller` obligatoires dans ces types — champs de métadonnées qui ne sont pas dans les messages envoyés.

**Écarté :** Rester sur 0.28 — bloquant pour Phase 3, risque sécurité (dep obsolète).

---

### TSCircuit définitivement retiré

**Décision :** Suppression de `circuit-json`, `circuit-json-to-gerber`, et l'export `tscircuit-engine` de `packages/agents/package.json`.

**Pourquoi :** TSCircuit a été déprécié depuis la v0.3.0 du projet. Aucun fichier ne l'importait encore — nettoyage préventif avant Phase 3. Garder des dépendances mortes alourdit le build et crée de la confusion.

**Écarté :** Garder TSCircuit en "backup" — aucun avantage, Circuit-Synth (Python) est le moteur officiel.

---

### Architecture apps : `apps/web` (fusionné, pas `apps/landing` + `apps/dashboard`)

**Décision :** Tout le frontend est dans `apps/web` (marketing + auth + dashboard + API Routes).

**Pourquoi :** Le PLAN.md initial prévoyait 3 apps séparées. En pratique, Next.js App Router avec route groups `(marketing)`, `(auth)`, `(dashboard)` offre la même séparation logique sans la complexité d'un monorepo à 3 apps Next.js. Partage de composants, middleware auth, et types simplifié.

**Écarté :** 3 apps séparées (`apps/landing`, `apps/dashboard`, `apps/api`) — overhead Turborepo, duplication de config, builds plus lents.

---

### `tmp/` ajouté au `.gitignore`

**Décision :** Le dossier `tmp/` (screenshots, JSON de debug) n'est pas versionné.

**Pourquoi :** Contient des artefacts de développement locaux (captures KiCanvas, JSON de test). Pas de valeur dans le dépôt, change trop souvent.

---

---

## Référence technique — État actuel du système

> Section stable : mise à jour uniquement quand l'architecture change.

---

### Pipeline complet

```
Utilisateur (texte naturel)
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  ORCHESTRATEUR — Claude Sonnet 4.6                  │
│  Fichier : packages/agents/src/orchestrator.ts      │
│  Max 15 itérations · SSE streaming · MAX_TOKENS 4096│
└─────────────────────────────────────────────────────┘
        │
        │  tool_use (Anthropic SDK)
        ▼
INITIAL
  → call_agent_spec        → [contexte DesignJson]
  → call_agent_schema      → SCHEMA_DONE + .kicad_sch + .kicad_pcb
  → call_agent_placement   → PLACEMENT_DONE
  → call_agent_routing     → ROUTING_DONE
  → call_agent_drc         → DRC_CLEAN
  → call_agent_export      → PCB_LIVRÉ → JLCPCB (après "OUI JE CONFIRME")
```

---

### Agents — Modèles et rôles

| Agent | Tool name | Modèle | Rôle | Output |
|-------|-----------|--------|------|--------|
| Spec Parser | `call_agent_spec` | Haiku 4.5 | Parse la description → contexte structuré | `DesignJson` |
| Schematic | `call_agent_schema` | Haiku 4.5 | Génère le schéma électronique + netlist | `SchemaJson` + `.kicad_sch` + `.kicad_pcb` |
| Footprint | `call_agent_footprint` | Haiku 4.5 | Trouve le footprint KiCad (LCSC/SnapMagic/Octopart) | `kicad_mod` |
| Placement | `call_agent_placement` | — | Positionne les composants X/Y/rotation | `.kicad_pcb` placé |
| Routing | `call_agent_routing` | — | Freerouting + ground planes | `.kicad_pcb` routé |
| DRC | `call_agent_drc` | — | Design Rule Check + corrections | rapport violations |
| Export | `call_agent_export` | — | Gerbers + BOM CSV + CPL + devis JLCPCB | `.zip` Gerbers |
| Ask | `ask_user` | — | Pose une question à l'utilisateur | — |

**Orchestrateur :** Claude Sonnet 4.6 — coordonne, décide l'ordre, écrit les réponses chat.
**Agents spécialisés :** Claude Haiku 4.5 — exécutent les tâches lourdes (génération JSON).

---

### Tools — Signatures complètes

```typescript
// 1. Spec Parser — TOUJOURS EN PREMIER
call_agent_spec({
  user_description: string   // description du circuit à concevoir
})
→ { design: DesignJson, pcb_status: 'INITIAL' }

// 2. Schematic Generator
call_agent_schema({
  user_description: string,
  complexity: 'simple' | 'medium' | 'complex',
  schema_json?: string       // JSON sérialisé SchemaJson — imposé par l'orchestrateur
})
→ { schema: SchemaJson, kicad_sch_url, kicad_pcb_url, pcb_status: 'SCHEMA_DONE' }

// 3. Footprint Finder
call_agent_footprint({
  part_number: string,       // référence LCSC, SnapMagic, ou description
  package?: string           // SOT-23, TSSOP-16, 0402…
})
→ { footprint_name, source: 'lcsc' | 'snapmagic' | 'octopart' | 'ai_generated' }

// 4. Placement
call_agent_placement({
  schema_json: string,       // SchemaJson sérialisé
  board_width_mm?: number,   // défaut: 50
  board_height_mm?: number   // défaut: 50
})
→ { placements: [{ref, x_mm, y_mm, rotation, side}], pcb_status: 'PLACEMENT_DONE' }

// 5. Routing
call_agent_routing({
  placement_json: string,    // résultat call_agent_placement
  schema_json: string,
  layers?: 2 | 4             // défaut: 2
})
→ { pcb_status: 'ROUTING_DONE' }

// 6. DRC
call_agent_drc({
  pcb_state: string,         // PCBState sérialisé
  auto_fix?: boolean         // défaut: true
})
→ { violations: DRCViolation[], pcb_status: 'DRC_CLEAN' }

// 7. Export
call_agent_export({
  pcb_state: string          // PCBState DRC-clean sérialisé
})
→ { gerber_url, bom_url, cpl_url, jlcpcb_quote, pcb_status: 'PCB_LIVRÉ' }

// 8. Ask User
ask_user({
  question: string,
  context?: string
})
→ (attend réponse utilisateur — interrompt le pipeline)
```

---

### Engines — Moteurs de génération KiCad

#### Circuit-Synth (moteur unique, Phase 2+)

```
Fichier TS  : packages/agents/src/engines/circuit-synth-engine.ts
Fichier Py  : services/kicad/routers/circuit_synth.py (1044 lignes)
Router      : POST /circuit-synth/generate
```

**Deux chemins selon disponibilité FastAPI :**

```
SchemaJson
    │
    ├── FastAPI disponible (KICAD_SERVICE_URL défini) ?
    │       │
    │       ▼  YES
    │   POST /circuit-synth/generate
    │   → Python circuit_synth lib → .kicad_sch + .kicad_pcb natifs KiCad 7
    │
    └── NO (fallback inline TS)
            │
            ▼
        generateSchematic() + generatePCB() — S-expression TypeScript
        → .kicad_sch + .kicad_pcb (moins fidèles mais fonctionnels pour KiCanvas)
```

**Output toujours :**
- `.kicad_sch` — schéma électronique (symboles, fils, netliste, power flags, title block)
- `.kicad_pcb` — board avec footprints placés (grille Phase 2, pcbnew réel Phase 3)

#### Engine Router

```
Fichier : packages/agents/src/engines/engine-router.ts
```

```typescript
selectEngine() → 'circuit-synth'  // TSCircuit retiré définitivement
runPCBEngine(schema, boardW, boardH, projectId) → PCBEngineResult
```

---

### État Phase 2 vs Phase 3

| Tool | Phase 2 (actuel) | Phase 3 (à implémenter) |
|------|-----------------|------------------------|
| `call_agent_spec` | ✅ Haiku 4.5 → `DesignJson` | — (déjà opérationnel) |
| `call_agent_schema` | ✅ Haiku 4.5 → Circuit-Synth | — (déjà opérationnel) |
| `call_agent_placement` | ⚠️ Stub grille TS `autoLayout()` | `POST /place/auto` → pcbnew |
| `call_agent_routing` | ⚠️ Stub Circuit-Synth | `POST /route` → Freerouting |
| `call_agent_drc` | ⚠️ Stub (0 violations toujours) | `POST /drc` → pcbnew DRC natif |
| `call_agent_export` | ⚠️ Stub (pas de vrais Gerbers) | `POST /export` → Gerbers réels |
| `call_agent_footprint` | ⚠️ Stub LCSC | Cascade 8 étapes (Phase 3+) |

---

## Template pour la prochaine décision

```
### [DATE] — [Sujet]

**Décision :**

**Pourquoi :**

**Écarté :**

**Fichiers concernés :**
```
