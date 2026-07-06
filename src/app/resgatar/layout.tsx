import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://resgatar.supersoftware.info'),
  title: 'Resgate de Licença — Super Software',
  description:
    'Resgate a chave do seu produto Super Software. Informe o ID do pedido Shopee e seu e-mail para receber sua licença original por e-mail.',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: 'https://resgatar.supersoftware.info/',
    siteName: 'Super Software',
    locale: 'pt_BR',
    title: 'Resgate de Licença — Super Software',
    description:
      'Informe o ID do pedido Shopee e seu e-mail para receber a chave do seu produto Super Software.',
  },
  twitter: {
    card: 'summary',
    title: 'Resgate de Licença — Super Software',
    description:
      'Resgate a chave do seu produto Super Software com o ID do pedido Shopee.',
  },
};

export default function ResgatarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
