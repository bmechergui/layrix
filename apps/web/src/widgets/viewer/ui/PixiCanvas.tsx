'use client';

// Ce fichier est importé uniquement côté client via dynamic import
import { useEffect, useRef } from 'react';
import { createPCBRenderer } from '../lib/renderer';
import type { PCBRenderer, ZoomControls } from '../lib/renderer';
import type { PCBState } from '@layrix/types';

interface PixiCanvasProps {
  pcbState: PCBState | null;
  layerVisibility: Record<string, boolean>;
  onReady?: (controls: ZoomControls) => void;
}

export function PixiCanvas({ pcbState, layerVisibility, onReady }: PixiCanvasProps) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const rendererRef    = useRef<PCBRenderer | null>(null);
  const initializedRef = useRef(false);
  const onReadyRef     = useRef(onReady);
  onReadyRef.current   = onReady;

  // Initialise PixiJS une seule fois
  useEffect(() => {
    if (initializedRef.current || !canvasRef.current) return;
    initializedRef.current = true;

    let renderer: PCBRenderer | null = null;

    void createPCBRenderer(canvasRef.current).then((r) => {
      renderer = r;
      rendererRef.current = r;
      r.render(pcbState, layerVisibility);

      // Expose zoom controls to the parent once renderer is ready
      onReadyRef.current?.({
        zoomIn:    () => r.zoomIn(),
        zoomOut:   () => r.zoomOut(),
        resetZoom: () => r.resetZoom(),
      });
    });

    return () => {
      renderer?.destroy();
      rendererRef.current = null;
      initializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render quand l'état PCB ou la visibilité des layers change
  useEffect(() => {
    rendererRef.current?.render(pcbState, layerVisibility);
  }, [pcbState, layerVisibility]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      style={{ background: '#0d0d0d' }}
    />
  );
}
