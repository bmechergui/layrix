import Image from 'next/image';

interface LayrixLogoProps {
  /** Height in pixels — width scales automatically */
  height?: number;
  className?: string;
}

export function LayrixLogo({ height = 32, className = '' }: LayrixLogoProps) {
  return (
    <Image
      src="/logo.jpg"
      alt="Layrix"
      width={Math.round(height * 3.43)}
      height={height}
      className={`object-contain mix-blend-screen ${className}`}
      priority
    />
  );
}
