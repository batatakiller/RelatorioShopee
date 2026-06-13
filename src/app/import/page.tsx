'use client';

import { useState } from 'react';
import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { upsertAds, upsertOrders, upsertPayouts } from '@/app/actions';
import { UploadCloud, CheckCircle, AlertCircle, CreditCard } from 'lucide-react';

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
        } catch (error) {
          const err = error as Error;
          setMessage({ type: 'error', text: err.message || 'Erro ao processar arquivo.' });
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

      const rows = xlsx.utils.sheet_to_json(sheet) as Record<string, string | number>[];

      const ordersData = rows.map(row => {
        const quantidade = parseInt(String(row['Quantidade'] || '1')) || 1;
        const precoOriginal = parseFloat(String(row['Preço original'] || 0)) || 0;
        const descontoVendedor = parseFloat(String(row['Desconto do vendedor'] || 0)) || 0;
        const cupomVendedor = parseFloat(String(row['Cupom do vendedor'] || 0)) || 0;
        const ajusteComercial = parseFloat(String(row['Ajuste por participação em ação comercial'] || 0)) || 0;
        const descontoLeveMais = parseFloat(String(row['Desconto da Leve Mais por Menos do vendedor'] || 0)) || 0;
        const comissao = parseFloat(String(row['Taxa de comissão líquida'] || 0)) || 0;
        const servico = parseFloat(String(row['Taxa de serviço líquida'] || 0)) || 0;
        const transacao = parseFloat(String(row['Taxa de transação'] || 0)) || 0;
        const taxaEnvioReversa = parseFloat(String(row['Taxa de Envio Reversa'] || 0)) || 0;
        
        const descontosExtras = cupomVendedor + ajusteComercial + descontoLeveMais;
        const receitaLiquida = (precoOriginal * quantidade) - descontoVendedor - descontosExtras - comissao - servico - transacao - taxaEnvioReversa;

        const statusDevolucao = String(row['Status da Devolução / Reembolso'] || '');
        let status = String(row['Status do pedido'] || 'Desconhecido');
        if (
          statusDevolucao.toLowerCase().includes('solicitação aprovada') ||
          statusDevolucao.toLowerCase().includes('devolução em andamento')
        ) {
          status = 'Cancelado';
        }

        return {
          order_id: String(row['ID do pedido'] || ''),
          order_date: new Date(String(row['Data de criação do pedido'])).toISOString(),
          product_name: String(row['Nome do Produto'] || ''),
          quantity: quantidade,
          total_revenue: receitaLiquida,
          commission_fee: comissao,
          service_fee: servico,
          status: status,
          original_price: precoOriginal,
          seller_discount: descontoVendedor,
          seller_coupon: descontosExtras,
        };
      }).filter(order => order.order_id); // Filter out empty rows

      // Upsert into Supabase using Server Action
      await upsertOrders(ordersData);

      setMessage({ type: 'success', text: `Sucesso! ${ordersData.length} pedidos importados.` });
    } catch (error) {
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Erro ao processar arquivo.' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleBalanceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const buffer = await file.arrayBuffer();
      // Ensure we parse dates correctly by passing cellDates: true
      const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | boolean | Date | null | undefined)[][];

      // Find header row containing ID do pedido, Valor, and Data
      const headerIndex = data.findIndex(row => 
        row && row.includes('ID do pedido') && row.includes('Valor') && row.includes('Data')
      );

      if (headerIndex === -1) {
        throw new Error('Formato inválido: a planilha de balanço deve conter colunas com cabeçalhos "ID do pedido", "Valor" e "Data".');
      }

      const headers = data[headerIndex];
      const orderIdCol = headers.indexOf('ID do pedido');
      const valueCol = headers.indexOf('Valor');
      const dateCol = headers.indexOf('Data');

      const rows = data.slice(headerIndex + 1);

      const payoutsData = rows
        .map(row => {
          if (!row || row.length === 0) return null;

          const orderId = String(row[orderIdCol] || '').trim();
          if (!orderId || orderId === '-') return null;

          let amount = 0;
          const rawValue = row[valueCol];
          if (typeof rawValue === 'number') {
            amount = rawValue;
          } else if (typeof rawValue === 'string') {
            amount = parseFloat(rawValue.replace(',', '.')) || 0;
          }

          let payoutDateStr = '';
          const rawDate = row[dateCol];
          if (rawDate instanceof Date) {
            payoutDateStr = rawDate.toISOString();
          } else if (typeof rawDate === 'number') {
            try {
              // Parse Excel date code
              const dateObj = xlsx.SSF.parse_date_code(rawDate);
              const jsDate = new Date(dateObj.y, dateObj.m - 1, dateObj.d, dateObj.H, dateObj.M, dateObj.S);
              payoutDateStr = jsDate.toISOString();
            } catch {
              payoutDateStr = new Date(rawDate).toISOString();
            }
          } else if (rawDate) {
            const parsedDate = new Date(String(rawDate).trim());
            if (!isNaN(parsedDate.getTime())) {
              payoutDateStr = parsedDate.toISOString();
            } else {
              payoutDateStr = String(rawDate).trim();
            }
          }

          if (!payoutDateStr) {
            payoutDateStr = new Date().toISOString();
          }

          return {
            order_id: orderId,
            payout_amount: amount,
            payout_date: payoutDateStr,
          };
        })
        .filter((item): item is { order_id: string; payout_amount: number; payout_date: string } => 
          item !== null && !!item.order_id && item.order_id !== '-'
        );

      if (payoutsData.length === 0) {
        throw new Error('Nenhum recebimento válido encontrado na planilha.');
      }

      const res = await upsertPayouts(payoutsData);

      setMessage({ 
        type: 'success', 
        text: `Sucesso! Planilha de balanço importada. Atualizados: ${res.updatedCount} pedidos. Novos não encontrados (sinalizados): ${res.insertedCount} pedidos.` 
      });
    } catch (error) {
      console.error(error);
      const err = error as Error;
      setMessage({ type: 'error', text: err.message || 'Erro ao processar arquivo de balanço.' });
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
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

        {/* Balance Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem' }}>
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--success)' }}>
            <CreditCard size={40} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Planilha de Balanço</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Faça upload do arquivo .xlsx de transações de saldo (payouts e recebimentos).</p>
          
          <label className="btn btn-primary" style={{ cursor: 'pointer', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}>
            Selecionar Balanço (XLSX)
            <input type="file" accept=".xlsx" onChange={handleBalanceUpload} disabled={loading} style={{ display: 'none' }} />
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
