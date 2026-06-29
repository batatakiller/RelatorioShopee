'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { confirmReceiptDirect } from '@/app/actions';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import React from 'react';

// Wrap the main content in a Suspense boundary as required by Next.js when using useSearchParams in static export/prerendering
export default function ConfirmarPage() {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f111a', color: '#9ca3af' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    }>
      <ConfirmarContent />
    </React.Suspense>
  );
}

function ConfirmarContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!leadId) {
      setStatus('error');
      setErrorMessage('Link de confirmação inválido ou ID ausente.');
      return;
    }

    const runConfirmation = async () => {
      try {
        const res = await confirmReceiptDirect(leadId);
        if (res.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage('Não foi possível confirmar o recebimento.');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Ocorreu um erro ao processar.');
      }
    };

    runConfirmation();
  }, [leadId]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
      <div style={{ maxWidth: '450px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Loader2 className="animate-spin" size={40} style={{ color: '#4f46e5' }} />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f3f4f6' }}>Confirmando recebimento...</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Aguarde um instante, estamos atualizando nosso sistema.</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: '1.5rem' }}>
              <CheckCircle size={36} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#f3f4f6' }}>Recebimento Confirmado!</h2>
            <p style={{ color: '#9ca3af', fontSize: '0.925rem', lineHeight: '1.5', marginBottom: '2rem' }}>
              Agradecemos a sua confirmação. O recebimento da sua licença foi registrado no sistema da SuperSoftware.
            </p>
            <p style={{ color: '#818cf8', fontSize: '#0.875rem', fontWeight: 'bold' }}>
              Se precisar de ajuda ou suporte técnico, basta nos enviar uma mensagem!
            </p>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '1.5rem' }}>
              <AlertTriangle size={36} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#f3f4f6' }}>Ops! Ocorreu um Erro</h2>
            <p style={{ color: '#ef4444', fontSize: '0.925rem', marginBottom: '1.5rem', fontWeight: '500' }}>
              {errorMessage}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.8125rem', lineHeight: '1.4' }}>
              Caso você já tenha recebido e ativado sua chave com sucesso, não se preocupe! Você também pode nos responder diretamente pelo e-mail escrevendo "Recebido".
            </p>
          </div>
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
