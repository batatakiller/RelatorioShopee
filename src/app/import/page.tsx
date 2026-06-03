'use client';

import { useState } from 'react';
import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { upsertAds, upsertOrders } from '@/app/actions';
import { UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleAdsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    Papa.parse(file, {
      complete: async (results) => {
        try {
          const data = results.data as string[][];
          
          // Data is expected to have headers around line 8.
          // Let's find the header row index.
          const headerIndex = data.findIndex(row => row[0] === '#' && row[1] === 'Nome do Anúncio');
          if (headerIndex === -1) throw new Error('Formato de CSV inválido: cabeçalhos não encontrados.');

          // Period is on line 6 (index 5)
          const periodRow = data.find(row => row[0] === 'Período');
          const period = periodRow ? periodRow[1] : 'Unknown';

          const headers = data[headerIndex];
          const rows = data.slice(headerIndex + 1).filter(row => row.length > 1 && row[1]); // Ensure it's not an empty row

          const adsData = rows.map(row => {
            return {
              report_period: period,
              ad_name: row[headers.indexOf('Nome do Anúncio')],
              product_id: row[headers.indexOf('ID do produto')] || 'N/A',
              cost: parseFloat((row[headers.indexOf('Despesas')] || '0').replace(',', '.')) || 0,
              cost_per_conversion: parseFloat((row[headers.indexOf('Custo por Conversão')] || '0').replace(',', '.')) || 0,
            };
          });

          // Insert into Supabase using Server Action
          await upsertAds(adsData);

          setMessage({ type: 'success', text: `Sucesso! ${adsData.length} registros de anúncios importados.` });
        } catch (error: any) {
          setMessage({ type: 'error', text: error.message || 'Erro ao processar arquivo.' });
        } finally {
          setLoading(false);
          e.target.value = '';
        }
      },
      header: false // We read as array of arrays since there are meta lines before headers
    });
  };

  const handleOrdersUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet) as any[];

      const ordersData = rows.map(row => {
        const precoOriginal = parseFloat(row['Preço original'] || 0) || 0;
        const descontoVendedor = parseFloat(row['Desconto do vendedor'] || 0) || 0;
        const cupomVendedor = parseFloat(row['Cupom do vendedor'] || 0) || 0;
        const ajusteComercial = parseFloat(row['Ajuste por participação em ação comercial'] || 0) || 0;
        const descontoLeveMais = parseFloat(row['Desconto da Leve Mais por Menos do vendedor'] || 0) || 0;
        const comissao = parseFloat(row['Taxa de comissão líquida'] || 0) || 0;
        const servico = parseFloat(row['Taxa de serviço líquida'] || 0) || 0;
        const transacao = parseFloat(row['Taxa de transação'] || 0) || 0;
        const taxaEnvioReversa = parseFloat(row['Taxa de Envio Reversa'] || 0) || 0;
        
        const descontosExtras = cupomVendedor + ajusteComercial + descontoLeveMais;
        const receitaLiquida = precoOriginal - descontoVendedor - descontosExtras - comissao - servico - transacao - taxaEnvioReversa;

        return {
          order_id: row['ID do pedido'],
          order_date: new Date(row['Data de criação do pedido']).toISOString(),
          product_name: row['Nome do Produto'],
          quantity: parseInt(row['Quantidade']) || 1,
          total_revenue: receitaLiquida,
          commission_fee: comissao,
          service_fee: servico,
          status: row['Status do pedido'] || 'Desconhecido',
          original_price: precoOriginal,
          seller_discount: descontoVendedor,
          seller_coupon: descontosExtras,
        };
      }).filter(order => order.order_id); // Filter out empty rows

      // Upsert into Supabase using Server Action
      await upsertOrders(ordersData);

      setMessage({ type: 'success', text: `Sucesso! ${ordersData.length} pedidos importados.` });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erro ao processar arquivo.' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>Importar Dados</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        Faça o upload dos relatórios exportados da Shopee. O sistema irá processar e atualizar os dados automaticamente evitando duplicidades.
      </p>

      {message && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '8px', marginBottom: '2rem',
          backgroundColor: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          color: message.type === 'success' ? 'var(--success)' : 'var(--danger)'
        }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Orders Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem' }}>
          <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--primary)' }}>
            <UploadCloud size={40} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Planilha de Pedidos</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Faça upload do arquivo .xlsx exportado da Shopee contendo todos os pedidos.</p>
          
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            Selecionar Arquivo (XLSX)
            <input type="file" accept=".xlsx" onChange={handleOrdersUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Ads Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem' }}>
          <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--primary)' }}>
            <UploadCloud size={40} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Relatório de Ads (CSV)</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Faça upload do arquivo .csv de anúncios (Dados Gerais de Anúncios Shopee).</p>
          
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Selecionar Arquivo (CSV)
            <input type="file" accept=".csv" onChange={handleAdsUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    </div>
  );
}
