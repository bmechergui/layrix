'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { loadKiCanvas } from '../lib/kicanvas-loader';

interface KiCanvasViewerProps {
  /** Public or signed URL pointing to a `.kicad_sch` or `.kicad_pcb` file. */
  src: string;
  /** Controls overlay variant: 'none' | 'basic' | 'full'. Default: 'basic'. */
  controls?: 'none' | 'basic' | 'full';
}

export function KiCanvasViewer({ src, controls = 'basic' }: KiCanvasViewerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    loadKiCanvas()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'KiCanvas load failed');
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 bg-[#080808] overflow-hidden"
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          Loading KiCanvas…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <div className="flex flex-col items-center gap-2 text-destructive">
            <AlertCircle size={18} />
            <span className="text-xs">
              Could not load the native KiCad viewer. {errorMessage ?? ''}
            </span>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <kicanvas-embed
          src={src}
          controls={controls}
          theme="kicad"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      )}
    </div>
  );
}
