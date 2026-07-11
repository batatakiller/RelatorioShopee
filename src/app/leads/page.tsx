'use client';

import { useEffect, useState } from 'react';
import {
  fetchLeadsAndKeys,
  addLicenseKeys,
  approveLead,
  deleteLead,
  deleteLicenseKey,
  checkEmailReplies,
  saveEmailTemplate,
  createWhatsAppOrder
} from '@/app/actions';
import { 
  Mail, 
  Key, 
  Plus, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Search, 
  Database, 
  CheckCircle,
  Inbox,
  FileText,
  Edit3,
  MessageCircle,
  Copy
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Lead {
  id: string;
  order_id: string;
  name: string;
  email: string;
  product_name: string;
  license_key: string | null;
  status: 'sent' | 'pending_verification' | 'pending_key' | 'recebido';
  created_at: string;
  unsubscribed?: boolean;
}

interface LicenseKey {
  id: string;
  product_name: string;
  key_code: string;
  is_used: boolean;
  order_id: string | null;
  used_at: string | null;
  created_at: string;
}

interface EmailTemplate {
  id: string;
  product_key: string;
  name: string;
  template_html: string;
  created_at: string;
  updated_at: string;
}

export default function LeadsDashboard() {
  const [activeTab, setActiveTab] = useState<'leads' | 'keys' | 'templates'>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [importedOrderIds, setImportedOrderIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [syncingIMAP, setSyncingIMAP] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Forms states
  const [newKeyProduct, setNewKeyProduct] = useState('Windows 11 Pro');
  const [newKeysText, setNewKeysText] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');

  // Pedido manual (venda WhatsApp)
  const [showWaPanel, setShowWaPanel] = useState(false);
  const [waProduct, setWaProduct] = useState('Office 2024 Professional Plus');
  const [waLoading, setWaLoading] = useState(false);
  const [waResult, setWaResult] = useState<{ orderId: string; link: string } | null>(null);
  const [waCopied, setWaCopied] = useState(false);

  // Template Editor States
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateProductKey, setTemplateProductKey] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');

  const loadData = async () => {
    try {
      const res = await fetchLeadsAndKeys();
      setLeads(res.leads as Lead[]);
      setKeys(res.keys as LicenseKey[]);
      setImportedOrderIds(res.importedOrderIds);
      setTemplates((res.templates || []) as EmailTemplate[]);
    } catch (err) {
      console.error('Error loading leads/keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (tpl: EmailTemplate | null) => {
    if (tpl) {
      setEditingTemplate(tpl);
      setTemplateId(tpl.id);
      setTemplateName(tpl.name);
      setTemplateProductKey(tpl.product_key);
      setTemplateHtml(tpl.template_html);
    } else {
      setEditingTemplate(null);
      setTemplateId(null);
      setTemplateName('');
      setTemplateProductKey('');
      setTemplateHtml('');
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim() || !templateProductKey.trim() || !templateHtml.trim()) {
      alert('Por favor, preencha todos os campos.');
      return;
    }

    setActionLoading('save-template');
    try {
      const res = await saveEmailTemplate(templateId, templateProductKey, templateName, templateHtml);
      if (res.success) {
        alert('Template de e-mail salvo com sucesso!');
        await loadData();
        if (res.template) {
          handleSelectTemplate(res.template as EmailTemplate);
        }
      } else {
        alert('Erro ao salvar template: ' + (res.error || 'Erro desconhecido'));
      }
    } catch (err) {
      alert('Erro ao salvar template.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleProductClick = (productName: string) => {
    const matched = templates.find(t => 
      productName.toLowerCase().includes(t.product_key.toLowerCase()) ||
      t.product_key.toLowerCase().includes(productName.toLowerCase())
    );

    if (matched) {
      handleSelectTemplate(matched);
    } else {
      setEditingTemplate(null);
      setTemplateId(null);
      setTemplateName(productName);
      setTemplateProductKey(productName.toLowerCase());
      setTemplateHtml('');
    }
    setActiveTab('templates');
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeysText.trim()) return;

    setActionLoading('add-keys');
    try {
      const res = await addLicenseKeys(newKeyProduct, newKeysText);
      if (res.success) {
        alert(`${res.count} chaves adicionadas com sucesso!`);
        setNewKeysText('');
        await loadData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao adicionar chaves.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveLead = async (leadId: string) => {
    setActionLoading(`approve-${leadId}`);
    try {
      const res = await approveLead(leadId);
      if (res.success) {
        alert('Lead aprovado e chave enviada por e-mail!');
        await loadData();
      } else {
        alert(res.error || 'Erro ao aprovar lead.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao aprovar lead.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm('Deseja realmente excluir este lead permanentemente?')) return;
    setActionLoading(`delete-lead-${leadId}`);
    try {
      const res = await deleteLead(leadId);
      if (res.success) {
        await loadData();
      }
    } catch (err) {
      alert('Erro ao excluir lead.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Deseja realmente excluir esta chave do estoque?')) return;
    setActionLoading(`delete-key-${keyId}`);
    try {
      const res = await deleteLicenseKey(keyId);
      if (res.success) {
        await loadData();
      }
    } catch (err) {
      alert('Erro ao excluir chave.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncIMAP = async () => {
    setSyncingIMAP(true);
    try {
      const res = await checkEmailReplies();
      if (res.success) {
        alert(`Sincronização concluída! ${res.updatedCount} leads foram confirmados como "Recebidos".`);
        await loadData();
      }
    } catch (err) {
      console.error(err);
      alert('Erro na sincronização IMAP. Verifique se as credenciais do servidor estão corretas.');
    } finally {
      setSyncingIMAP(false);
    }
  };

  // Helper to check if order is imported
  const isOrderImported = (orderId: string) => {
    if (!orderId) return false;
    const cleanId = orderId.trim().toUpperCase();
    return importedOrderIds.some(id => String(id).trim().toUpperCase() === cleanId);
  };

  // Registered key counts
  const keyCounts = keys.reduce((acc, k) => {
    acc[k.product_name] = (acc[k.product_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Filtering
  const filteredLeads = leads.filter(l => 
    l.order_id.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.name.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.email.toLowerCase().includes(leadSearch.toLowerCase()) ||
    l.product_name.toLowerCase().includes(leadSearch.toLowerCase())
  );

  const filteredKeys = keys.filter(k => 
    k.key_code.toLowerCase().includes(keySearch.toLowerCase()) ||
    k.product_name.toLowerCase().includes(keySearch.toLowerCase())
  );

  const statusBadge = (status: string) => {
    switch (status) {
      case 'recebido':
        return <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><CheckCircle size={12} /> Confirmado</span>;
      case 'sent':
        return <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(79, 70, 229, 0.1)', color: '#818cf8', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Check size={12} /> Enviada</span>;
      case 'pending_key':
        return <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><AlertTriangle size={12} /> Sem Chave</span>;
      case 'pending_verification':
      default:
        return <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={12} /> Validando Pedido</span>;
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Buscando dados no Supabase...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Mail style={{ color: 'var(--primary)' }} /> Gerenciamento de Leads e Chaves
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Controle os compradores capturados na landing page e gerencie o estoque de chaves.
          </p>
        </div>

        {activeTab === 'leads' && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setShowWaPanel(!showWaPanel); setWaResult(null); setWaCopied(false); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              backgroundColor: showWaPanel ? '#1e2130' : '#10b981',
              color: 'white',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 0.2s'
            }}
          >
            <MessageCircle size={16} />
            {showWaPanel ? 'Fechar' : 'Pedido WhatsApp'}
          </button>
          <button
            onClick={handleSyncIMAP}
            disabled={syncingIMAP}
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              padding: '0.625rem 1.25rem', 
              backgroundColor: syncingIMAP ? '#1e2130' : 'var(--primary)', 
              color: 'white', 
              borderRadius: '8px', 
              fontSize: '0.875rem', 
              fontWeight: '600', 
              cursor: syncingIMAP ? 'not-allowed' : 'pointer',
              border: 'none',
              transition: 'background-color 0.2s'
            }}
          >
            <RefreshCw size={16} className={syncingIMAP ? 'animate-spin' : ''} />
            {syncingIMAP ? 'Sincronizando IMAP...' : 'Sincronizar Respostas (IMAP)'}
          </button>
          </div>
        )}
      </div>

      {/* Painel: gerar pedido manual p/ venda WhatsApp */}
      {activeTab === 'leads' && showWaPanel && (
        <div style={{ backgroundColor: 'var(--card, #14162a)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <MessageCircle size={18} style={{ color: '#10b981' }} /> Gerar link de resgate (venda WhatsApp)
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Cria um pedido manual e gera o link do resgatar já com o número preenchido.
            O cliente só informa nome e e-mail — a chave sai do estoque e as instruções (com o comando de instalação) vão por e-mail.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={waProduct}
              onChange={e => setWaProduct(e.target.value)}
              style={{ padding: '0.625rem', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: '#0d0f1d', color: 'white', fontSize: '0.875rem' }}
            >
              <option value="Office 2024 Professional Plus">Office 2024 Professional Plus</option>
              <option value="Office 2021 Professional Plus">Office 2021 Professional Plus</option>
              <option value="Office 2016 Professional Plus">Office 2016 Professional Plus</option>
              <option value="Windows 11 Pro">Windows 11 Pro</option>
              <option value="Windows 10 Pro">Windows 10 Pro</option>
            </select>
            <button
              onClick={async () => {
                setWaLoading(true);
                setWaResult(null);
                setWaCopied(false);
                try {
                  const res = await createWhatsAppOrder(waProduct);
                  if (res.success && res.orderId && res.link) {
                    setWaResult({ orderId: res.orderId, link: res.link });
                  } else {
                    alert(res.message || 'Erro ao gerar o pedido.');
                  }
                } catch (err) {
                  console.error(err);
                  alert('Erro ao gerar o pedido.');
                } finally {
                  setWaLoading(false);
                }
              }}
              disabled={waLoading}
              style={{ padding: '0.625rem 1.25rem', backgroundColor: waLoading ? '#1e2130' : 'var(--primary)', color: 'white', borderRadius: '8px', fontSize: '0.875rem', fontWeight: '600', cursor: waLoading ? 'not-allowed' : 'pointer', border: 'none' }}
            >
              {waLoading ? 'Gerando...' : 'Gerar link'}
            </button>
          </div>
          {waResult && (
            <div
              onClick={() => {
                navigator.clipboard.writeText(waResult.link);
                setWaCopied(true);
                setTimeout(() => setWaCopied(false), 2000);
              }}
              style={{ marginTop: '1rem', padding: '0.875rem 1rem', backgroundColor: '#0d0f1d', border: `1px solid ${waCopied ? '#10b981' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}
            >
              <Copy size={16} style={{ color: waCopied ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ wordBreak: 'break-all' }}>
                <div style={{ fontFamily: 'monospace', color: waCopied ? '#10b981' : '#c7d2fe' }}>{waResult.link}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Pedido <strong>{waResult.orderId}</strong> — {waCopied ? 'Copiado! Cole no WhatsApp do cliente.' : 'Clique para copiar'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('leads')}
          style={{ 
            padding: '1rem 1.5rem', 
            fontSize: '0.925rem', 
            fontWeight: '600', 
            color: activeTab === 'leads' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'leads' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Inbox size={18} /> Leads do Resgate ({leads.length})
        </button>
        <button 
          onClick={() => setActiveTab('keys')}
          style={{ 
            padding: '1rem 1.5rem', 
            fontSize: '0.925rem', 
            fontWeight: '600', 
            color: activeTab === 'keys' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'keys' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Key size={18} /> Estoque de Chaves ({keys.length})
        </button>
        <button 
          onClick={() => {
            setActiveTab('templates');
            if (templates.length > 0 && !editingTemplate) {
              handleSelectTemplate(templates[0]);
            }
          }}
          style={{ 
            padding: '1rem 1.5rem', 
            fontSize: '0.925rem', 
            fontWeight: '600', 
            color: activeTab === 'templates' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: activeTab === 'templates' ? '2px solid var(--primary)' : '2px solid transparent',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <FileText size={18} /> Templates de E-mail ({templates.length})
        </button>
      </div>

      {/* TABS CONTENT */}
      {activeTab === 'leads' ? (
        // LEADS TAB
        <div>
          {/* Filter Bar */}
          <div style={{ display: 'flex', backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem', alignItems: 'center', gap: '0.75rem' }}>
            <Search size={18} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Pesquisar por pedido, nome, e-mail ou produto..." 
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
              style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '0.875rem' }}
            />
          </div>

          {/* Leads Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Pedido Shopee</th>
                    <th>Comprador</th>
                    <th>E-mail</th>
                    <th>Produto Solicitado</th>
                    <th>Sinc. Planilha</th>
                    <th>Status</th>
                    <th>Chave Entregue</th>
                    <th>Data Cadastro</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length > 0 ? (
                    filteredLeads.map((lead) => {
                      const imported = isOrderImported(lead.order_id);
                      return (
                        <tr key={lead.id}>
                          <td style={{ fontWeight: '600', fontSize: '0.875rem' }}>#{lead.order_id}</td>
                          <td>{lead.name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                             {lead.email}
                             {lead.unsubscribed && (
                               <span style={{ 
                                 marginLeft: '0.5rem', 
                                 fontSize: '0.7rem', 
                                 backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                                 color: '#ef4444', 
                                 padding: '0.1rem 0.35rem', 
                                 borderRadius: '4px', 
                                 fontWeight: 'bold' 
                               }}>
                                 Descadastrado
                               </span>
                             )}
                           </td>
                          <td style={{ fontSize: '0.875rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.product_name}>
                            {lead.product_name || '-'}
                          </td>
                          <td>
                            {imported ? (
                              <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold' }}>
                                <Database size={12} /> Importado
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 'bold' }} title="Este pedido ainda não consta nas planilhas do dashboard">
                                <AlertTriangle size={12} /> Pendente
                              </span>
                            )}
                          </td>
                          <td>{statusBadge(lead.status)}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: 'bold' }}>
                            {lead.license_key || '-'}
                          </td>
                          <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            {format(parseISO(lead.created_at), 'dd/MM/yyyy HH:mm')}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {(lead.status === 'pending_verification' || lead.status === 'pending_key') && (
                                <button 
                                  onClick={() => handleApproveLead(lead.id)}
                                  disabled={actionLoading !== null}
                                  style={{ 
                                    padding: '0.375rem 0.75rem', 
                                    backgroundColor: 'var(--primary)', 
                                    color: 'white', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 'bold', 
                                    cursor: 'pointer',
                                    border: 'none',
                                    opacity: actionLoading !== null ? 0.7 : 1
                                  }}
                                >
                                  {actionLoading === `approve-${lead.id}` ? 'Enviando...' : 'Liberar Chave'}
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteLead(lead.id)}
                                disabled={actionLoading !== null}
                                style={{ 
                                  padding: '0.375rem', 
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                  color: '#ef4444', 
                                  borderRadius: '4px', 
                                  cursor: 'pointer',
                                  border: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: actionLoading !== null ? 0.7 : 1
                                }}
                                title="Excluir Lead"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        Nenhum lead de resgate localizado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // KEYS TAB
        <div className="responsive-editor-grid">
          {/* Left Column: Form and Inventory Counts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            {/* Key counts panel */}
            <div className="card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                Resumo do Estoque
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {Object.keys(keyCounts).length > 0 ? (
                  Object.entries(keyCounts).map(([prod, cnt]) => (
                    <div 
                      key={prod} 
                      onClick={() => handleProductClick(prod)}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '6px', transition: 'all 0.2s' }}
                      title="Clique para editar o template de e-mail deste produto"
                      className="product-list-item-clickable"
                    >
                      <span style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{prod}</span>
                      <span style={{ fontWeight: 'bold', color: cnt > 0 ? '#10b981' : '#ef4444' }}>{cnt} chaves</span>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nenhuma chave livre no estoque.</p>
                )}
              </div>
            </div>

            {/* Add new keys form */}
            <div className="card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1rem' }}>Adicionar Chaves</h3>
              <form onSubmit={handleAddKeys} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Produto</label>
                  <select 
                    value={newKeyProduct}
                    onChange={(e) => setNewKeyProduct(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', outline: 'none' }}
                  >
                    <option value="Windows 11 Pro">Windows 11 Pro</option>
                    <option value="Windows 10 Pro">Windows 10 Pro</option>
                    <option value="Office 2021 Professional Plus">Office 2021 Professional Plus</option>
                    <option value="Office 2016 Professional Plus">Office 2016 Professional Plus</option>
                    <option value="Office 2024 Professional Plus">Office 2024 Professional Plus</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Chaves (uma por linha)</label>
                  <textarea 
                    rows={6}
                    placeholder="Colar chaves aqui, ex:&#10;XXXXX-XXXXX-XXXXX-XXXXX-XXXXX&#10;YYYYY-YYYYY-YYYYY-YYYYY-YYYYY"
                    value={newKeysText}
                    onChange={(e) => setNewKeysText(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', outline: 'none', fontFamily: 'monospace', fontSize: '0.8125rem' }}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={actionLoading !== null}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '0.5rem', 
                    padding: '0.625rem', 
                    backgroundColor: 'var(--primary)', 
                    color: 'white', 
                    borderRadius: '6px', 
                    fontSize: '0.875rem', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    border: 'none',
                    opacity: actionLoading !== null ? 0.7 : 1
                  }}
                >
                  <Plus size={16} />
                  <span>{actionLoading === 'add-keys' ? 'Inserindo...' : 'Cadastrar Chaves'}</span>
                </button>
              </form>
            </div>

          </div>

          {/* Right Column: Inventory Table */}
          <div>
            {/* Filter */}
            <div style={{ display: 'flex', backgroundColor: 'var(--surface)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.5rem', alignItems: 'center', gap: '0.75rem' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Pesquisar por chave ou produto..." 
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                style={{ flex: 1, backgroundColor: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '0.875rem' }}
              />
            </div>

            {/* Keys Table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Chave (Código)</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeys.length > 0 ? (
                      filteredKeys.map((k) => (
                        <tr key={k.id}>
                          <td style={{ fontWeight: '600', fontSize: '0.875rem' }}>{k.product_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{k.key_code}</td>
                          <td>
                            <button 
                              onClick={() => handleDeleteKey(k.id)}
                              disabled={actionLoading !== null}
                              style={{ 
                                padding: '0.375rem', 
                                backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                color: '#ef4444', 
                                borderRadius: '4px', 
                                cursor: 'pointer',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: actionLoading !== null ? 0.7 : 1
                              }}
                              title="Excluir Chave"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                          Nenhuma chave cadastrada em estoque.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="responsive-editor-grid">
          {/* Left: Templates list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>Seus Templates</h3>
                <button 
                  onClick={() => handleSelectTemplate(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: 'transparent', border: 'none', color: 'var(--primary)', fontSize: '0.8125rem', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  <Plus size={14} /> Novo
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {templates.length > 0 ? (
                  templates.map((tpl) => (
                    <div 
                      key={tpl.id}
                      onClick={() => handleSelectTemplate(tpl)}
                      style={{ 
                        padding: '0.75rem', 
                        borderRadius: '6px', 
                        border: '1px solid ' + (editingTemplate?.id === tpl.id ? 'var(--primary)' : 'var(--border)'), 
                        backgroundColor: editingTemplate?.id === tpl.id ? 'rgba(79, 70, 229, 0.05)' : 'var(--surface)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem', color: editingTemplate?.id === tpl.id ? 'var(--primary)' : 'var(--text)' }}>
                        <FileText size={14} /> {tpl.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                        Filtro: {tpl.product_key}
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                    Nenhum template personalizado configurado. O sistema usará os modelos padrões internos.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Template Editor */}
          <div className="card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Edit3 size={18} style={{ color: 'var(--primary)' }} />
              {templateId ? 'Editar Template de E-mail' : 'Criar Novo Template de E-mail'}
            </h3>
            
            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                    Nome do Template (Ex: Windows 11 Pro)
                  </label>
                  <input 
                    type="text" 
                    placeholder="Nome de exibição do template"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', outline: 'none', fontSize: '0.875rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                    Identificador de Produto (Filtro)
                  </label>
                  <input 
                    type="text" 
                    placeholder="Ex: windows 11, office 2024"
                    value={templateProductKey}
                    onChange={(e) => setTemplateProductKey(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.5rem 0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', outline: 'none', fontSize: '0.875rem', fontFamily: 'monospace' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Se o nome do produto no pedido conter esse texto, este template será selecionado.
                  </span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                  Conteúdo HTML das Instruções
                </label>
                <textarea 
                  rows={15}
                  placeholder="Cole ou escreva o corpo HTML do template..."
                  value={templateHtml}
                  onChange={(e) => setTemplateHtml(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.75rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', outline: 'none', fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: '1.4' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  📌 Dica: Insira a tag <strong>{`{licenseKey}`}</strong> exatamente onde você deseja que o código da chave de licença seja inserido automaticamente.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                {templateId && (
                  <button 
                    type="button"
                    onClick={() => handleSelectTemplate(null)}
                    style={{ padding: '0.625rem 1.25rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={actionLoading !== null}
                  style={{ 
                    padding: '0.625rem 1.5rem', 
                    backgroundColor: 'var(--primary)', 
                    color: 'white', 
                    borderRadius: '6px', 
                    fontSize: '0.875rem', 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    border: 'none',
                    opacity: actionLoading !== null ? 0.7 : 1
                  }}
                >
                  {actionLoading === 'save-template' ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .product-list-item-clickable:hover {
          background-color: rgba(79, 70, 229, 0.08);
        }
      `}</style>
    </div>
  );
}
