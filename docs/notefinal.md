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

## Template pour la prochaine décision

```
### [DATE] — [Sujet]

**Décision :**

**Pourquoi :**

**Écarté :**

**Fichiers concernés :**
```
