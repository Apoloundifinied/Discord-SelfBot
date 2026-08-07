import './globals.css';
import BackgroundFX from '@/components/BackgroundFX';
import BrandReveal from '@/components/BrandReveal';

export const metadata = {
  title: 'HUGGING · Console de Inteligência',
  description: 'Console local de inteligência do Discord — histórico, tempo real e identidade.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <BackgroundFX />
        <BrandReveal />
        {children}
      </body>
    </html>
  );
}
