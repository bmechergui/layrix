'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, Cpu } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import type { Project } from '@/lib/mock-data';

interface ProjectCardProps {
  project: Project;
}

export const ProjectCard = React.memo(function ProjectCard({ project }: ProjectCardProps) {
  const date = new Date(project.updated_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Link href={`/dashboard/projects/${project.id}`}>
      <Card className="group hover:border-primary/50 transition-all duration-200 cursor-pointer h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
              {project.name}
            </CardTitle>
            <StatusBadge status={project.status} />
          </div>
          {project.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {project.description}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Cpu size={12} />
              iter {project.iteration_count}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={12} />
              {date}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
});
