'use client';

import { use, useState, useRef, useEffect } from 'react';
import { ChatPanel } from '@/features/dashboard/ui/ChatPanel';
import { ViewerPanel } from '@/widgets/viewer';
import { AgentProgressBar } from '@/features/dashboard/ui/AgentProgressBar';
import { useAppStore } from '@/shared/store/app-store';
import { Pencil } from 'lucide-react';

function ProjectTitle({ projectId, initialName }: { projectId: string; initialName: string }) {
  const updateProjectName = useAppStore((s) => s.updateProjectName);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialName);
  }, [initialName]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initialName) {
      setValue(initialName);
      setEditing(false);
      return;
    }
    updateProjectName(projectId, trimmed);
    setEditing(false);
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { void commit(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { void commit(); }
          if (e.key === 'Escape') { setValue(initialName); setEditing(false); }
        }}
        maxLength={100}
        className="text-sm font-semibold bg-transparent border-b border-primary outline-none text-foreground w-full max-w-[240px]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[240px]"
      title="Click to rename"
    >
      <span className="truncate">{value}</span>
      <Pencil size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const project = useAppStore((s) => s.projects.find((p) => p.id === id));
  const agentStep = useAppStore((s) => s.agentStep);

  if (!project) return <div className="text-muted-foreground p-6">Project not found</div>;

  return (
    <div className="flex flex-col -m-6 overflow-hidden" style={{ height: 'calc(100vh - var(--header-height, 57px))' }}>
      <AgentProgressBar step={agentStep} />
      <div className="flex flex-1 overflow-hidden">
        {/* Chat — 380px */}
        <div className="w-[380px] border-r border-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <ProjectTitle projectId={id} initialName={project.name} />
          </div>
          <ChatPanel projectId={id} />
        </div>
        {/* Viewer — remaining space */}
        <div className="flex-1 overflow-hidden">
          <ViewerPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}
