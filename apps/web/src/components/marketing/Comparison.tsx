import { Check, X } from 'lucide-react';

const features = [
  'Autonomous agent',
  'Natural language input',
  'Auto DRC fix',
  'JLCPCB integration',
  '3D viewer',
  'SPICE simulation',
  'Footprint generation',
];

const tools = [
  { name: 'Layrix', values: [true, true, true, true, true, true, true], price: 'from 0€' },
  { name: 'Flux.ai', values: [false, true, false, false, true, false, false], price: '$99/mo' },
  { name: 'Quilter', values: [true, false, true, false, false, false, false], price: '$49/mo' },
  { name: 'KiCad', values: [false, false, false, false, true, true, false], price: 'Free' },
];

export function Comparison() {
  return (
    <section className="py-24 px-6 border-t border-border">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold tracking-tight mb-4">How Layrix compares</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 pr-8 text-muted-foreground font-medium text-sm w-1/3">Feature</th>
                {tools.map((t) => (
                  <th key={t.name} className={`text-center py-4 px-4 text-sm font-semibold ${t.name === 'Layrix' ? 'text-primary' : 'text-foreground'}`}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, i) => (
                <tr key={feature} className="border-b border-border/50 hover:bg-[#111111] transition-colors">
                  <td className="py-3 pr-8 text-sm text-muted-foreground">{feature}</td>
                  {tools.map((t) => (
                    <td key={t.name} className="py-3 px-4 text-center">
                      {t.values[i] ? (
                        <Check size={16} className="text-[#22C55E] mx-auto" />
                      ) : (
                        <X size={16} className="text-muted-foreground/40 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-4 text-sm font-medium text-foreground">Price</td>
                {tools.map((t) => (
                  <td key={t.name} className={`py-4 px-4 text-center text-sm font-semibold ${t.name === 'Layrix' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {t.price}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
