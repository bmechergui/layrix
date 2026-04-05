// TypeScript declarations for KiCanvas web components
// KiCanvas is loaded via CDN (no npm package available)
// Docs: https://kicanvas.org

declare namespace JSX {
  interface IntrinsicElements {
    'kicanvas-embed': React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        src?: string;
        controls?: string;
        theme?: 'dark' | 'light';
      },
      HTMLElement
    >;
  }
}
