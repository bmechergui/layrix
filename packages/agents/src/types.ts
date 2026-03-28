// Types partagés pour la boucle agentique

export type PCBStatus =
  | 'INITIAL'
  | 'SCHEMA_DONE'
  | 'PLACEMENT_DONE'
  | 'ROUTING_DONE'
  | 'DRC_CLEAN'
  | 'PCB_LIVRÉ';

export interface PCBState {
  projectId: string;
  status: PCBStatus;
  iteration: number;
  netlist?: Record<string, unknown>;
  placement?: Record<string, unknown>;
  routing?: Record<string, unknown>;
  drcViolations?: DRCViolation[];
  gerberPath?: string;
}

export interface DRCViolation {
  id: string;
  severity: 'error' | 'warning';
  message: string;
  x_mm: number;
  y_mm: number;
  layer?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

export type AgentAction =
  | 'chat'
  | 'schema'
  | 'placement'
  | 'routing'
  | 'drc'
  | 'export'
  | 'footprint'
  | 'view3d'
  | 'simulation';

export const CREDIT_COSTS: Record<AgentAction, number> = {
  chat: 0.5,
  schema: 2,
  placement: 2,
  routing: 3,
  drc: 1,
  export: 1,
  footprint: 3,
  view3d: 1,
  simulation: 3,
};
