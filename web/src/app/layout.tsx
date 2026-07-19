import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

/** Google Fonts, self-hosted at build time by `next/font` — no runtime third-party request. */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'GateReady — Know before you go',
  description:
    'Multilingual, photo-based gate-readiness checks for the FIFA World Cup 2026. Ask in any language what you can bring into the stadium, get accessible-route guidance, and give volunteers a script to read aloud.',
  applicationName: 'GateReady',
  keywords: ['FIFA World Cup 2026', 'stadium', 'accessibility', 'gate policy', 'multilingual'],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
