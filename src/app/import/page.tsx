'use client';

import { useState } from 'react';
import * as xlsx from 'xlsx';
import Papa from 'papaparse';
import { upsertAds, upsertOrders, upsertPayouts, upsertAdsBilling } from '@/app/actions';
import { UploadCloud, CheckCircle, AlertCircle, CreditCard, Receipt } from 'lucide-react';

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

  const handleAdsBillingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);
    const fileName = file.name;

    Papa.parse(file, {
      complete: async (results) => {
        try {
          const data = results.data as string[][];

          // Find the data header row: "Seqüência,Tempo,Descrição,quantidade,Observação"
          const headerIndex = data.findIndex(row =>
            row[0]?.trim() === 'Seqüência' || row[0]?.trim() === 'Sequência'
          );
          if (headerIndex === -1) {
            throw new Error('Formato de CSV inválido: cabeçalho "Seqüência, Tempo, Descrição, quantidade, Observação" não encontrado.');
          }

          const rows = data.slice(headerIndex + 1).filter(row => row.length >= 4 && row[0]?.trim());

          const billingData = rows.map(row => {
            const sequenceNumber = parseInt(row[0]?.trim()) || 0;
            const timeStr = row[1]?.trim() || '';
            const description = row[2]?.trim() || '';
            const amount = parseFloat(row[3]?.trim().replace(',', '.')) || 0;
            const observation = row[4]?.trim() || '-';

            // Parse date from DD/MM/YYYY to YYYY-MM-DD
            let transactionDate = '';
            const dateParts = timeStr.split('/');
            if (dateParts.length === 3) {
              transactionDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
            }

            // Extract "Crédito Pago" and "Crédito Gratuito" from observation
            let creditPaid: number | null = null;
            let creditFree: number | null = null;

            if (observation !== '-') {
              const paidMatch = observation.match(/Cr[eé]dito Pago:\s*([\d.,]+)/i);
              const freeMatch = observation.match(/Cr[eé]dito Gratuito:\s*([\d.,]+)/i);

              if (paidMatch) {
                creditPaid = parseFloat(paidMatch[1].replace(',', '.')) || null;
              }
              if (freeMatch) {
                creditFree = parseFloat(freeMatch[1].replace(',', '.')) || null;
              }
            }

            return {
              sequence_number: sequenceNumber,
              transaction_date: transactionDate,
              description,
              amount,
              observation,
              credit_paid: creditPaid,
              credit_free: creditFree,
              import_file: fileName,
            };
          }).filter(r => r.sequence_number > 0 && r.transaction_date);

          if (billingData.length === 0) {
            throw new Error('Nenhuma transação válida encontrada no CSV.');
          }

          const result = await upsertAdsBilling(billingData);

          if (result.skippedCount > 0 && result.insertedCount === 0) {
            setMessage({
              type: 'success',
              text: `Arquivo já importado anteriormente. Todos os ${result.skippedCount} registros já existem no banco.`
            });
          } else {
            setMessage({
              type: 'success',
              text: `Sucesso! ${result.insertedCount} transações importadas.${result.skippedCount > 0 ? ` ${result.skippedCount} já existentes (ignoradas).` : ''}`
            });
          }
        } catch (error) {
          const err = error as Error;
          setMessage({ type: 'error', text: err.message || 'Erro ao processar arquivo de billing.' });
        } finally {
          setLoading(false);
          e.target.value = '';
        }
      },
      header: false
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

      // Group rows by Order ID to prevent database unique constraint errors for multi-item orders
      const groupedOrdersMap = new Map<string, Record<string, string | number>[]>();
      for (const row of rows) {
        const orderId = String(row['ID do pedido'] || '').trim().toUpperCase();
        if (!orderId) continue;
        if (!groupedOrdersMap.has(orderId)) {
          groupedOrdersMap.set(orderId, []);
        }
        groupedOrdersMap.get(orderId)!.push(row);
      }

      const ordersData = Array.from(groupedOrdersMap.entries()).map(([orderId, orderRows]) => {
        const firstRow = orderRows[0];
        
        // Product name: concatenate product names and variations for all items in the order
        const productNames = Array.from(
          new Set(orderRows.map(row => {
            const prodName = String(row['Nome do Produto'] || '').trim();
            const varName = String(row['Nome da variação'] || '').trim();
            if (varName && varName !== '-' && !prodName.toLowerCase().includes(varName.toLowerCase())) {
              return `${prodName} (Variação: ${varName})`;
            }
            return prodName;
          }))
        ).filter(Boolean).join(' + ');

        // Quantity: sum of quantities of all items in the order
        const totalQuantity = orderRows.reduce(
          (sum, row) => sum + (parseInt(String(row['Quantidade'] || '1')) || 1),
          0
        );

        // Original price: sum of (original price * quantity) for all items in the order
        const totalOriginalPrice = orderRows.reduce((sum, row) => {
          const qty = parseInt(String(row['Quantidade'] || '1')) || 1;
          const price = parseFloat(String(row['Preço original'] || 0)) || 0;
          return sum + (price * qty);
        }, 0);

        // Seller discount: sum of seller discounts
        const totalSellerDiscount = orderRows.reduce(
          (sum, row) => sum + (parseFloat(String(row['Desconto do vendedor'] || 0)) || 0),
          0
        );

        // Order-level values that are repeated across all rows in the group:
        // Cupom do vendedor, Ajuste, Desconto Leve Mais, Comissão, Serviço, Transação, Taxa Envio Reversa
        const cupomVendedor = parseFloat(String(firstRow['Cupom do vendedor'] || 0)) || 0;
        const ajusteComercial = parseFloat(String(firstRow['Ajuste por participação em ação comercial'] || 0)) || 0;
        const descontoLeveMais = parseFloat(String(firstRow['Desconto da Leve Mais por Menos do vendedor'] || 0)) || 0;
        const comissao = parseFloat(String(firstRow['Taxa de comissão líquida'] || 0)) || 0;
        const servico = parseFloat(String(firstRow['Taxa de serviço líquida'] || 0)) || 0;
        const transacao = parseFloat(String(firstRow['Taxa de transação'] || 0)) || 0;
        const taxaEnvioReversa = parseFloat(String(firstRow['Taxa de Envio Reversa'] || 0)) || 0;

        const descontosExtras = cupomVendedor + ajusteComercial + descontoLeveMais;

        // Calculate total product subtotal (original price * quantity) for all items
        const totalProductSubtotal = orderRows.reduce((sum, row) => {
          const qty = parseInt(String(row['Quantidade'] || '1')) || 1;
          const price = parseFloat(String(row['Preço original'] || 0)) || 0;
          return sum + (price * qty);
        }, 0);

        const receitaLiquida = totalProductSubtotal - totalSellerDiscount - descontosExtras - comissao - servico - transacao - taxaEnvioReversa;

        // Determine order status (if any item is cancelled, the entire order is Cancelado)
        let status = 'Desconhecido';
        let isCancelled = false;
        
        for (const row of orderRows) {
          const statusDevolucao = String(row['Status da Devolução / Reembolso'] || '');
          const rowStatus = String(row['Status do pedido'] || 'Desconhecido');
          if (
            statusDevolucao.toLowerCase().includes('solicitação aprovada') ||
            statusDevolucao.toLowerCase().includes('devolução em andamento') ||
            rowStatus.toLowerCase().includes('cancelado')
          ) {
            isCancelled = true;
          }
          if (rowStatus !== 'Desconhecido') {
            status = rowStatus;
          }
        }
        if (isCancelled) {
          status = 'Cancelado';
        }

        let orderDate = '';
        const rawDate = firstRow['Data de criação do pedido'];
        if (rawDate) {
          const parsedDate = new Date(String(rawDate));
          if (!isNaN(parsedDate.getTime())) {
            orderDate = parsedDate.toISOString();
          }
        }
        if (!orderDate) {
          orderDate = new Date().toISOString();
        }

        return {
          order_id: orderId,
          order_date: orderDate,
          product_name: productNames,
          quantity: totalQuantity,
          total_revenue: receitaLiquida,
          commission_fee: comissao,
          service_fee: servico,
          status: status,
          original_price: totalOriginalPrice,
          seller_discount: totalSellerDiscount,
          seller_coupon: descontosExtras,
        };
      });

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

          const orderId = String(row[orderIdCol] || '').trim().toUpperCase();
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
        {/* Orders Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--primary)' }}>
            <UploadCloud size={36} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Planilha de Pedidos</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.8125rem' }}>Arquivo .xlsx de pedidos exportado da Shopee.</p>
          
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            Selecionar Arquivo (XLSX)
            <input type="file" accept=".xlsx" onChange={handleOrdersUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Balance Upload */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2.5rem 2rem' }}>
          <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--success)' }}>
            <CreditCard size={36} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Planilha de Balanço</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.8125rem' }}>Arquivo .xlsx de transações de saldo (payouts).</p>
          
          <label className="btn btn-primary" style={{ cursor: 'pointer', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}>
            Selecionar Balanço (XLSX)
            <input type="file" accept=".xlsx" onChange={handleBalanceUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Ads Billing Upload (NEW) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2.5rem 2rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
          <div style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--warning)' }}>
            <Receipt size={36} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Faturamento de Ads</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.8125rem' }}>
            Histórico de transações de anúncios (recargas e deduções). Arquivo CSV exportado da Shopee Ads.
          </p>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.6875rem', fontStyle: 'italic' }}>
            Duplicatas são ignoradas automaticamente.
          </p>
          
          <label className="btn btn-secondary" style={{ cursor: 'pointer', backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: 'var(--warning)', color: 'var(--warning)' }}>
            Selecionar Billing (CSV)
            <input type="file" accept=".csv" onChange={handleAdsBillingUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Ads Report Upload (old) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '2.5rem 2rem', opacity: 0.6 }}>
          <div style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem', color: 'var(--primary)' }}>
            <UploadCloud size={36} />
          </div>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Relatório de Ads <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(legado)</span></h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.8125rem' }}>CSV de dados gerais de anúncios por produto.</p>
          
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            Selecionar Arquivo (CSV)
            <input type="file" accept=".csv" onChange={handleAdsUpload} disabled={loading} style={{ display: 'none' }} />
          </label>
        </div>
      </div>
    </div>
  );
}
