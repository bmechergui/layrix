'use client';

import { Sparkles } from 'lucide-react';
import type { Project } from '@layrix/types';

export function IdeaView({ project }: { project: Project }) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Sparkles size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Idea</h2>
            <p className="text-xs text-muted-foreground">No design generated yet</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-[#111111] p-6 mb-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">{project.name}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {project.description || (
              <span className="italic opacity-60">No description.</span>
            )}
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-[#0a0a0a]/40 p-5 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask the agent in the chat to design your PCB.
            <br />
            The schema, placement, routing, and DRC will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
