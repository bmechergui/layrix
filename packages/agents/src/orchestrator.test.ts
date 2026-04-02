import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator, MAX_ITERATIONS } from './orchestrator';

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Helper: build a fake async iterable stream from events
function mockStream(events: unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) yield event;
    },
  };
}

// Minimal stream: one text block then end_turn
function simpleTextStream(text: string) {
  return mockStream([
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  ]);
}

beforeEach(() => {
  mockCreate.mockReset();
  process.env['ANTHROPIC_API_KEY'] = 'test-key';
});

describe('runOrchestrator', () => {
  it('emits text delta events for a simple response', async () => {
    mockCreate.mockReturnValue(simpleTextStream('Hello world'));

    const events = [];
    for await (const e of runOrchestrator({
      userMessage: 'Design a simple LED circuit',
      projectId: 'proj-1',
      history: [],
    })) {
      events.push(e);
    }

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents.length).toBeGreaterThan(0);
    const fullText = textEvents.map((e) => (e as { type: 'text'; delta: string }).delta).join('');
    expect(fullText).toBe('Hello world');
  });

  it('emits done event at the end', async () => {
    mockCreate.mockReturnValue(simpleTextStream('Response'));

    const events = [];
    for await (const e of runOrchestrator({
      userMessage: 'Test',
      projectId: 'proj-1',
      history: [],
    })) {
      events.push(e);
    }

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent as { type: 'done'; fullText: string }).fullText).toBe('Response');
  });

  it('emits error event when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY'];

    const events = [];
    for await (const e of runOrchestrator({
      userMessage: 'Test',
      projectId: 'proj-1',
      history: [],
    })) {
      events.push(e);
    }

    expect(events[0]?.type).toBe('error');
  });

  it('respects MAX_ITERATIONS limit', () => {
    expect(MAX_ITERATIONS).toBe(15);
  });

  it('emits iteration count event', async () => {
    mockCreate.mockReturnValue(simpleTextStream('Hi'));

    const events = [];
    for await (const e of runOrchestrator({
      userMessage: 'Test',
      projectId: 'proj-1',
      history: [],
    })) {
      events.push(e);
    }

    const iterEvent = events.find((e) => e.type === 'iteration');
    expect(iterEvent).toBeDefined();
    expect((iterEvent as { type: 'iteration'; count: number }).count).toBe(1);
  });

  it('emits pcb_state event after tool result from placement agent', async () => {
    // Stream: tool_use call → stop with tool_use → then end_turn after tool result
    const toolStream = mockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Placing...' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tool-1', name: 'call_agent_placement' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"schema_json":"{}"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]);

    const endStream = simpleTextStream('Done');
    mockCreate.mockReturnValueOnce(toolStream).mockReturnValueOnce(endStream);

    const events = [];
    for await (const e of runOrchestrator({
      userMessage: 'Place components',
      projectId: 'proj-1',
      history: [],
    })) {
      events.push(e);
    }

    const pcbStateEvent = events.find((e) => e.type === 'pcb_state');
    expect(pcbStateEvent).toBeDefined();
    expect((pcbStateEvent as { projectId: string }).projectId).toBe('proj-1');
  });

  it('passes history messages to the API', async () => {
    mockCreate.mockReturnValue(simpleTextStream('Reply'));

    for await (const _ of runOrchestrator({
      userMessage: 'Follow-up',
      projectId: 'proj-1',
      history: [{ role: 'user', content: 'First message' }, { role: 'assistant', content: 'First reply' }],
    })) { /* consume */ }

    const callArgs = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> } | undefined;
    // history (2) + new user message (1) = at least 3
    expect(callArgs?.messages.length).toBeGreaterThanOrEqual(3);
    // History messages are included
    expect(callArgs?.messages[0]?.content).toBe('First message');
    expect(callArgs?.messages[1]?.content).toBe('First reply');
  });
});
