'use client';

import { useState } from 'react';
import { saveLeadAndSendKey, getClientNameByEmail } from '@/app/actions';
import { Mail, CheckCircle, Clock, AlertTriangle, Key, ShoppingBag, ArrowRight, MessageCircle } from 'lucide-react';

export default function ResgatarPage() {
  const [orderId, setOrderId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [showProductSelector, setShowProductSelector] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [notFoundAttempts, setNotFoundAttempts] = useState(0);
  const [result, setResult] = useState<{
    status: 'sent' | 'pending_verification' | 'pending_key';
    productName: string;
    keySent?: string | null;
  } | null>(null);

  const handleEmailBlur = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@') || !trimmedEmail.includes('.')) return;

    try {
      const res = await getClientNameByEmail(trimmedEmail);
      if (res.success && res.name) {
        setName(res.name);
      }
    } catch (err) {
      console.error('Error fetching client name:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // Normaliza: remove espaços, "#" e outros caracteres colados sem querer
    const cleanedOrderId = orderId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanedOrderId !== orderId) setOrderId(cleanedOrderId);

    if (!cleanedOrderId || !name.trim() || !email.trim()) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    // IDs da Shopee têm ~14 caracteres alfanuméricos (ex: 260528ABCD1234)
    if (!/^[A-Z0-9]{12,20}$/.test(cleanedOrderId)) {
      setErrorMsg(
        'Este número de pedido não parece válido. Na Shopee, abra "Meus Pedidos", ' +
        'toque no pedido e copie o "ID do Pedido" (cerca de 14 letras e números, ex: 260528ABCD1234).'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await saveLeadAndSendKey(
        cleanedOrderId,
        name,
        email,
        showProductSelector ? selectedProduct : undefined
      );

      // Pedido não encontrado no sistema → orienta a conferir o número.
      // Após 2 tentativas, libera o resgate manual via seleção de produto.
      if ('orderNotFound' in res && res.orderNotFound) {
        const attempts = notFoundAttempts + 1;
        setNotFoundAttempts(attempts);
        if (attempts >= 2) {
          setShowProductSelector(true);
          setSelectedProduct('Windows 11 Pro');
          setErrorMsg(
            'Pedido ainda não encontrado. Confira o número mais uma vez — ou, se tiver certeza ' +
            'de que está correto, selecione abaixo o produto comprado e envie novamente para ' +
            'processarmos o resgate manualmente.'
          );
        } else {
          setErrorMsg(
            'Pedido não encontrado. Verifique o número na Shopee: abra "Meus Pedidos", ' +
            'toque no seu pedido e copie o "ID do Pedido" exatamente como aparece.'
          );
        }
        return;
      }

      if (res.success) {
        if (res.isDuplicate) {
          alert(res.message || 'Este pedido já foi resgatado.');
        }

        if (res.status === 'pending_verification' && !showProductSelector && !res.isDuplicate) {
          // If order not found and we haven't prompted them for the product, show the selector
          setShowProductSelector(true);
          setSelectedProduct('Windows 11 Pro'); // default choice
        } else {
          setResult({
            status: res.status as 'sent' | 'pending_verification' | 'pending_key',
            productName: res.lead.product_name,
            keySent: res.lead.license_key
          });
        }
      } else {
        setErrorMsg(res.message || 'Erro ao processar resgate.');
      }
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao processar seu resgate. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const productOptions = [
    'Windows 11 Pro',
    'Windows 10 Pro',
    'Office 2021 Professional Plus',
    'Office 2016 Professional Plus',
    'Office 2024 Professional Plus'
  ];

  // Success view (Key sent immediately)
  if (result?.status === 'sent') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
        <div style={{ maxWidth: '500px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', marginBottom: '1.5rem' }}>
            <CheckCircle size={36} />
          </div>
          
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f3f4f6' }}>Resgate Concluído!</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.925rem', marginBottom: '2rem' }}>Enviamos sua licença com sucesso para o seu e-mail.</p>
          
          <div style={{ backgroundColor: '#0f111a', border: '1px solid #2d3748', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#f3f4f6', fontSize: '0.875rem', fontWeight: 'bold' }}>
              <ShoppingBag size={16} style={{ color: '#4f46e5' }} />
              <span>Produto</span>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.925rem', paddingLeft: '1.5rem', marginBottom: '1rem' }}>{result.productName}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#f3f4f6', fontSize: '0.875rem', fontWeight: 'bold' }}>
              <Key size={16} style={{ color: '#ef4444' }} />
              <span>Chave de Ativação</span>
            </div>
            <p style={{ fontSize: '0.925rem', color: '#ef4444', fontWeight: '600', paddingLeft: '1.5rem', lineHeight: '1.4' }}>
              Enviada para o seu e-mail. Por razões de segurança, acesse o link de ativação enviado para revelar a sua chave.
            </p>
          </div>

          {/* Whitelist Highlight Box */}
          <div style={{ border: '2px solid #2d3748', backgroundColor: 'rgba(79, 70, 229, 0.05)', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
            <p style={{ fontWeight: 'bold', color: '#818cf8', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={16} /> 📩 ATENÇÃO - IMPORTANTE:
            </p>
            <p style={{ fontSize: '0.825rem', color: '#9ca3af', lineHeight: '1.4' }}>
              Para garantir que você receba futuras chaves e ofertas na sua caixa de entrada, 
              adicione <strong>pedido@supersoftware.info</strong> aos seus contatos 
              ou marque nosso e-mail como <strong>"Não é spam"</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a 
              href={`https://wa.me/5511935856950?text=${encodeURIComponent(`Olá! Preciso de suporte com o resgate do meu pedido Shopee #${orderId}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem', backgroundColor: '#10b981', color: 'white', borderRadius: '6px', fontSize: '0.875rem', fontWeight: '600', textDecoration: 'none', transition: 'background-color 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#10b981'}
            >
              <MessageCircle size={16} /> Suporte no WhatsApp
            </a>
            <button 
              onClick={() => {
                setResult(null);
                setOrderId('');
                setName('');
                setEmail('');
                setShowProductSelector(false);
              }}
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#4f46e5', border: 'none', color: 'white', borderRadius: '6px', fontSize: '0.875rem', fontWeight: '600', transition: 'background-color 0.2s' }}
            >
              Fazer Outro Resgate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pending verification / key view
  if (result?.status === 'pending_verification' || result?.status === 'pending_key') {
    const isPendingKey = result.status === 'pending_key';

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
        <div style={{ maxWidth: '500px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '50%', backgroundColor: isPendingKey ? 'rgba(245, 158, 11, 0.1)' : 'rgba(79, 70, 229, 0.1)', color: isPendingKey ? '#f59e0b' : '#818cf8', marginBottom: '1.5rem' }}>
            {isPendingKey ? <AlertTriangle size={36} /> : <Clock size={36} />}
          </div>
          
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f3f4f6' }}>
            Pedido em Processamento!
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '0.925rem', marginBottom: '2rem', lineHeight: '1.5' }}>
            {isPendingKey 
              ? 'Sua chave de licença está sendo gerada pelo sistema. Em instantes, o código e o passo a passo completo de instalação serão enviados para o seu e-mail!'
              : 'Seu pedido está sendo processado em nosso sistema. Em instantes, enviaremos a sua chave de ativação e todas as instruções detalhadas de instalação diretamente para o seu e-mail cadastrado!'}
          </p>

          <div style={{ backgroundColor: '#0f111a', border: '1px solid #2d3748', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#f3f4f6', fontSize: '0.875rem', fontWeight: 'bold' }}>
              <ShoppingBag size={16} style={{ color: '#4f46e5' }} />
              <span>Pedido / Produto</span>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>#{orderId} — {result.productName}</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem', color: '#f3f4f6', fontSize: '0.875rem', fontWeight: 'bold' }}>
              <Mail size={16} style={{ color: '#10b981' }} />
              <span>E-mail de Destino</span>
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>{email}</p>
          </div>

          <div style={{ border: '2px solid #2d3748', backgroundColor: 'rgba(79, 70, 229, 0.05)', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
            <p style={{ fontWeight: 'bold', color: '#818cf8', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              📩 IMPORTANTE:
            </p>
            <p style={{ fontSize: '0.825rem', color: '#9ca3af', lineHeight: '1.4' }}>
              Adicione o remetente <strong>pedido@supersoftware.info</strong> aos seus contatos. Isso evitará que o e-mail de entrega caia na caixa de spam do Gmail/Outlook.
            </p>
          </div>

          <button 
            onClick={() => {
              setResult(null);
              setOrderId('');
              setName('');
              setEmail('');
              setShowProductSelector(false);
            }}
            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#4f46e5', color: 'white', borderRadius: '6px', fontSize: '0.875rem', fontWeight: '600', transition: 'background-color 0.2s' }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // Form View
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '1rem', backgroundColor: '#0f111a' }}>
      <div style={{ maxWidth: '450px', width: '100%', backgroundColor: '#1e2130', border: '1px solid #2d3748', borderRadius: '12px', padding: '2.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.3)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f3f4f6', marginBottom: '0.5rem' }}>
            Resgate de Licença
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
            Preencha os dados abaixo para receber sua chave de produto.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#9ca3af', marginBottom: '0.5rem' }}>
              ID do Pedido Shopee
            </label>
            <input
              type="text"
              placeholder="Ex: 260528ABCD1234"
              value={orderId}
              onChange={(e) => { setOrderId(e.target.value); if (errorMsg) setErrorMsg(''); }}
              disabled={loading}
              required
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f111a', border: errorMsg ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid #2d3748', borderRadius: '8px', color: '#f3f4f6', outline: 'none', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#9ca3af', marginBottom: '0.5rem' }}>
              Seu E-mail para Recebimento
            </label>
            <input 
              type="email" 
              placeholder="Ex: seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleEmailBlur}
              disabled={loading}
              required
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f111a', border: '1px solid #2d3748', borderRadius: '8px', color: '#f3f4f6', outline: 'none', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: '600', color: '#9ca3af', marginBottom: '0.5rem' }}>
              Seu Nome Completo
            </label>
            <input 
              type="text" 
              placeholder="Digite seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#0f111a', border: '1px solid #2d3748', borderRadius: '8px', color: '#f3f4f6', outline: 'none', fontSize: '0.875rem' }}
            />
          </div>

          {/* Error message (invalid / not-found order number) */}
          {errorMsg && (
            <div style={{ padding: '0.875rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '0.8125rem', color: '#fca5a5', lineHeight: '1.45', margin: 0 }}>{errorMsg}</p>
            </div>
          )}

          {/* Dynamic Product Selector (shown if order not found in DB) */}
          {showProductSelector && (
            <div style={{ padding: '1rem', backgroundColor: 'rgba(79, 70, 229, 0.05)', border: '1px solid rgba(79, 70, 229, 0.2)', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.8125rem', color: '#818cf8', fontWeight: '600', marginBottom: '0.5rem' }}>
                ⚠️ Pedido ainda não sincronizado
              </p>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                Não localizamos este ID de pedido ainda. Selecione qual produto você comprou para podermos processar o resgate manual:
              </p>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                disabled={loading}
                style={{ width: '100%', padding: '0.625rem', backgroundColor: '#0f111a', border: '1px solid #2d3748', borderRadius: '6px', color: '#f3f4f6', outline: 'none', fontSize: '0.875rem', cursor: 'pointer' }}
              >
                {productOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem', 
              width: '100%', 
              padding: '0.875rem', 
              backgroundColor: '#4f46e5', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              cursor: 'pointer', 
              transition: 'background-color 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Processando...' : (
              <>
                <span>Resgatar Licença</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

        </form>

      </div>
    </div>
  );
}
