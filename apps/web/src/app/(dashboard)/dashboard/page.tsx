'use client';

import { ProjectsGrid } from '@/features/dashboard/ui/ProjectsGrid';
import { NewProjectDialog } from '@/features/dashboard/ui/NewProjectDialog';

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            From idea to manufacturable PCB, autonomously.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      <ProjectsGrid />
    </div>
  );
}
