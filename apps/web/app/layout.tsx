import './globals.css';
import type { ReactNode } from 'react';
export const metadata = {
  title: 'Relay · Customer operations',
  description: 'A simple customer operations workspace.',
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
