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

    // Fetch existing records in this date range to prevent duplicates
    const { data: existingRecords, error: fetchError } = await supabase
      .from('shopee_ads_billing')
      .select('transaction_date, description, amount, observation')
      .gte('transaction_date', minDate)
      .lte('transaction_date', maxDate);

    if (fetchError) throw fetchError;

    const existingKeys = new Set(
      (existingRecords || []).map(r => 
        `${r.transaction_date}_${r.description}_${r.amount}_${r.observation || '-'}`
      )
    );

    // Deduplicate incoming billingData internally (defensive programming)
    const uniqueIncoming = [];
    const seenIncomingKeys = new Set();
    for (const r of billingData) {
      const key = `${r.transaction_date}_${r.description}_${r.amount}_${r.observation || '-'}`;
      if (!seenIncomingKeys.has(key)) {
        seenIncomingKeys.add(key);
        uniqueIncoming.push(r);
      }
    }

    // Filter out rows that already exist in the database
    const newRecords = uniqueIncoming.filter(r => {
      const key = `${r.transaction_date}_${r.description}_${r.amount}_${r.observation || '-'}`;
      return !existingKeys.has(key);
    });

    const skippedCount = billingData.length - newRecords.length;

    if (newRecords.length > 0) {
      // Try to upsert using the new constraint
      const { error: insertError } = await supabase
        .from('shopee_ads_billing')
        .upsert(newRecords, {
          onConflict: 'transaction_date,description,amount,observation',
          ignoreDuplicates: true
        });

      // If the migration hasn't been run yet, the new constraint doesn't exist,
      // and upsert will fail with Postgres code '42P10'. Fall back to old constraint.
      if (insertError) {
        if (insertError.code === '42P10') {
          console.warn('New unique constraint not found in database. Falling back to old constraint upsert.');
          const { error: fallbackError } = await supabase
            .from('shopee_ads_billing')
            .upsert(newRecords, {
              onConflict: 'sequence_number,transaction_date,amount',
              ignoreDuplicates: true
            });
          if (fallbackError) throw fallbackError;
        } else {
          throw insertError;
        }
      }
    }

    return { 
      success: true, 
      insertedCount: newRecords.length, 
      skippedCount 
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

    if (existingLead) {
      return { 
        success: true, 
        status: existingLead.status, 
        lead: existingLead,
        isDuplicate: true,
        message: `Este pedido já foi resgatado anteriormente para o e-mail: ${existingLead.email}`
      };
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

    if (isOrderFound) {
      statusVal = 'pending_key'; // default if no key is in stock

      const { data: availableKeys } = await supabase
        .from('license_keys')
        .select('*')
        .eq('is_used', false);

      const keysList = availableKeys || [];
      const matchedKey = keysList.find(k => 
        matchedProductName.toLowerCase().includes(k.product_name.toLowerCase())
      );

      if (matchedKey) {
        licenseKeyText = matchedKey.key_code;
        statusVal = 'sent';
      }
    } else {
      statusVal = 'pending_verification';
    }

    // 3. Save lead to database
    const { data: newLead, error: leadError } = await supabase
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

    // 4. Send email if status is 'sent'
    if (statusVal === 'sent' && licenseKeyText) {
      const hostHeaders = await headers();
      const host = hostHeaders.get('host') || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const baseUrl = `${protocol}://${host}`;

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
        <p>Sua chave de ativação foi gerada com sucesso para o seu pedido da Shopee.</p>
        
        <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 15px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #4a5568; font-weight: bold; text-transform: uppercase;">Produto</p>
          <p style="margin: 5px 0 15px 0; font-size: 18px; font-weight: bold; color: #2d3748;">${params.productName}</p>
          
          <p style="margin: 0; font-size: 14px; color: #4a5568; font-weight: bold; text-transform: uppercase;">Chave de Ativação</p>
          <p style="margin: 5px 0 0 0; font-size: 20px; font-family: monospace; font-weight: bold; color: #e53e3e; letter-spacing: 1px;">${params.licenseKey}</p>
        </div>

        <h3 style="color: #2d3748; margin-top: 25px;">Instruções de Instalação:</h3>
        <p>Para ativar seu software:</p>
        <ol>
          <li>Abra o aplicativo correspondente (Word, Excel ou vá em Configurações do Windows).</li>
          <li>Acesse a seção de <strong>Conta</strong> ou <strong>Ativação</strong>.</li>
          <li>Insira a chave de 25 caracteres exibida acima.</li>
        </ol>

        <div style="margin: 25px 0; border: 2px solid #feebc8; background-color: #fffaf0; border-radius: 6px; padding: 15px;">
          <p style="margin: 0; font-weight: bold; color: #c05621;">📩 ATENÇÃO - IMPORTANTE:</p>
          <p style="margin: 5px 0 0 0; font-size: 14px; color: #744210;">
            Para garantir o recebimento de futuras chaves e ofertas na sua caixa de entrada, 
            <strong>adicione o e-mail <a href="mailto:pedido@supersoftware.info">pedido@supersoftware.info</a> aos seus contatos</strong> 
            ou marque este e-mail como "Não é spam".
          </p>
        </div>

        <div style="text-align: center; margin-top: 30px; border-top: 1px solid #edf2f7; padding-top: 20px;">
          <p style="font-size: 14px; margin-bottom: 15px; color: #4a5568;">Por favor, confirme que recebeu sua chave clicando abaixo:</p>
          <a href="${params.baseUrl}/confirmar-recebimento?id=${params.leadId}" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Confirmar Recebimento da Chave
          </a>
          <p style="font-size: 12px; color: #718096; margin-top: 15px;">
            Ou responda diretamente a este e-mail escrevendo <strong>"Recebido"</strong>.
          </p>
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
    const matchedKey = keysList.find(k => 
      lead.product_name.toLowerCase().includes(k.product_name.toLowerCase())
    );

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
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

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
    const [leadsRes, keysRes, ordersRes] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('license_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('shopee_orders').select('order_id')
    ]);

    if (leadsRes.error) {
      // If table doesn't exist yet, return empty
      if (leadsRes.error.message.includes('relation "public.leads" does not exist')) {
        return { leads: [], keys: [], importedOrderIds: [] };
      }
      throw leadsRes.error;
    }
    if (keysRes.error) throw keysRes.error;

    const importedOrderIds = new Set((ordersRes.data || []).map(o => o.order_id));

    return {
      leads: leadsRes.data || [],
      keys: keysRes.data || [],
      importedOrderIds: Array.from(importedOrderIds)
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

