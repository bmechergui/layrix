'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary:
          'bg-cyan-400 text-bg-base font-semibold hover:bg-cyan-500 active:bg-cyan-600 shadow-glow-cyan-sm hover:shadow-glow-cyan',
        secondary:
          'bg-bg-2 text-text-primary border border-border hover:border-border-hi hover:bg-bg-3',
        ghost:
          'text-text-secondary hover:text-text-primary hover:bg-bg-2',
        copper:
          'bg-copper-400 text-bg-base font-semibold hover:bg-copper-500 active:bg-copper-500',
        destructive:
          'bg-error/10 text-error border border-error/30 hover:bg-error/20',
        outline:
          'border border-cyan-400 text-cyan-400 hover:bg-cyan-400/10',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
