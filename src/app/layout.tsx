import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CardFlow — Business Card OCR',
  description: 'Scan business cards and export your contacts in seconds.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
