'use client';

import { useState, useEffect } from 'react';
import { fetchProductCosts, addProductCost, deleteProductCost, updateProductCost } from '@/app/actions';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { ProductCost } from '@/utils/profitCalculator';

export default function SettingsPage() {
  const [costs, setCosts] = useState<ProductCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTerm, setNewTerm] = useState('');
  const [newCost, setNewCost] = useState('');
  const [editingTerm, setEditingTerm] = useState<string | null>(null);
  const [editCostValue, setEditCostValue] = useState('');

  useEffect(() => {
    fetchCosts();
  }, []);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const data = await fetchProductCosts();
      setCosts(data);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm || !newCost) return;
    
    const costNum = parseFloat(newCost);
    if (isNaN(costNum)) return;

    await addProductCost(newTerm, costNum);
    setNewTerm('');
    setNewCost('');
    fetchCosts();
  };

  const handleDelete = async (search_term: string) => {
    await deleteProductCost(search_term);
    fetchCosts();
  };

  const startEdit = (term: string, cost: number) => {
    setEditingTerm(term);
    setEditCostValue(cost.toString());
  };

  const saveEdit = async () => {
    if (!editingTerm) return;
    const costNum = parseFloat(editCostValue);
    if (!isNaN(costNum)) {
      await updateProductCost(editingTerm, costNum);
    }
    setEditingTerm(null);
    fetchCosts();
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Configurações de Custos</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Defina os custos base dos produtos. O sistema usará esses termos de busca para encontrar o custo correto do pedido (ex: "Windows" e "Office"). Se os dois termos estiverem presentes, os custos serão somados.
      </p>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Adicionar Novo Custo</h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Termo de Busca no Produto</label>
            <input type="text" className="input" placeholder="Ex: Windows 11" value={newTerm} onChange={e => setNewTerm(e.target.value)} required />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Custo Base (R$)</label>
            <input type="number" step="0.01" className="input" placeholder="7.00" value={newCost} onChange={e => setNewCost(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ height: '42px' }}>
            <Plus size={18} /> Adicionar
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Custos Cadastrados</h3>
        
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
        ) : costs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Nenhum custo cadastrado.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Termo de Busca</th>
                  <th>Custo (R$)</th>
                  <th style={{ width: '150px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {costs.map(cost => (
                  <tr key={cost.search_term}>
                    <td>{cost.search_term}</td>
                    <td>
                      {editingTerm === cost.search_term ? (
                        <input 
                          type="number" 
                          step="0.01" 
                          className="input" 
                          style={{ width: '100px', padding: '0.25rem 0.5rem' }}
                          value={editCostValue} 
                          onChange={e => setEditCostValue(e.target.value)} 
                          autoFocus
                        />
                      ) : (
                        `R$ ${cost.cost.toFixed(2)}`
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {editingTerm === cost.search_term ? (
                          <>
                            <button onClick={saveEdit} style={{ color: 'var(--success)' }} title="Salvar"><Save size={18} /></button>
                            <button onClick={() => setEditingTerm(null)} style={{ color: 'var(--text-muted)' }} title="Cancelar"><X size={18} /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(cost.search_term, cost.cost)} style={{ color: 'var(--primary)' }} title="Editar"><Edit2 size={18} /></button>
                            <button onClick={() => handleDelete(cost.search_term)} style={{ color: 'var(--danger)' }} title="Excluir"><Trash2 size={18} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
