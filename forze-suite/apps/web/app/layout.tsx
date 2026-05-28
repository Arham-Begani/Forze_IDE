import type { ReactNode } from 'react';

export const metadata = {
  title: 'Forge',
  description: 'Forge — the cloud companion for the Forze IDE.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
