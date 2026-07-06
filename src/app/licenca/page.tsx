'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getLeadLicenseInfo } from '@/app/actions';
import { CheckCircle, AlertTriangle, Loader2, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';

export default function LicencaPage() {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f111a', color: '#9ca3af' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    }>
      <LicencaContent />
    </React.Suspense>
  );
}

function LicencaContent() {
  const searchParams = useSearchParams();
  const leadId = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lead, setLead] = useState<{
    name: string;
    productName: string;
    licenseKey: string;
    orderId: string;
    status: string;
  } | null>(null);
  const [instructionsHtml, setInstructionsHtml] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!leadId) {
      setError('Link de acesso inválido ou ID do pedido ausente.');
      setLoading(false);
      return;
    }

    const loadLicense = async () => {
      try {
        const res = await getLeadLicenseInfo(leadId);
        if (res.success && res.lead) {
          setLead(res.lead);
          setInstructionsHtml(res.instructionsHtml);
        } else {
          setError('Não foi possível carregar as informações do seu pedido.');
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar licença.');
      } finally {
        setLoading(false);
      }
    };

    loadLicense();
  }, [leadId]);

  useEffect(() => {
    if (!instructionsHtml) return;

    // We wait for the DOM to render the instructions
    const timer = setTimeout(() => {
      const codeBlocks = document.querySelectorAll('.instructions-render code');
      codeBlocks.forEach((element) => {
        const codeEl = element as HTMLElement;
        codeEl.style.cursor = 'pointer';
        codeEl.setAttribute('title', 'Clique para copiar o comando');
        
        // Remove existing listeners if any by cloning
        const newCodeEl = codeEl.cloneNode(true) as HTMLElement;
        codeEl.parentNode?.replaceChild(newCodeEl, codeEl);

        const originalText = newCodeEl.textContent || '';

        newCodeEl.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(originalText);
            
            // Set styles dynamically with important to bypass any style sheets
            newCodeEl.style.setProperty('background-color', '#065f46', 'important');
            newCodeEl.style.setProperty('color', '#34d399', 'important');
            newCodeEl.style.setProperty('border-color', '#059669', 'important');
            
            newCodeEl.textContent = '✓ Copiado!';

            setTimeout(() => {
              newCodeEl.style.setProperty('background-color', '', '');
              newCodeEl.style.setProperty('color', '', '');
              newCodeEl.style.setProperty('border-color', '', '');
              newCodeEl.textContent = originalText;
            }, 2000);
          } catch (err) {
            console.error('Erro ao copiar comando:', err);
          }
        });
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [instructionsHtml]);



  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f111a', color: '#9ca3af', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={40} style={{ color: '#4f46e5' }} />
        <h2 style={{ fontSize: '1.15rem', color: '#f3f4f6', fontWeight: '500' }}>Carregando sua licença segura...</h2>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
        <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #ef4444', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', marginBottom: '1.5rem' }}>
            <AlertTriangle size={36} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#f3f4f6' }}>Acesso Indisponível</h2>
          <p style={{ color: '#ef4444', fontSize: '0.925rem', marginBottom: '1.5rem', fontWeight: '500' }}>
            {error || 'Licença não encontrada.'}
          </p>
          <div style={{ borderTop: '1px solid #2d3748', paddingTop: '1.5rem', marginTop: '1.5rem' }}>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Precisa de ajuda com o seu resgate? Entre em contato com o nosso suporte técnico:
            </p>
            <a 
              href={`https://wa.me/5511935856950?text=${encodeURIComponent(`Olá! Estou com dificuldades para acessar a minha licença na página de resgate seguro (ID do Acesso: ${leadId || 'Não Identificado'}).`)}`}
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', backgroundColor: '#10b981', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.875rem' }}
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100vh', padding: '2rem 1rem', backgroundColor: '#0f111a', overflowY: 'auto' }}>
      <div style={{ maxWidth: '640px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Main Card */}
        <div style={{ backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem', borderBottom: '1px solid #2d3748', paddingBottom: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: '1rem' }}>
              <CheckCircle size={32} />
            </div>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 'bold', color: '#f3f4f6', marginBottom: '0.5rem' }}>Olá, {lead.name}!</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>Sua licença oficial da SuperSoftware está pronta abaixo.</p>
          </div>

          {/* Details */}
          <div style={{ marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>
              Produto Adquirido
            </span>
            <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#f3f4f6' }}>
              {lead.productName}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>
                Pedido Shopee
              </span>
              <span style={{ fontSize: '0.925rem', color: '#e2e8f0', fontWeight: '500' }}>
                #{lead.orderId}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>
                Status do Recebimento
              </span>
              <span style={{ fontSize: '0.825rem', padding: '0.25rem 0.5rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '4px', fontWeight: 'bold' }}>
                Confirmado
              </span>
            </div>
          </div>

          {/* License Key Box */}
          <div style={{ backgroundColor: '#141622', border: '1px solid #2d3748', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#9ca3af', display: 'block', marginBottom: '0.75rem' }}>
              Chave de Ativação
            </span>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444', letterSpacing: '0.05em', wordBreak: 'break-all' }}>
                {lead.licenseKey}
              </span>
            </div>
          </div>

          {/* Alert Info */}
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '1rem', fontSize: '0.85rem', color: '#a7f3d0', lineHeight: '1.5', marginBottom: '1rem' }}>
            🎉 <strong>Recebimento Confirmado!</strong> Agradecemos sua visita.
          </div>

        </div>

        {/* Instructions Card */}
        <div style={{ backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f3f4f6', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HelpCircle size={20} style={{ color: '#4f46e5' }} />
            Instruções Detalhadas de Instalação
          </h2>
          
          <div 
            className="instructions-render"
            dangerouslySetInnerHTML={{ __html: instructionsHtml }} 
            style={{ color: '#e2e8f0', fontSize: '0.95rem' }}
          />
        </div>

        {/* Sticky support button */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <a 
            href={`https://wa.me/5511935856950?text=${encodeURIComponent(`Olá! Preciso de ajuda com a ativação da minha licença (${lead.productName}) para o pedido Shopee #${lead.orderId}.`)}`}
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: '#9ca3af', fontSize: '0.875rem', textDecoration: 'none', transition: 'color 0.2s', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #2d3748', backgroundColor: '#1e2130' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#10b981'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
          >
            Precisa de ajuda? Fale conosco no WhatsApp <ExternalLink size={14} />
          </a>
        </div>

      </div>

      {/* Styled classes embedded */}
      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .instructions-render a {
          color: #818cf8 !important;
          text-decoration: underline !important;
        }
        .instructions-render a:hover {
          color: #a5b4fc !important;
        }
        .instructions-render h3, .instructions-render h4 {
          color: #f3f4f6 !important;
        }

      `}</style>
    </div>
  );
}
