import type { Metadata } from 'next';
import './global.css';

export const metadata: Metadata = {
  title: 'SamJoE Food',
  description: 'Plataforma de pedidos e operação para negócios de alimentação, criada pela SamJoE Tech & Consulting.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

