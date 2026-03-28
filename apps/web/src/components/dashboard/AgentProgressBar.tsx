import { Progress } from '@/components/ui/progress';

const STEPS = ['SCHEMA', 'PLACEMENT', 'ROUTING', 'DRC', 'EXPORT'] as const;
const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  SCHEMA: 'Schema',
  PLACEMENT: 'Placement',
  ROUTING: 'Routing',
  DRC: 'DRC',
  EXPORT: 'Export',
};
type AgentStep = (typeof STEPS)[number] | null;

const STEP_INDEX: Record<NonNullable<AgentStep>, number> = {
  SCHEMA: 0,
  PLACEMENT: 1,
  ROUTING: 2,
  DRC: 3,
  EXPORT: 4,
};

interface AgentProgressBarProps {
  step: AgentStep;
}

export function AgentProgressBar({ step }: AgentProgressBarProps) {
  if (!step) return null;

  const idx = STEP_INDEX[step];
  const pct = Math.round(((idx + 1) / STEPS.length) * 100);

  return (
    <div className="px-4 py-3 border-b border-border bg-[#0d0d0d]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          Agent running —{' '}
          <span className="text-primary font-medium">{STEP_LABELS[step]}</span>
        </span>
        <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1" />
      <div className="flex justify-between mt-2">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`text-[10px] ${
              i < idx
                ? 'text-primary'
                : i === idx
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground/40'
            }`}
          >
            {STEP_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
