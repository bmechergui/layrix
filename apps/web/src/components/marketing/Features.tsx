import { Zap, Eye, Cpu, Package, Coins, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Zap,
    label: 'AGENT_CORE',
    title: 'Autonomous Agent',
    desc: 'Describe your circuit. Layrix plans, routes, fixes DRC violations and delivers Gerbers — no human intervention.',
    accent: 'primary',
  },
  {
    icon: Eye,
    label: 'VIEWER_2D3D',
    title: '2D / 3D Viewer',
    desc: 'Inspect every layer in real-time at 60 FPS. Switch to 3D with realistic FR4 and copper materials.',
    accent: 'primary',
  },
  {
    icon: Cpu,
    label: 'FOOTPRINT_AI',
    title: 'Auto Footprint',
    desc: 'Missing footprint? Layrix searches SnapMagic, reads the datasheet with Vision AI and generates it automatically.',
    accent: 'copper',
  },
  {
    icon: Package,
    label: 'JLCPCB_INT',
    title: 'JLCPCB Ready',
    desc: 'BOM, CPL, Gerbers — perfectly formatted. One click to request a quote and order fabrication.',
    accent: 'copper',
  },
  {
    icon: Coins,
    label: 'CREDIT_SYS',
    title: 'Pay as you go',
    desc: 'Free tier included. Maker and Pro plans for professionals. Credits never expire.',
    accent: 'primary',
  },
  {
    icon: Activity,
    label: 'SPICE_SIM',
    title: 'SPICE Simulation',
    desc: 'Run transient, AC and DC analysis before ordering. Powered by ngspice. Pro plan feature.',
    accent: 'copper',
  },
];

export function Features() {
  return (
    <section id="features" className="py-24 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="pcb-label text-muted-foreground/60 mb-3">CAPABILITIES</p>
          <h2 className="font-display text-4xl font-extrabold tracking-tight mb-4">
            Everything you need to<br />
            <span className="text-gradient">design PCBs with AI</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From schematic to Gerbers, the entire workflow is automated.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map(({ icon: Icon, label, title, desc, accent }) => (
            <Card
              key={title}
              className="group hover:border-primary/30 transition-all duration-300 hover:bg-[#0f0f0f] circuit-corners"
            >
              <CardContent className="p-6">
                {/* PCB label */}
                <p className="pcb-label text-muted-foreground/30 mb-4">{label}</p>

                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                  accent === 'copper'
                    ? 'bg-accent/10 group-hover:bg-accent/20'
                    : 'bg-primary/10 group-hover:bg-primary/20'
                }`}>
                  <Icon
                    size={18}
                    className={accent === 'copper' ? 'text-accent' : 'text-primary'}
                  />
                </div>

                <h3 className="font-display font-bold text-foreground mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
