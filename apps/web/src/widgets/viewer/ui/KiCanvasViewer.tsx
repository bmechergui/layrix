'use client';

import Script from 'next/script';

interface KiCanvasViewerProps {
  /** Supabase Storage signed URL → .kicad_sch or .kicad_pcb */
  src: string | null;
  type: 'schematic' | 'board';
  className?: string;
}

const KICANVAS_CDN = 'https://kicanvas.org/kicanvas/kicanvas.js';

export function KiCanvasViewer({ src, type, className }: KiCanvasViewerProps) {
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-[#090909] ${className ?? ''}`}
      >
        <p className="text-[#3D3D3D] text-xs font-mono">
          {type === 'schematic' ? 'Schéma KiCad non encore généré' : 'PCB KiCad non encore généré'}
        </p>
      </div>
    );
  }

  return (
    <>
      <Script src={KICANVAS_CDN} strategy="afterInteractive" />
      <kicanvas-embed
        src={src}
        controls="basic"
        theme="dark"
        className={`block w-full h-full ${className ?? ''}`}
      />
    </>
  );
}
