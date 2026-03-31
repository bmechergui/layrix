import Link from 'next/link';
import { LayrixLogo } from '@/shared/ui/layrix-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8">
        <LayrixLogo height={28} />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
