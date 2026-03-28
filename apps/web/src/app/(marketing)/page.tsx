import { Navbar } from '@/components/marketing/Navbar';
import { Hero } from '@/components/marketing/Hero';
import { Features } from '@/components/marketing/Features';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { Pricing } from '@/components/marketing/Pricing';
import { Comparison } from '@/components/marketing/Comparison';
import { WaitlistForm } from '@/components/marketing/WaitlistForm';
import { Footer } from '@/components/marketing/Footer';

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
