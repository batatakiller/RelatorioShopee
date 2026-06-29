'use client';

import { useEffect, useState } from 'react';
import { 
  fetchLeadsAndKeys, 
  addLicenseKeys, 
  approveLead, 
  deleteLead, 
  deleteLicenseKey, 
  checkEmailReplies 
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
  Inbox
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

export default function LeadsDashboard() {
  const [activeTab, setActiveTab] = useState<'leads' | 'keys'>('leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [importedOrderIds, setImportedOrderIds] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [syncingIMAP, setSyncingIMAP] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Forms states
  const [newKeyProduct, setNewKeyProduct] = useState('Windows 11 Pro');
  const [newKeysText, setNewKeysText] = useState('');
  const [keySearch, setKeySearch] = useState('');
  const [leadSearch, setLeadSearch] = useState('');

  const loadData = async () => {
    try {
      const res = await fetchLeadsAndKeys();
      setLeads(res.leads as Lead[]);
      setKeys(res.keys as LicenseKey[]);
      setImportedOrderIds(res.importedOrderIds);
    } catch (err) {
      console.error('Error loading leads/keys:', err);
    } finally {
      setLoading(false);
    }
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
    return importedOrderIds.includes(orderId);
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
        )}
      </div>

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
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{lead.email}</td>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'start' }}>
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
                    <div key={prod} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{prod}</span>
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
