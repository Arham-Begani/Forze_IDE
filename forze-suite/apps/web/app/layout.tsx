import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'VIBECODE — The OS for Builders',
  description:
    'VIBECODE — premium AI-native workspace for founders, indie hackers, and builders.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg-base text-ink antialiased">{children}</body>
    </html>
  );
}
