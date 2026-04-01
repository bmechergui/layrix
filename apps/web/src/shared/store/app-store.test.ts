import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './app-store';

// Mock Supabase browser client
vi.mock('@/shared/lib/supabase-browser', () => ({
  createSupabaseBrowserClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { full_name: 'Test User', avatar_url: null },
          },
        },
        error: null,
      }),
    },
  })),
}));

// Reset store state before each test
beforeEach(() => {
  useAppStore.setState({
    user: null,
    projects: [],
    projectsLoading: false,
    selectedProjectId: null,
    messagesByProject: {},
    credits: null,
    isAgentRunning: false,
    agentStep: null,
    pcbStateByProject: {},
  });
});

describe('app-store — credits', () => {
  it('deductCredits reduces balance correctly', () => {
    useAppStore.setState({ credits: { balance: 10, plan: 'free', daily_limit: 5 } });
    useAppStore.getState().deductCredits(0.5);
    expect(useAppStore.getState().credits?.balance).toBe(9.5);
  });

  it('deductCredits clamps to 0 — never goes negative', () => {
    useAppStore.setState({ credits: { balance: 0.3, plan: 'free', daily_limit: 5 } });
    useAppStore.getState().deductCredits(1);
    expect(useAppStore.getState().credits?.balance).toBe(0);
  });

  it('deductCredits is a no-op when credits is null', () => {
    useAppStore.setState({ credits: null });
    useAppStore.getState().deductCredits(1);
    expect(useAppStore.getState().credits).toBeNull();
  });
});

describe('app-store — projects', () => {
  it('addProject prepends to the list', () => {
    const existing = { id: 'old', name: 'Old', description: '', status: 'INITIAL' as const, iteration_count: 0, created_at: '', updated_at: '' };
    const newProject = { id: 'new', name: 'New', description: '', status: 'INITIAL' as const, iteration_count: 0, created_at: '', updated_at: '' };
    useAppStore.setState({ projects: [existing] });
    useAppStore.getState().addProject(newProject);
    expect(useAppStore.getState().projects[0]?.id).toBe('new');
    expect(useAppStore.getState().projects).toHaveLength(2);
  });

  it('updateProjectStatus updates only the target project', () => {
    useAppStore.setState({
      projects: [
        { id: 'p1', name: 'P1', description: '', status: 'INITIAL', iteration_count: 0, created_at: '', updated_at: '' },
        { id: 'p2', name: 'P2', description: '', status: 'INITIAL', iteration_count: 0, created_at: '', updated_at: '' },
      ],
    });
    useAppStore.getState().updateProjectStatus('p1', 'SCHEMA_DONE');
    const state = useAppStore.getState();
    expect(state.projects.find((p) => p.id === 'p1')?.status).toBe('SCHEMA_DONE');
    expect(state.projects.find((p) => p.id === 'p2')?.status).toBe('INITIAL');
  });
});

describe('app-store — messages', () => {
  it('addMessage creates new array for new project', () => {
    const msg = { id: '1', role: 'user' as const, content: 'Hello', timestamp: '10:00' };
    useAppStore.getState().addMessage('proj-1', msg);
    expect(useAppStore.getState().messagesByProject['proj-1']).toHaveLength(1);
  });

  it('addMessage appends to existing project messages', () => {
    const msg1 = { id: '1', role: 'user' as const, content: 'Hi', timestamp: '10:00' };
    const msg2 = { id: '2', role: 'assistant' as const, content: 'Hey', timestamp: '10:01' };
    useAppStore.getState().addMessage('proj-1', msg1);
    useAppStore.getState().addMessage('proj-1', msg2);
    expect(useAppStore.getState().messagesByProject['proj-1']).toHaveLength(2);
  });

  it('addMessage is immutable — different projects do not share state', () => {
    const msg = { id: '1', role: 'user' as const, content: 'Hi', timestamp: '10:00' };
    useAppStore.getState().addMessage('proj-1', msg);
    expect(useAppStore.getState().messagesByProject['proj-2']).toBeUndefined();
  });
});

describe('app-store — agent', () => {
  it('setAgentRunning(true, step) sets isAgentRunning and agentStep', () => {
    useAppStore.getState().setAgentRunning(true, 'SCHEMA');
    expect(useAppStore.getState().isAgentRunning).toBe(true);
    expect(useAppStore.getState().agentStep).toBe('SCHEMA');
  });

  it('setAgentRunning(false) resets agentStep to null', () => {
    useAppStore.setState({ isAgentRunning: true, agentStep: 'ROUTING' });
    useAppStore.getState().setAgentRunning(false);
    expect(useAppStore.getState().isAgentRunning).toBe(false);
    expect(useAppStore.getState().agentStep).toBeNull();
  });
});

describe('app-store — pcbState', () => {
  it('setPcbState creates initial state for new project', () => {
    useAppStore.getState().setPcbState('proj-1', { status: 'SCHEMA_DONE', iteration: 1 });
    const state = useAppStore.getState().pcbStateByProject['proj-1'];
    expect(state?.status).toBe('SCHEMA_DONE');
    expect(state?.projectId).toBe('proj-1');
  });

  it('setPcbState merges — does not overwrite unrelated fields', () => {
    useAppStore.setState({
      pcbStateByProject: {
        'proj-1': { projectId: 'proj-1', status: 'SCHEMA_DONE', iteration: 1 },
      },
    });
    useAppStore.getState().setPcbState('proj-1', { status: 'PLACEMENT_DONE' });
    const state = useAppStore.getState().pcbStateByProject['proj-1'];
    expect(state?.status).toBe('PLACEMENT_DONE');
    expect(state?.iteration).toBe(1);
  });
});

describe('app-store — fetchUser', () => {
  it('fetchUser populates user from Supabase auth', async () => {
    await useAppStore.getState().fetchUser();
    const user = useAppStore.getState().user;
    expect(user?.id).toBe('user-123');
    expect(user?.email).toBe('test@example.com');
    expect(user?.full_name).toBe('Test User');
  });
});
