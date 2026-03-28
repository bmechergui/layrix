import type { Metadata } from 'next';
import { Geist, Geist_Mono, Syne } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['700', '800'] });

export const metadata: Metadata = {
  title: { default: 'Layrix.ai — AI PCB Design Agent', template: '%s | Layrix' },
  description: 'Describe your circuit in plain English. Layrix generates a DRC-clean PCB, exports Gerbers, and orders from JLCPCB — fully autonomously.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${syne.variable}`}>
      <body className="bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
