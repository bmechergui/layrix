import { Navbar } from '@/features/marketing/ui/Navbar';
import { Hero } from '@/features/marketing/ui/Hero';
import { Features } from '@/features/marketing/ui/Features';
import { HowItWorks } from '@/features/marketing/ui/HowItWorks';
import { Pricing } from '@/features/marketing/ui/Pricing';
import { Comparison } from '@/features/marketing/ui/Comparison';
import { WaitlistForm } from '@/features/marketing/ui/WaitlistForm';
import { Footer } from '@/features/marketing/ui/Footer';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <Comparison />
        <WaitlistForm />
      </main>
      <Footer />
    </>
  );
}
