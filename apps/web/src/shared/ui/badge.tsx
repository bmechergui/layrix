import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary border border-primary/20',
        secondary: 'bg-secondary text-muted-foreground border border-border',
        success: 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20',
        warning: 'bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20',
        destructive: 'bg-destructive/10 text-destructive border border-destructive/20',
        copper: 'bg-accent/10 text-accent border border-accent/20',
        outline: 'border border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
