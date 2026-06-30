'use server';

import { createClient } from '@supabase/supabase-js';
import { Order, AdData, ProductCost, AdsBillingRecord, AdsBillingDaily, SupplierPayment } from '@/utils/profitCalculator';
import { headers } from 'next/headers';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Initialize server-side supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

function findMatchingKey(orderProductName: string, keys: any[]): any | null {
  const prodLower = orderProductName.toLowerCase();
  
  // 1. Check for Office products
  if (prodLower.includes('office')) {
    if (prodLower.includes('2024')) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2024'));
      if (match) return match;
    }
    if (prodLower.includes('2021')) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2021'));
      if (match) return match;
    }
    if (prodLower.includes('2016')) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2016'));
      if (match) return match;
    }
  }

  // 2. Check for Windows products
  if (prodLower.includes('windows')) {
    if (prodLower.includes('11')) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('windows') && k.product_name.toLowerCase().includes('11'));
      if (match) return match;
    }
    if (prodLower.includes('10')) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('windows') && k.product_name.toLowerCase().includes('10'));
      if (match) return match;
    }
  }

  // 3. Fallback: standard includes search (either way)
  return keys.find(k => 
    prodLower.includes(k.product_name.toLowerCase()) || 
    k.product_name.toLowerCase().includes(prodLower)
  ) || null;
}

export async function fetchDashboardData() {
  try {
    const [ordersRes, adsRes, costsRes, billingRes, supplierPaymentsRes] = await Promise.all([
      supabase.from('shopee_orders').select('*').order('order_date', { ascending: true }),
      supabase.from('shopee_ads').select('*'),
      supabase.from('product_costs').select('*'),
      supabase.from('shopee_ads_billing').select('*').order('transaction_date', { ascending: true }),
      supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false })
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (adsRes.error) throw adsRes.error;
    if (costsRes.error) throw costsRes.error;
    // billing table might not exist yet — treat as empty
    const billingData = billingRes.error ? [] : (billingRes.data as AdsBillingRecord[] || []);
    // supplier_payments table might not exist yet — treat as empty
    const supplierPayments = (supplierPaymentsRes && !supplierPaymentsRes.error) ? (supplierPaymentsRes.data as SupplierPayment[] || []) : [];

    // Aggregate billing data by day (only deductions = negative amounts)
    const dailyMap = new Map<string, AdsBillingDaily>();
    let totalRechargesPaid = 0;
    let totalFreeCredits = 0;

    for (const record of billingData) {
      const dateStr = record.transaction_date; // DATE format: YYYY-MM-DD
      if (record.amount < 0) {
        // Deduction (actual ad spend)
        const existing = dailyMap.get(dateStr);
        if (existing) {
          existing.total_spent += Math.abs(record.amount);
        } else {
          dailyMap.set(dateStr, { date: dateStr, total_spent: Math.abs(record.amount) });
        }
      } else {
        // Recharge — track real money invested
        if (record.credit_paid !== null && record.credit_paid !== undefined) {
          totalRechargesPaid += record.credit_paid;
          totalFreeCredits += (record.credit_free || 0);
        } else {
          totalRechargesPaid += record.amount;
        }
      }
    }

    return {
      orders: ordersRes.data as Order[] || [],
      ads: adsRes.data as AdData[] || [],
      costs: costsRes.data as ProductCost[] || [],
      adsBillingDaily: Array.from(dailyMap.values()),
      totalRechargesPaid,
      totalFreeCredits,
      supplierPayments,
    };
  } catch (error) {
    console.error('Error in fetchDashboardData:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to fetch dashboard data');
  }
}

export async function addSupplierPayment(amount: number, dateStr: string, notes: string) {
  try {
    const { data, error } = await supabase
      .from('supplier_payments')
      .insert([{ 
        amount: amount, 
        payment_date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString(), 
        notes: notes 
      }])
      .select();
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error in addSupplierPayment:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to add supplier payment');
  }
}

export async function deleteSupplierPayment(id: string) {
  try {
    const { error } = await supabase
      .from('supplier_payments')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in deleteSupplierPayment:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to delete supplier payment');
  }
}

export async function upsertAds(adsData: unknown[]) {
  try {
    const { error } = await supabase.from('shopee_ads').upsert(adsData, { onConflict: 'report_period, product_id' });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in upsertAds:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to upsert ads');
  }
}

export async function upsertOrders(ordersData: unknown[]) {
  try {
    const typedOrders = ordersData as { product_name: string }[];
    
    // 1. Fetch existing product costs
    const { data: existingCosts, error: costsError } = await supabase
      .from('product_costs')
      .select('search_term');
    
    if (costsError) {
      console.error('Error fetching product costs in upsertOrders:', costsError);
    } else {
      // 2. Identify unique product names in the imported orders that have no matching cost terms
      const costTerms = existingCosts || [];
      const unmatchedNames = new Set<string>();

      for (const order of typedOrders) {
        if (!order.product_name) continue;
        const lowerName = order.product_name.toLowerCase();
        
        // Check if this product name matches any existing search term
        const isMatched = costTerms.some(item => 
          lowerName.includes(item.search_term.toLowerCase())
        );

        if (!isMatched) {
          unmatchedNames.add(order.product_name.trim());
        }
      }

      // 3. Insert unmatched product names into product_costs table with cost = 0.00
      if (unmatchedNames.size > 0) {
        const insertData = Array.from(unmatchedNames).map(name => ({
          search_term: name,
          cost: 0.00
        }));

        const { error: insertError } = await supabase
          .from('product_costs')
          .upsert(insertData, { 
            onConflict: 'search_term', 
            ignoreDuplicates: true 
          });

        if (insertError) {
          console.error('Error auto-inserting missing product costs:', insertError);
        } else {
          console.log(`Auto-inserted ${insertData.length} missing product costs with zero value.`);
        }
      }
    }

    // 4. Proceed with upserting the orders
    const { error } = await supabase.from('shopee_orders').upsert(ordersData, { onConflict: 'order_id' });
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in upsertOrders:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to upsert orders');
  }
}

export async function upsertPayouts(payoutsData: { order_id: string; payout_amount: number; payout_date: string }[]) {
  try {
    if (payoutsData.length === 0) return { success: true, updatedCount: 0, insertedCount: 0 };

    const orderIds = payoutsData.map(p => p.order_id);
    
    // Fetch all NOT NULL columns and existing payout details to prevent overwriting
    const { data: existingOrders, error: fetchError } = await supabase
      .from('shopee_orders')
      .select('order_id, order_date, product_name, quantity, total_revenue, commission_fee, service_fee, status, original_price, seller_discount, seller_coupon, payout_amount, payout_date')
      .in('order_id', orderIds);

    if (fetchError) throw fetchError;

    const existingMap = new Map(existingOrders?.map(o => [o.order_id, o]) || []);

    const existingUpdates = [];
    const newInserts = [];

    for (const payout of payoutsData) {
      const existing = existingMap.get(payout.order_id);
      if (existing) {
        // Skip updating if the order is cancelled
        if (existing.status?.toLowerCase().includes('cancelado')) {
          continue;
        }
        // Only update if it doesn't already have payout details recorded (keep what is already imported)
        if (existing.payout_amount === null || existing.payout_amount === undefined) {
          existingUpdates.push({
            ...existing,
            payout_amount: payout.payout_amount,
            payout_date: payout.payout_date,
            payout_unmatched: false
          });
        }
      } else {
        newInserts.push({
          order_id: payout.order_id,
          order_date: payout.payout_date,
          product_name: 'Não Encontrado (Balanço)',
          quantity: 0,
          total_revenue: 0.0,
          status: 'Desconhecido',
          payout_amount: payout.payout_amount,
          payout_date: payout.payout_date,
          payout_unmatched: true
        });
      }
    }

    if (existingUpdates.length > 0) {
      const { error: updateError } = await supabase
        .from('shopee_orders')
        .upsert(existingUpdates, { onConflict: 'order_id' });
      if (updateError) throw updateError;
    }

    if (newInserts.length > 0) {
      const { error: insertError } = await supabase
        .from('shopee_orders')
        .upsert(newInserts, { onConflict: 'order_id' });
      if (insertError) throw insertError;
    }

    return { 
      success: true, 
      updatedCount: existingUpdates.length, 
      insertedCount: newInserts.length 
    };
  } catch (error) {
    console.error('Error in upsertPayouts:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to upsert payouts');
  }
}

export async function fetchProductCosts() {
  try {
    const { data, error } = await supabase.from('product_costs').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data as ProductCost[] || [];
  } catch (error) {
    console.error('Error in fetchProductCosts:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to fetch product costs');
  }
}

export async function addProductCost(newTerm: string, costNum: number) {
  try {
    const { error } = await supabase.from('product_costs').insert([{ search_term: newTerm, cost: costNum }]);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in addProductCost:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to add product cost');
  }
}

export async function deleteProductCost(searchTerm: string) {
  try {
    const { error } = await supabase.from('product_costs').delete().eq('search_term', searchTerm);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in deleteProductCost:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to delete product cost');
  }
}

export async function updateProductCost(editingTerm: string, costNum: number) {
  try {
    const { error } = await supabase.from('product_costs').update({ cost: costNum }).eq('search_term', editingTerm);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in updateProductCost:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to update product cost');
  }
}

export async function upsertAdsBilling(billingData: Omit<AdsBillingRecord, 'id'>[]) {
  try {
    if (billingData.length === 0) return { success: true, insertedCount: 0, skippedCount: 0 };

    const dates = billingData.map(r => r.transaction_date).filter(Boolean);
    if (dates.length === 0) return { success: true, insertedCount: 0, skippedCount: 0 };

    const minDate = dates.reduce((min, d) => d < min ? d : min, dates[0]);
    const maxDate = dates.reduce((max, d) => d > max ? d : max, dates[0]);

    // Delete existing records in this date range to prevent duplicates and double counting
    const { error: deleteError } = await supabase
      .from('shopee_ads_billing')
      .delete()
      .gte('transaction_date', minDate)
      .lte('transaction_date', maxDate);

    if (deleteError) throw deleteError;

    // Insert all records from the CSV file
    const { error: insertError } = await supabase
      .from('shopee_ads_billing')
      .insert(billingData);

    if (insertError) throw insertError;

    return { 
      success: true, 
      insertedCount: billingData.length, 
      skippedCount: 0 
    };
  } catch (error) {
    console.error('Error in upsertAdsBilling:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to import ads billing data');
  }
}

// ─── LEAD & LICENSE KEY ACTIONS ──────────────────────────────────

export async function saveLeadAndSendKey(
  orderId: string,
  name: string,
  email: string,
  selectedProduct?: string
) {
  try {
    const orderIdClean = orderId.trim();
    const nameClean = name.trim();
    const emailClean = email.trim();

    // 0. Check if a lead for this order has already been registered
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('order_id', orderIdClean)
      .maybeSingle();

    let isUpdatingPending = false;

    if (existingLead) {
      // If the lead exists but was pending verification and now the product is chosen,
      // allow updating the product name and dispatching the key.
      if (existingLead.status === 'pending_verification' && selectedProduct) {
        isUpdatingPending = true;
      } else {
        return { 
          success: true, 
          status: existingLead.status, 
          lead: existingLead,
          isDuplicate: true,
          message: `Este pedido já foi resgatado anteriormente para o e-mail: ${existingLead.email}`
        };
      }
    }

    // 1. Search for order in database
    const { data: order, error: orderError } = await supabase
      .from('shopee_orders')
      .select('*')
      .eq('order_id', orderIdClean)
      .maybeSingle();

    let matchedProductName = selectedProduct || '';
    let isOrderFound = false;

    if (order && !orderError) {
      matchedProductName = order.product_name;
      isOrderFound = true;
    }

    // 2. Try to find a matching key
    let licenseKeyText = '';
    let statusVal = 'pending_verification';

    // We ONLY attempt automatic key dispatch if the order was officially found/imported
    if (isOrderFound) {
      statusVal = 'pending_key'; // default if no key is in stock

      const { data: availableKeys } = await supabase
        .from('license_keys')
        .select('*')
        .eq('is_used', false);

      const keysList = availableKeys || [];
      const matchedKey = findMatchingKey(matchedProductName, keysList);

      if (matchedKey) {
        licenseKeyText = matchedKey.key_code;
        statusVal = 'sent';
      }
    } else {
      statusVal = 'pending_verification';
    }

    // 3. Save or update lead in database
    let newLead;
    if (isUpdatingPending && existingLead) {
      const { data: updatedLead, error: leadError } = await supabase
        .from('leads')
        .update({
          product_name: matchedProductName,
          license_key: licenseKeyText || null,
          status: statusVal
        })
        .eq('id', existingLead.id)
        .select()
        .single();

      if (leadError) throw leadError;
      newLead = updatedLead;
    } else {
      const { data: insertedLead, error: leadError } = await supabase
        .from('leads')
        .insert([{
          order_id: orderIdClean,
          name: nameClean,
          email: emailClean,
          product_name: matchedProductName,
          license_key: licenseKeyText || null,
          status: statusVal
        }])
        .select()
        .single();

      if (leadError) throw leadError;
      newLead = insertedLead;
    }

    // 4. Send email if status is 'sent'
    if (statusVal === 'sent' && licenseKeyText) {
      const hostHeaders = await headers();
      const host = hostHeaders.get('host') || 'localhost:3000';
      const baseUrl = host.includes('localhost')
        ? `http://${host}`
        : 'https://resgatar.supersoftware.info';

      await sendActivationEmail({
        email: emailClean,
        name: nameClean,
        orderId: orderIdClean,
        productName: matchedProductName,
        licenseKey: licenseKeyText,
        leadId: newLead.id,
        baseUrl
      });
    } else if (statusVal === 'pending_key') {
      await sendAdminAlertEmail(matchedProductName, orderIdClean);
    }

    return { success: true, status: statusVal, lead: newLead };
  } catch (error) {
    console.error('Error in saveLeadAndSendKey:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to save lead and deliver key');
  }
}

function getProductInstructions(prodName: string, licenseKey: string): string {
  const name = prodName.toLowerCase();
  
  if (name.includes('office 2024')) {
    return `
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 15px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">Obrigado por adquirir o Office 2024 Pro Plus!</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">${licenseKey}</span></p>
        <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li>• <strong>Licença:</strong> 1 dispositivo (uso vitalício)</li>
          <li>• <strong>Método de Instalação:</strong> Download Digital</li>
        </ul>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">1. Remova versões anteriores do Office</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Se houver qualquer versão do Office instalada em seu computador — incluindo outras versões do Office 2024 —, desinstale completamente antes de prosseguir.
        </p>
        <p style="margin: 5px 0; font-size: 14px; color: #1a202c; font-weight: bold;">✔️ Isso evita erros e conflitos durante a nova instalação.</p>
        <div style="background-color: #edf2f7; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">2. Reinicie o computador</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Após a desinstalação, reinicie a máquina para que as alterações tenham efeito.
        </p>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">3. Baixe o Office 2024 Pro Plus</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Acesse o link abaixo e faça o download.
        </p>
        <p style="margin: 10px 0; font-size: 14px; font-weight: bold;">
          👉 <a href="https://supersoftware.info/office/office2024.exe" style="color: #4f46e5; text-decoration: underline;">Clique aqui para baixar</a>
        </p>
        <p style="margin: 5px 0; font-size: 12px; color: #718096; word-break: break-all;">
          (Caso o link não abra, copie o endereço abaixo e cole na barra de sites do seu navegador):<br>
          <code>https://supersoftware.info/office/office2024.exe</code>
        </p>
        <p style="margin: 5px 0; font-size: 13px; color: #718096;">
          <em>Obs.: Ao clicar no link, o download começará automaticamente.</em>
        </p>
        <div style="background-color: #f7fafc; border: 1px dashed #cbd5e0; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Após baixar:</strong><br>
          Dê um duplo clique em <strong>'office2024.exe'</strong> para iniciar a instalação.<br>
          Uma janela de instalação será aberta. (Isso pode levar alguns minutos dependendo da sua internet).<br>
          Ao finalizar, clique em Fechar.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">4. Ative o Office (obrigatório)</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Abra o Word.<br>
          Vá em <strong>Arquivo</strong> (ou Ficheiros) &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos exibida acima. Feche o Word e abra novamente.
        </p>
        <div style="background-color: #fffaf0; border: 1px solid #feebc8; padding: 12px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #744210;">
          <strong>⚠️ IMPORTANTE - Ativação por telefone:</strong><br>
          Quando aparecer a tela do Assistente de Ativação:<br>
          • Selecione <strong>"Pretendo ativar o software por telefone"</strong> e clique em Seguinte.<br>
          • Tire uma foto ou captura de tela dessa tela e envie para nós.<br>
          Faremos a ativação para você em segundos!
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">5. Confirme a ativação</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Feche todos os programas do Office. Abra o Word novamente, vá em Conta e verifique se aparece a mensagem: <strong>"Produto ativado"</strong>.<br>
          Ative sua chave até 30 dias, conforme recomendação da Microsoft.
        </p>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>
    `;
  }
  
  if (name.includes('windows')) {
    const isWindows11 = name.includes('11');
    const winName = isWindows11 ? 'Windows 11 Pro' : 'Windows 10 Pro';
    return `
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Instruções para ativação do ${winName}</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">${licenseKey}</span></p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
        
        <ul style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.8; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li style="margin-bottom: 8px;">👉 Clique no <strong>Menu Iniciar</strong></li>
          <li style="margin-bottom: 8px;">👉 Vá em <strong>Configurações ⚙️</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Sistema</strong></li>
          <li style="margin-bottom: 8px;">👉 Selecione <strong>Ativação</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Alterar chave do produto</strong></li>
          <li style="margin-bottom: 8px;">👉 Digite a chave do Windows Pro (25 caracteres) indicada acima</li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Avançar → Ativar</strong></li>
          <li style="margin-bottom: 8px;">👉 Aguarde a mensagem de ativação concluída ✅</li>
        </ul>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        
        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>
    `;
  }
  
  // Office 2016 and 2021
  const isOffice2016 = name.includes('2016');
  const officeName = isOffice2016 ? 'Office 2016 Pro Plus' : 'Office 2021 Pro Plus';
  return `
    <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
      <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Obrigado por comprar a chave do ${officeName}!</h3>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">${licenseKey}</span></p>
      <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
        <li>• <strong>Método de entrega:</strong> Download Digital</li>
        <li>• <strong>Licença:</strong> 1 Dispositivo</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
      
      <ol style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
        <li style="margin-bottom: 10px;">
          Para instalação e ativação correta, siga estritamente os passos descritos abaixo para que venha a obter êxito em todo o processo de instalação e ativação.
        </li>
        <li style="margin-bottom: 10px;">
          Caso tenha qualquer versão do Office instalado em sua máquina, mesmo que seja uma versão 2021, deverá desinstalá-la completamente.
        </li>
        <li style="margin-bottom: 10px; font-weight: bold; color: #e53e3e;">
          Desinstale seu Office de qualquer versão para evitar erros e conflitos de incompatibilidade.
        </li>
        <li style="margin-bottom: 10px; list-style-type: none; background-color: #edf2f7; padding: 10px; border-radius: 6px; font-size: 13px;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </li>
        <li style="margin-bottom: 10px;">
          Baixe o Office no link abaixo: (Obs.: Botão Azul "Download", e depois "FAZER DOWNLOAD ASSIM MESMO")<br>
          👉 <a href="https://bit.ly/MicrosoftOffice2021Pro" style="color: #4f46e5; text-decoration: underline; font-weight: bold;">Clique aqui para baixar o instalador</a>
        </li>
        <li style="margin-bottom: 10px;">
          Clique com o botão direito no arquivo “Office 2021 Pro Plus”, selecione “Abrir com” &gt; “Windows Explorer”, abra a pasta “64bits” e dê um duplo clique em “Instalar” para iniciar a instalação.
        </li>
        <li style="margin-bottom: 10px;">
          Depois de instalado, clique em fechar e abra qualquer aplicativo do Office (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abra o Word e vá em <strong>Arquivo</strong> &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos indicada acima e depois clique em <strong>Ativar</strong>.
        </li>
        <li style="margin-bottom: 10px;">
          Clique em fechar, encerre o aplicativo e abra-o novamente (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abrirá uma janela do <strong>ASSISTENTE PARA ATIVAÇÃO</strong>, clique no botão "Avançar". Sua chave de produto agora está ativada em seu computador!
        </li>
      </ol>
      
      <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; padding: 10px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #0d9488; text-align: center; font-weight: bold;">
        OBS: Feche tudo e abra novamente o Word, clique em CONTA para ver a mensagem "PRODUTO ATIVADO"
      </div>
      
      <ul style="padding-left: 20px; font-size: 13px; color: #4a5568; margin-top: 15px;">
        <li>📌 Recomendamos ativar o produto em até 7 dias após o recebimento.</li>
        <li>📩 Qualquer dúvida, fale conosco antes de abrir reclamação.</li>
        <li>✅ Oferecemos suporte gratuito à instalação.</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
        <strong>📞 Suporte Técnico Especializado:</strong><br>
        Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
        🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
        •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
        Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
      </div>
    </div>
  `;
}

async function sendActivationEmail(params: {
  email: string;
  name: string;
  orderId: string;
  productName: string;
  licenseKey: string;
  leadId: string;
  baseUrl: string;
}) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
      user: 'pedido@supersoftware.info',
      pass: 'Batata2025$'
    }
  });

  // 1. Fetch matching template from DB
  const { data: dbTemplates } = await supabase
    .from('email_templates')
    .select('*');

  const templatesList = dbTemplates || [];
  const matchedTemplate = templatesList.find(t => 
    params.productName.toLowerCase().includes(t.product_key.toLowerCase())
  );

  // We hide the plain text license key from the email, rendering a link instead
  const secureKeyLink = `<span style="background-color: #e0e7ff; padding: 4px 8px; border-radius: 4px; border: 1px dashed #818cf8; color: #4f46e5; font-weight: bold; font-family: sans-serif; font-size: 14px;"><a href="${params.baseUrl}/licenca?id=${params.leadId}" style="color: #4f46e5; text-decoration: none;">🔑 Revelar Chave de Ativação</a></span>`;

  let instructionsHtml = '';
  if (matchedTemplate) {
    instructionsHtml = matchedTemplate.template_html.replace(/{licenseKey}/g, secureKeyLink);
  } else {
    instructionsHtml = getProductInstructions(params.productName, secureKeyLink);
  }

  const mailOptions = {
    from: '"SuperSoftware - Entrega de Licenças" <pedido@supersoftware.info>',
    to: params.email,
    subject: `Sua Chave de Ativação - Pedido #${params.orderId}`,
    headers: {
      'List-Unsubscribe': `<mailto:unsubscribe@supersoftware.info>, <${params.baseUrl}/descadastro>`
    },
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1a202c;">
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Olá, ${params.name}!</h2>
        <p>Sua licença da SuperSoftware foi gerada com sucesso para o seu pedido da Shopee.</p>
        
        ${instructionsHtml}

        <div style="margin: 25px 0; border: 2px solid #feebc8; background-color: #fffaf0; border-radius: 6px; padding: 15px;">
          <p style="margin: 0; font-weight: bold; color: #c05621;">📩 ATENÇÃO - IMPORTANTE PARA GARANTIR O RECEBIMENTO:</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #744210;">
            Para garantir que você receba futuras chaves e ofertas na sua caixa de entrada, 
            <strong>adicione o e-mail <a href="mailto:pedido@supersoftware.info">pedido@supersoftware.info</a> aos seus contatos</strong> 
            ou marque este e-mail como "Não é spam".
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px;">
          <p style="font-size: 14px; margin-bottom: 15px; color: #4a5568;">Sua chave de ativação e as instruções completas de instalação estão prontas no portal seguro:</p>
          <a href="${params.baseUrl}/licenca?id=${params.leadId}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.15);">
            Visualizar Chave e Instruções
          </a>
        </div>

        <p style="font-size: 12px; color: #a0aec0; margin-top: 40px; text-align: center;">
          SuperSoftware - Licenciamento Oficial Microsoft<br>
          <a href="mailto:pedido@supersoftware.info" style="color: #4f46e5;">pedido@supersoftware.info</a> | <a href="https://www.supersoftware.info" style="color: #4f46e5;">www.supersoftware.info</a>
        </p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

export async function getLeadLicenseInfo(leadId: string) {
  try {
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) {
      throw new Error('Licença não localizada no sistema. Caso tenha dúvidas, contate o suporte.');
    }

    // Auto-confirm receipt upon viewing the license page
    if (lead.status !== 'recebido') {
      await supabase
        .from('leads')
        .update({ status: 'recebido' })
        .eq('id', leadId);
    }

    // Fetch matching email template for instruction content
    const { data: dbTemplates } = await supabase
      .from('email_templates')
      .select('*');

    const templatesList = dbTemplates || [];
    const matchedTemplate = templatesList.find(t => 
      lead.product_name.toLowerCase().includes(t.product_key.toLowerCase())
    );

    let instructionsHtml = '';
    if (matchedTemplate) {
      // Re-inject the license key into template
      instructionsHtml = matchedTemplate.template_html.replace(/{licenseKey}/g, lead.license_key || 'Aguardando liberação de estoque');
    } else {
      instructionsHtml = getProductInstructions(lead.product_name, lead.license_key || 'Aguardando liberação de estoque');
    }

    return {
      success: true,
      lead: {
        name: lead.name,
        productName: lead.product_name,
        licenseKey: lead.license_key || 'Aguardando liberação de estoque',
        orderId: lead.order_id,
        status: lead.status
      },
      instructionsHtml
    };
  } catch (error) {
    console.error('Error in getLeadLicenseInfo:', error);
    const err = error as Error;
    throw new Error(err.message || 'Erro ao carregar informações da licença');
  }
}

async function sendAdminAlertEmail(productName: string, orderId: string) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: {
      user: 'pedido@supersoftware.info',
      pass: 'Batata2025$'
    }
  });

  const mailOptions = {
    from: '"Alerta de Estoque - SuperSoftware" <pedido@supersoftware.info>',
    to: 'pedido@supersoftware.info',
    subject: `⚠️ ESTOQUE ESGOTADO - Produto: ${productName}`,
    text: `Olá Administrador,\n\nO cliente do pedido #${orderId} tentou resgatar uma chave para o produto "${productName}", mas o estoque de chaves está esgotado.\n\nPor favor, insira novas chaves no painel administrativo e aprove o lead correspondente para disparar o envio.\n\nAtenciosamente,\nSistema SuperSoftware`
  };

  await transporter.sendMail(mailOptions);
}

export async function approveLead(leadId: string) {
  try {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) throw new Error('Lead não localizado');

    const { data: availableKeys } = await supabase
      .from('license_keys')
      .select('*')
      .eq('is_used', false);

    const keysList = availableKeys || [];
    const matchedKey = findMatchingKey(lead.product_name, keysList);

    if (!matchedKey) {
      throw new Error(`Nenhuma chave disponível para o produto "${lead.product_name}".`);
    }

    const { data: updatedLead } = await supabase
      .from('leads')
      .update({
        license_key: matchedKey.key_code,
        status: 'sent'
      })
      .eq('id', leadId)
      .select()
      .single();

    const hostHeaders = await headers();
    const host = hostHeaders.get('host') || 'localhost:3000';
    const baseUrl = host.includes('localhost')
      ? `http://${host}`
      : 'https://resgatar.supersoftware.info';

    await sendActivationEmail({
      email: lead.email,
      name: lead.name,
      orderId: lead.order_id,
      productName: lead.product_name,
      licenseKey: matchedKey.key_code,
      leadId: lead.id,
      baseUrl
    });

    return { success: true, lead: updatedLead };
  } catch (error) {
    console.error('Error in approveLead:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to approve lead');
  }
}

export async function addLicenseKeys(productName: string, keysText: string) {
  try {
    const keys = keysText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keys.length === 0) {
      return { success: true, count: 0 };
    }

    const insertData = keys.map(k => ({
      product_name: productName.trim(),
      key_code: k,
      is_used: false
    }));

    const { data, error } = await supabase
      .from('license_keys')
      .insert(insertData)
      .select();

    if (error) throw error;
    return { success: true, count: keys.length };
  } catch (error) {
    console.error('Error in addLicenseKeys:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to add license keys');
  }
}

export async function deleteLead(id: string) {
  try {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in deleteLead:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to delete lead');
  }
}

export async function deleteLicenseKey(id: string) {
  try {
    const { error } = await supabase.from('license_keys').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in deleteLicenseKey:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to delete license key');
  }
}

export async function fetchLeadsAndKeys() {
  try {
    const [leadsRes, keysRes, ordersRes, templatesRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('license_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('shopee_orders').select('order_id'),
      supabase.from('email_templates').select('*').order('name')
    ]);

    if (leadsRes.error) {
      // If table doesn't exist yet, return empty
      if (leadsRes.error.message.includes('relation "public.leads" does not exist')) {
        return { leads: [], keys: [], importedOrderIds: [], templates: [] };
      }
      throw leadsRes.error;
    }
    if (keysRes.error) throw keysRes.error;

    const importedOrderIds = new Set((ordersRes.data || []).map(o => o.order_id));
    let templates = templatesRes && !templatesRes.error ? (templatesRes.data || []) : [];

    // If the table exists but has 0 templates, seed it automatically
    if (templatesRes && !templatesRes.error && templates.length === 0) {
      const defaultTemplates = [
        {
          product_key: 'office 2024',
          name: 'Office 2024',
          template_html: `
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 15px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">Obrigado por adquirir o Office 2024 Pro Plus!</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
        <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li>• <strong>Licença:</strong> 1 dispositivo (uso vitalício)</li>
          <li>• <strong>Método de Instalação:</strong> Download Digital</li>
        </ul>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">1. Remova versões anteriores do Office</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Se houver qualquer versão do Office instalada em seu computador — incluindo outras versões do Office 2024 —, desinstale completamente antes de prosseguir.
        </p>
        <p style="margin: 5px 0; font-size: 14px; color: #1a202c; font-weight: bold;">✔️ Isso evita erros e conflitos durante a nova instalação.</p>
        <div style="background-color: #edf2f7; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">2. Reinicie o computador</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Após a desinstalação, reinicie a máquina para que as alterações tenham efeito.
        </p>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">3. Baixe o Office 2024 Pro Plus</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Acesse o link abaixo e faça o download.
        </p>
        <p style="margin: 10px 0; font-size: 14px; font-weight: bold;">
          👉 <a href="https://supersoftware.info/office/office2024.exe" style="color: #4f46e5; text-decoration: underline;">Clique aqui para baixar</a>
        </p>
        <p style="margin: 5px 0; font-size: 12px; color: #718096; word-break: break-all;">
          (Caso o link não abra, copie o endereço abaixo e cole na barra de sites do seu navegador):<br>
          <code>https://supersoftware.info/office/office2024.exe</code>
        </p>
        <p style="margin: 5px 0; font-size: 13px; color: #718096;">
          <em>Obs.: Ao clicar no link, o download começará automaticamente.</em>
        </p>
        <div style="background-color: #f7fafc; border: 1px dashed #cbd5e0; padding: 10px; border-radius: 6px; margin: 10px 0; font-size: 13px; color: #4a5568;">
          <strong>Após baixar:</strong><br>
          Dê um duplo clique em <strong>\'office2024.exe\'</strong> para iniciar a instalação.<br>
          Uma janela de instalação será aberta. (Isso pode levar alguns minutos dependendo da sua internet).<br>
          Ao finalizar, clique em Fechar.
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">4. Ative o Office (obrigatório)</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Abra o Word.<br>
          Vá em <strong>Arquivo</strong> (ou Ficheiros) &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos exibida acima. Feche o Word e abra novamente.
        </p>
        <div style="background-color: #fffaf0; border: 1px solid #feebc8; padding: 12px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #744210;">
          <strong>⚠️ IMPORTANTE - Ativação por telefone:</strong><br>
          Quando aparecer a tela do Assistente de Ativação:<br>
          • Selecione <strong>"Pretendo ativar o software por telefone"</strong> e clique em Seguinte.<br>
          • Tire uma foto ou captura de tela dessa tela e envie para nós.<br>
          Faremos a ativação para você em segundos!
        </div>

        <h4 style="color: #2d3748; margin-top: 20px; font-size: 14px; border-bottom: 1px solid #edf2f7; padding-bottom: 5px;">5. Confirme a ativação</h4>
        <p style="margin: 5px 0; font-size: 14px; color: #4a5568;">
          Feche todos os programas do Office. Abra o Word novamente, vai em Conta e verifique se aparece a mensagem: <strong>"Produto ativado"</strong>.<br>
          Ative sua chave até 30 dias, conforme recomendação da Microsoft.
        </p>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">

        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>`
        },
        {
          product_key: 'windows',
          name: 'Windows 10 / 11',
          template_html: `
      <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
        <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Instruções para ativação do Windows</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
        
        <ul style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.8; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li style="margin-bottom: 8px;">👉 Clique no <strong>Menu Iniciar</strong></li>
          <li style="margin-bottom: 8px;">👉 Vá em <strong>Configurações ⚙️</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Sistema</strong></li>
          <li style="margin-bottom: 8px;">👉 Selecione <strong>Ativação</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Alterar chave do produto</strong></li>
          <li style="margin-bottom: 8px;">👉 Digite a chave do Windows Pro (25 caracteres) indicada acima</li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Avançar → Ativar</strong></li>
          <li style="margin-bottom: 8px;">👉 Aguarde a mensagem de ativação concluída ✅</li>
        </ul>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        
        <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
          <strong>📞 Suporte Técnico Especializado:</strong><br>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
          🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
          •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
          Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
        </div>
      </div>`
        },
        {
          product_key: 'office 2016 e 2021',
          name: 'Office 2016 / 2021',
          template_html: `
    <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 20px; margin: 20px 0; color: #2d3748; line-height: 1.6;">
      <h3 style="color: #4f46e5; margin-top: 0; margin-bottom: 10px; font-size: 16px;">🎉 Obrigado por comprar a chave do Office!</h3>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #e53e3e;">{licenseKey}</span></p>
      <ul style="padding-left: 20px; margin: 10px 0; font-size: 14px; color: #4a5568; list-style-type: none; margin-left: 0; padding-left: 0;">
        <li>• <strong>Método de entrega:</strong> Download Digital</li>
        <li>• <strong>Licença:</strong> 1 Dispositivo</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
      
      <ol style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #4a5568; line-height: 1.6;">
        <li style="margin-bottom: 10px;">
          Para instalação e ativação correta, siga estritamente os passos descritos abaixo para que venha a obter êxito em todo o processo de instalação e ativação.
        </li>
        <li style="margin-bottom: 10px;">
          Caso tenha qualquer versão do Office instalado em sua máquina, mesmo que seja uma versão 2021, deverá desinstalá-la completamente.
        </li>
        <li style="margin-bottom: 10px; font-weight: bold; color: #e53e3e;">
          Desinstale seu Office de qualquer versão para evitar erros e conflitos de incompatibilidade.
        </li>
        <li style="margin-bottom: 10px; list-style-type: none; background-color: #edf2f7; padding: 10px; border-radius: 6px; font-size: 13px;">
          <strong>Como desinstalar versões anteriores do Office:</strong><br>
          Abra o Menu Iniciar &gt; Pesquisar <strong>Painel de Controle</strong> &gt; <strong>Programas e Recursos</strong>.<br>
          Encontre <em>Microsoft 365 - pt-br</em> e <em>Microsoft OneNote - pt-br</em>, clique em Desinstalar e siga as instruções.<br>
          Reinicie o computador após a desinstalação.
        </li>
        <li style="margin-bottom: 10px;">
          Baixe o Office no link abaixo: (Obs.: Botão Azul "Download", e depois "FAZER DOWNLOAD ASSIM MESMO")<br>
          👉 <a href="https://bit.ly/MicrosoftOffice2021Pro" style="color: #4f46e5; text-decoration: underline; font-weight: bold;">Clique aqui para baixar o instalador</a>
        </li>
        <li style="margin-bottom: 10px;">
          Clique com o botão direito no arquivo “Office 2021 Pro Plus”, selecione “Abrir com” &gt; “Windows Explorer”, abra a pasta “64bits” e dê um duplo clique em “Instalar” para iniciar a instalação.
        </li>
        <li style="margin-bottom: 10px;">
          Depois de instalado, clique em fechar e abra qualquer aplicativo do Office (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abra o Word e vá em <strong>Arquivo</strong> &gt; <strong>Conta</strong> &gt; <strong>Alterar chave do produto</strong>.<br>
          Insira a chave de 25 dígitos indicada acima e depois clique em <strong>Ativar</strong>.
        </li>
        <li style="margin-bottom: 10px;">
          Clique em fechar, encerre o aplicativo e abra-o novamente (exemplo: Word).
        </li>
        <li style="margin-bottom: 10px;">
          Abrirá uma janela do <strong>ASSISTENTE PARA ATIVAÇÃO</strong>, clique no botão "Avançar". Sua chave de produto agora está ativada em seu computador!
        </li>
      </ol>
      
      <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; padding: 10px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #0d9488; text-align: center; font-weight: bold;">
        OBS: Feche tudo e abra novamente o Word, clique em CONTA para ver a mensagem "PRODUTO ATIVADO"
      </div>
      
      <ul style="padding-left: 20px; font-size: 13px; color: #4a5568; margin-top: 15px;">
        <li>📌 Recomendamos ativar o produto em até 7 dias após o recebimento.</li>
        <li>📩 Qualquer dúvida, fale conosco antes de abrir reclamação.</li>
        <li>✅ Oferecemos suporte gratuito à instalação.</li>
      </ul>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <div style="font-size: 13px; color: #4a5568; line-height: 1.5;">
        <strong>📞 Suporte Técnico Especializado:</strong><br>
        Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição:<br>
        🟢 <strong>Whatsapp: +55 (11) 93585-6950</strong><br><br>
        •/ <strong>Também temos:</strong> Office 365 • Windows 10/11 Pro • CorelDraw • Licenças vitalícias com o melhor custo-benefício.<br>
        Visite: <a href="https://supersoftware.info" style="color: #4f46e5; text-decoration: underline;">supersoftware.info</a>
      </div>
    </div>`
        }
      ];

      const { data: seeded } = await supabase
        .from('email_templates')
        .insert(defaultTemplates)
        .select();

      if (seeded) {
        templates = seeded;
      }
    }

    return {
      leads: leadsRes.data || [],
      keys: keysRes.data || [],
      importedOrderIds: Array.from(importedOrderIds),
      templates
    };
  } catch (error) {
    console.error('Error in fetchLeadsAndKeys:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to fetch leads and keys');
  }
}

export async function confirmReceiptDirect(leadId: string) {
  try {
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (fetchError || !lead) throw new Error('Lead não localizado');

    const { data, error } = await supabase
      .from('leads')
      .update({ status: 'recebido' })
      .eq('id', leadId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, lead: data };
  } catch (error) {
    console.error('Error in confirmReceiptDirect:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to confirm receipt');
  }
}

async function getBodyText(client: any, uid: number): Promise<string> {
  try {
    const downloadStream = await client.download(uid, '1');
    if (downloadStream && downloadStream.content) {
      const chunks = [];
      for await (const chunk of downloadStream.content) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    }
  } catch (e) {
    // try fallback
  }
  return '';
}

export async function checkEmailReplies() {
  const client = new ImapFlow({
    host: 'imap.hostinger.com',
    port: 993,
    secure: true,
    auth: {
      user: 'pedido@supersoftware.info',
      pass: 'Batata2025$'
    },
    logger: false
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = await client.search({ seen: false });
      let updatedCount = 0;

      if (messages && messages.length > 0) {
        for (const uid of messages) {
          const message = await client.fetchOne(uid, { envelope: true });
          if (!message) continue;

          const subject = message.envelope?.subject || '';
          const bodyText = await getBodyText(client, uid);
          
          const lowerBody = bodyText.toLowerCase();
          const lowerSubject = subject.toLowerCase();
          const hasConfirmationWord = 
            lowerBody.includes('recebido') || 
            lowerBody.includes('recebi') || 
            lowerBody.includes('funcionou') || 
            lowerBody.includes('ok') ||
            lowerSubject.includes('recebido');

          if (hasConfirmationWord) {
            const orderIdMatch = subject.match(/Pedido\s+#?([A-Za-z0-9\-_]+)/i) || bodyText.match(/Pedido\s+#?([A-Za-z0-9\-_]+)/i);
            if (orderIdMatch) {
              const orderId = orderIdMatch[1].trim();
              const { data: lead } = await supabase
                .from('leads')
                .select('*')
                .eq('order_id', orderId)
                .maybeSingle();

              if (lead && lead.status !== 'recebido') {
                await supabase
                  .from('leads')
                  .update({ status: 'recebido' })
                  .eq('id', lead.id);
                
                await client.messageFlagsAdd({ uid }, ['\\Seen']);
                updatedCount++;
              }
            }
          }
        }
      }
      return { success: true, updatedCount };
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error('IMAP check error:', error);
    throw error;
  } finally {
    await client.logout();
  }
}

export async function saveEmailTemplate(
  id: string | null,
  productKey: string,
  name: string,
  templateHtml: string
) {
  try {
    const data = {
      product_key: productKey.trim().toLowerCase(),
      name: name.trim(),
      template_html: templateHtml,
      updated_at: new Date().toISOString()
    };

    let res;
    if (id) {
      res = await supabase
        .from('email_templates')
        .update(data)
        .eq('id', id)
        .select()
        .single();
    } else {
      res = await supabase
        .from('email_templates')
        .insert([data])
        .select()
        .single();
    }

    if (res.error) throw res.error;
    return { success: true, template: res.data };
  } catch (error) {
    console.error('Error in saveEmailTemplate:', error);
    const err = error as Error;
    return { success: false, error: err.message || 'Failed to save template' };
  }
}

export async function getClientNameByEmail(email: string) {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('name')
      .eq('email', email.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data && data.length > 0) {
      return { success: true, name: data[0].name };
    }
    return { success: true, name: null };
  } catch (error) {
    console.error('Error in getClientNameByEmail:', error);
    return { success: false, name: null };
  }
}

