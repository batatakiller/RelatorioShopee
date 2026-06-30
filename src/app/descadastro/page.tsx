'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { unsubscribeEmail } from '@/app/actions';
import { CheckCircle, Mail, ShieldCheck, Loader2 } from 'lucide-react';

export default function DescadastroPage() {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f111a', color: '#9ca3af' }}>
        Carregando...
      </div>
    }>
      <DescadastroContent />
    </React.Suspense>
  );
}

function DescadastroContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    if (!email) {
      setStatus('error');
      return;
    }

    const performUnsubscribe = async () => {
      try {
        const res = await unsubscribeEmail(email);
        if (res.success) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    };

    performUnsubscribe();
  }, [email]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
      <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
        
        {status === 'loading' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Loader2 className="animate-spin" size={36} style={{ color: '#4f46e5' }} />
            <p style={{ color: '#9ca3af', fontSize: '0.925rem' }}>Processando sua solicitação de descadastro...</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: '1.5rem' }}>
              <CheckCircle size={36} />
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#f3f4f6' }}>
              Descadastro Concluído
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', backgroundColor: '#141622', border: '1px solid #2d3748', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <Mail size={16} style={{ color: '#818cf8' }} />
              <span style={{ color: '#e2e8f0', fontSize: '0.875rem', fontWeight: '500', wordBreak: 'break-all' }}>
                {email || 'Seu e-mail'}
              </span>
            </div>

            <p style={{ color: '#9ca3af', fontSize: '0.925rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
              Você foi removido com sucesso de nossa lista de envio de ofertas, novidades e informativos da SuperSoftware.
            </p>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', backgroundColor: 'rgba(79, 70, 229, 0.05)', border: '1px solid rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '8px', textAlign: 'left' }}>
              <ShieldCheck size={20} style={{ color: '#818cf8', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ color: '#a5b4fc', fontSize: '0.775rem', lineHeight: '1.4', margin: 0 }}>
                <strong>Nota importante:</strong> Caso realize novas compras de chaves de ativação no futuro, você continuará recebendo os e-mails transacionais específicos com as chaves e links de resgate de forma avulsa.
              </p>
            </div>
          </>
        )}

      </div>
      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
