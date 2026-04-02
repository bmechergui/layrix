import Image from 'next/image';

interface LayrixLogoProps {
  /** 'full' = logo complet | 'icon' = icône seule */
  variant?: 'full' | 'icon';
  height?: number;
  className?: string;
}

export function LayrixLogo({ variant = 'full', height = 32, className = '' }: LayrixLogoProps) {
  if (variant === 'icon') {
    return (
      <Image
        src="/icone.svg"
        alt="Layrix"
        width={height}
        height={height}
        className={`object-contain ${className}`}
        priority
      />
    );
  }

  return (
    <Image
      src="/logo.svg"
      alt="Layrix"
      width={Math.round(height * 3.5)}
      height={height}
      className={`object-contain ${className}`}
      priority
    />
  );
}
