import './globals.css';

export const metadata = {
  title: 'Discord Live Monitor',
  description: 'Painel de mensagens do Discord em tempo real (Supabase)',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
