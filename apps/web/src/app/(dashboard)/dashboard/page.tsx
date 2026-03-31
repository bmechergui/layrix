'use client';

import { useEffect } from 'react';
import { Plus, CircuitBoard } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { ProjectCard } from '@/features/dashboard/ui/ProjectCard';
import { ProjectCardSkeleton } from '@/shared/ui/skeleton';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { useAppStore } from '@/shared/store/app-store';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <CircuitBoard size={28} className="text-primary/60" />
      </div>
      <div>
        <p className="font-display font-bold text-foreground mb-1">No projects yet</p>
        <p className="text-sm text-muted-foreground">Create your first PCB to get started.</p>
      </div>
      <Button className="gap-2 mt-2">
        <Plus size={14} />
        New PCB
      </Button>
    </div>
  );
}

function ProjectsGrid() {
  const projects = useAppStore((s) => s.projects);
  const loading = useAppStore((s) => s.projectsLoading);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <ProjectCardSkeleton key={i} />)}
      </div>
    );
  }

  if (projects.length === 0) return <EmptyState />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const projects = useAppStore((s) => s.projects);
  const fetchProjects = useAppStore((s) => s.fetchProjects);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">My Projects</h1>
          <p className="text-muted-foreground text-sm mt-0.5 font-mono">
            <span className="text-primary">{projects.length}</span> PCBs
          </p>
        </div>
        <Button className="gap-2 glow-cyan-sm">
          <Plus size={16} />
          New PCB
        </Button>
      </div>

      <ErrorBoundary>
        <ProjectsGrid />
      </ErrorBoundary>
    </div>
  );
}

