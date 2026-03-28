import { create } from 'zustand';
import type { Project, Message, Credits, PCBStatus } from '@/lib/mock-data';
import { MOCK_PROJECTS, MOCK_MESSAGES, MOCK_CREDITS } from '@/lib/mock-data';

interface AppState {
  // Projets
  projects: Project[];
  selectedProjectId: string | null;

  // Messages du chat (par projet)
  messagesByProject: Record<string, Message[]>;

  // Crédits
  credits: Credits;

  // Agent
  isAgentRunning: boolean;
  agentStep: 'SCHEMA' | 'PLACEMENT' | 'ROUTING' | 'DRC' | 'EXPORT' | null;

  // Actions
  setSelectedProjectId: (id: string | null) => void;
  addProject: (project: Project) => void;
  updateProjectStatus: (id: string, status: PCBStatus) => void;
  addMessage: (projectId: string, message: Message) => void;
  setAgentRunning: (running: boolean, step?: AppState['agentStep']) => void;
  deductCredits: (amount: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: MOCK_PROJECTS,
  selectedProjectId: null,
  messagesByProject: { '1': MOCK_MESSAGES },
  credits: MOCK_CREDITS,
  isAgentRunning: false,
  agentStep: null,

  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),

  updateProjectStatus: (id, status) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, status, updated_at: new Date().toISOString() } : p
      ),
    })),

  addMessage: (projectId, message) =>
    set((state) => ({
      messagesByProject: {
        ...state.messagesByProject,
        [projectId]: [...(state.messagesByProject[projectId] ?? []), message],
      },
    })),

  setAgentRunning: (running, step = null) =>
    set({ isAgentRunning: running, agentStep: running ? step : null }),

  deductCredits: (amount) =>
    set((state) => ({
      credits: { ...state.credits, balance: Math.max(0, state.credits.balance - amount) },
    })),
}));
