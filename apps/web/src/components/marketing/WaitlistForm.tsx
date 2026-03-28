'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState('loading');
    await new Promise((r) => setTimeout(r, 1000)); // mock
    setState('success');
  };

  return (
    <section id="waitlist" className="py-24 px-6 border-t border-border">
      <div className="max-w-xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 border border-primary/30 text-primary text-xs px-3 py-1.5 rounded-full mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-slow" />
          Early Access
        </div>
        <h2 className="text-4xl font-bold tracking-tight mb-4">Be first to design PCBs with AI</h2>
        <p className="text-muted-foreground mb-8">Join 500+ engineers already on the waitlist.</p>

        {state === 'success' ? (
          <div className="flex items-center justify-center gap-3 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] rounded-xl p-4">
            <Check size={20} />
            <span className="font-medium">You're on the list! We'll notify you when Layrix launches.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 h-12 text-base"
            />
            <Button type="submit" size="lg" disabled={state === 'loading'} className="px-6 glow-cyan-sm">
              {state === 'loading' ? 'Joining...' : 'Join Waitlist'}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
