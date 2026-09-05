import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dossiê Técnico de Crédito Rural',
  description:
    'Protótipo demonstrativo para análise técnica de crédito rural com dados integralmente fictícios.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
