import './globals.css';
import Link from 'next/link';
import { headers } from 'next/headers';
import { LayoutDashboard, Upload, Settings, Mail } from 'lucide-react';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  const host = headersList.get('host') || '';
  const isPublicPage = pathname.startsWith('/resgatar') || 
                       pathname.startsWith('/confirmar-recebimento') || 
                       pathname.startsWith('/licenca') || 
                       host === 'resgatar.supersoftware.info';

  if (isPublicPage) {
    return (
      <html lang="pt-BR">
        <body>
          <main style={{ minHeight: '100vh', backgroundColor: 'var(--background)' }}>
            {children}
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR">
      <body>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          {/* Sidebar */}
          <aside style={{ width: '250px', backgroundColor: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '2rem 1rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '2rem', paddingLeft: '1rem' }}>
              <span style={{ color: 'var(--primary)' }}>Shopee</span> Dashboard
            </h1>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--text-muted)', transition: 'all 0.2s ease' }} className="nav-item">
                <LayoutDashboard size={20} />
                Dashboard
              </Link>
              <Link href="/import" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--text-muted)', transition: 'all 0.2s ease' }} className="nav-item">
                <Upload size={20} />
                Importar Dados
              </Link>
              <Link href="/leads" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--text-muted)', transition: 'all 0.2s ease' }} className="nav-item">
                <Mail size={20} />
                Gerenciar Leads
              </Link>
              <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--text-muted)', transition: 'all 0.2s ease' }} className="nav-item">
                <Settings size={20} />
                Configurações
              </Link>
            </nav>
            <style>{`
              .nav-item:hover {
                background-color: rgba(255, 255, 255, 0.05);
                color: var(--text) !important;
              }
            `}</style>
          </aside>
          
          {/* Main Content */}
          <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
