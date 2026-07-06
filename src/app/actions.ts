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
  
  // Extract variation if present (e.g. "variação: 2016")
  let matchTarget = prodLower;
  const varMatch = prodLower.match(/varia[çc][ãa]o:\s*([^\s\)]+)/);
  if (varMatch) {
    matchTarget = varMatch[1].trim();
  }

  // 1. Check for Office products
  if (prodLower.includes('office')) {
    if (matchTarget.includes('2024') || (!varMatch && prodLower.includes('2024'))) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2024'));
      if (match) return match;
    }
    if (matchTarget.includes('2021') || (!varMatch && prodLower.includes('2021'))) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2021'));
      if (match) return match;
    }
    if (matchTarget.includes('2019') || (!varMatch && prodLower.includes('2019'))) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2019'));
      if (match) return match;
    }
    if (matchTarget.includes('2016') || (!varMatch && prodLower.includes('2016'))) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('office') && k.product_name.toLowerCase().includes('2016'));
      if (match) return match;
    }
  }

  // 2. Check for Windows products
  if (prodLower.includes('windows')) {
    if (matchTarget.includes('11') || (!varMatch && prodLower.includes('11'))) {
      const match = keys.find(k => k.product_name.toLowerCase().includes('windows') && k.product_name.toLowerCase().includes('11'));
      if (match) return match;
    }
    if (matchTarget.includes('10') || (!varMatch && prodLower.includes('10'))) {
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

    // Aggregate billing data by day
    const dailyMap = new Map<string, AdsBillingDaily>();
    const dailyRechargesMap = new Map<string, { date: string; paid: number; free: number }>();
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
        // Recharge — track real money invested vs free credits
        const rechargeDay = dailyRechargesMap.get(dateStr) || { date: dateStr, paid: 0, free: 0 };

        if (record.credit_paid !== null && record.credit_paid !== undefined) {
          rechargeDay.paid += record.credit_paid;
          rechargeDay.free += (record.credit_free || 0);
          totalRechargesPaid += record.credit_paid;
          totalFreeCredits += (record.credit_free || 0);
        } else {
          // If credit_paid is null (common in CSV exports where Observation is '-'),
          // classify based on the description text.
          const descLower = (record.description || '').toLowerCase();
          const isFreeCredit = 
            descLower.includes('free') || 
            descLower.includes('bônus') || 
            descLower.includes('bonus') || 
            descLower.includes('gratuito') || 
            descLower.includes('recompensa') ||
            descLower.includes('promo');

          if (isFreeCredit) {
            rechargeDay.free += record.amount;
            totalFreeCredits += record.amount;
          } else {
            rechargeDay.paid += record.amount;
            totalRechargesPaid += record.amount;
          }
        }

        dailyRechargesMap.set(dateStr, rechargeDay);
      }
    }

    return {
      orders: ordersRes.data as Order[] || [],
      ads: adsRes.data as AdData[] || [],
      costs: costsRes.data as ProductCost[] || [],
      adsBillingDaily: Array.from(dailyMap.values()),
      adsBillingRaw: billingData,
      dailyRecharges: Array.from(dailyRechargesMap.values()),
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
    const orderIdClean = orderId.trim().toUpperCase();
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

    if (order && !orderError) {
      if (order.status?.toLowerCase().includes('cancelado')) {
        return {
          success: false,
          message: 'Não é possível resgatar chaves para um pedido cancelado.'
        };
      }
    }

    let matchedProductName = selectedProduct || '';
    let isOrderFound = false;

    if (order && !orderError) {
      matchedProductName = order.product_name;
      isOrderFound = true;
    }

    // Order number not in the database and the customer hasn't chosen to
    // proceed manually: the bot registers every paid order in real time,
    // so an unknown number is almost certainly a typo. Return an explicit
    // error (no lead is saved) so the form asks them to re-check it.
    if (!isOrderFound && !selectedProduct) {
      return {
        success: false,
        orderNotFound: true,
        message: 'Pedido não encontrado. Verifique o número e tente novamente.'
      };
    }

    // 2. Try to find a matching key
    let licenseKeyText = '';
    let statusVal = 'pending_verification';

    // We ONLY attempt automatic key dispatch if the order was officially found/imported
    if (isOrderFound) {
      statusVal = 'pending_key';

      const { data: availableKeys } = await supabase
        .from('license_keys')
        .select('*')
        .eq('is_used', false);

      const keysList = availableKeys || [];
      const products = matchedProductName.split(/\s*\+\s*/).map((p: string) => p.trim()).filter(Boolean);
      const matchedKeys: any[] = [];
      const allocatedIds = new Set<string>();
      let allKeysFound = true;

      for (const prod of products) {
        const remainingKeys = keysList.filter((k: any) => !allocatedIds.has(k.id));
        const key = findMatchingKey(prod, remainingKeys);
        if (key) {
          matchedKeys.push(key);
          allocatedIds.add(key.id);
        } else {
          allKeysFound = false;
        }
      }

      if (matchedKeys.length > 0) {
        licenseKeyText = matchedKeys.map(k => k.key_code).join(' / ');
        statusVal = allKeysFound ? 'sent' : 'pending_key';
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

function findMatchingTemplate(productName: string, templates: any[]): any | undefined {
  const prodLower = productName.toLowerCase();
  return templates.find(t => {
    const keyLower = t.product_key.toLowerCase();
    
    // 1. Direct match of the entire key as a substring
    if (prodLower.includes(keyLower)) return true;
    
    // 2. Special case: if key contains connector "e" or "ou", we split and check if any part matches
    const parts = keyLower.split(/\s+(?:e|ou)\s+/);
    if (parts.length > 1) {
      return parts.some((part: string) => {
        let cleanPart = part;
        if (keyLower.includes('office') && !part.includes('office')) {
          cleanPart = 'office ' + part;
        }
        if (keyLower.includes('windows') && !part.includes('windows')) {
          cleanPart = 'windows ' + part;
        }
        const words = cleanPart.split(/\s+/).filter((w: string) => w.length > 1 && w !== 'de');
        return words.every((w: string) => prodLower.includes(w));
      });
    }
    
    // 3. Split match for standard keys
    const words = keyLower.split(/\s+/).filter((w: string) => w.length > 1 && w !== 'de' && w !== 'ou' && w !== 'e');
    if (words.length > 0) {
      return words.every((w: string) => prodLower.includes(w));
    }
    
    return false;
  });
}

function getCombinedInstructions(
  productName: string,
  licenseKey: string,
  templatesList: any[],
  orderId: string
): string {
  const products = productName.split(/\s*\+\s*/).map(p => p.trim()).filter(Boolean);
  const keys = licenseKey.split(/\s*\/\s*/).map(k => k.trim()).filter(Boolean);

  if (products.length <= 1) {
    const matchedTemplate = findMatchingTemplate(productName, templatesList);
    if (matchedTemplate) {
      return matchedTemplate.template_html
        .replace(/{licenseKey}/g, licenseKey)
        .replace(/{orderId}/g, orderId);
    }
    return getProductInstructions(productName, licenseKey, orderId);
  }

  let combinedHtml = '';
  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const key = keys[i] || licenseKey || 'Aguardando liberação de estoque';
    const matchedTemplate = findMatchingTemplate(prod, templatesList);
    
    let prodInstructions = '';
    if (matchedTemplate) {
      prodInstructions = matchedTemplate.template_html
        .replace(/{licenseKey}/g, key)
        .replace(/{orderId}/g, orderId);
    } else {
      prodInstructions = getProductInstructions(prod, key, orderId);
    }

    combinedHtml += `
      <div style="border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; background-color: #ffffff; color: #2d3748;">
        <h2 style="color: #4f46e5; margin-top: 0; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; font-size: 18px;">
          📦 ${prod}
        </h2>
        ${prodInstructions}
      </div>
    `;
  }
  return combinedHtml;
}

function getProductInstructions(prodName: string, licenseKey: string, orderId: string): string {
  const name = prodName.toLowerCase();
  
  const waMessage = `Olá! Preciso de suporte com o pedido #${orderId}`;
  const waUrl = `https://wa.me/5511935856950?text=${encodeURIComponent(waMessage)}`;
  const supportBox = `
    <div style="background-color: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); padding: 15px 20px; border-radius: 8px; margin-top: 25px; color: #fef08a; font-size: 13px; line-height: 1.5; font-family: system-ui, sans-serif;">
      <strong style="font-size: 14px; color: #fbbf24; display: block; margin-bottom: 6px;">🟢 Suporte Técnico Especializado:</strong>
      Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição no WhatsApp:<br>
      <strong style="font-size: 14px; color: #ffffff;">Número: +55 (11) 93585-6950</strong><br><br>
      <a href="${waUrl}" 
         target="_blank" 
         style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
        💬 Chamar no WhatsApp
      </a>
    </div>
  `;

  if (name.includes('office')) {
    const is2024 = name.includes('2024');
    const is2021 = name.includes('2021');
    const is2019 = name.includes('2019');
    const is2016 = name.includes('2016');
    const officeName = is2024 ? 'Office 2024 Pro Plus' : (is2021 ? 'Office 2021 Pro Plus' : (is2019 ? 'Office 2019 Pro Plus' : (is2016 ? 'Office 2016 Pro Plus' : 'Office Pro Plus')));

    return `
      <div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
        <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🚀 Método de Instalação Automático (PowerShell) - ${officeName}</h3>
        <p style="margin: 5px 0; font-size: 14px; color: #e2e8f0;">
          Para instalar e ativar o seu Office de forma totalmente automática, siga as etapas abaixo:
        </p>

        <ol style="padding-left: 20px; margin: 20px 0; font-size: 14px; color: #f1f5f9; line-height: 1.7;">
          <li style="margin-bottom: 15px;">
            <strong>Abra o PowerShell como Administrador</strong>:<br>
            <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
              • Clique com o <strong>botão direito</strong> no menu <strong>Iniciar</strong> (ou pesquise por <em>"PowerShell"</em>).<br>
              • Selecione <strong>"Windows PowerShell (Administrador)"</strong> ou <strong>"Terminal (Administrador)"</strong>.<br>
              • Clique em <strong>Sim</strong> na confirmação de segurança.
            </span>
          </li>
          <li style="margin-bottom: 15px;">
            <strong>Execute o Comando de Instalação</strong>:<br>
            <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px; margin-bottom: 4px;">
              • Copie o comando abaixo (clique duas vezes para selecionar ou copie completo):
            </span>
            <code style="display: block; background-color: #0f172a; color: #ef4444; padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px; word-break: break-all; border: 1px solid #1e293b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);">[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://instalar.supersoftware.info/setup/${licenseKey} | iex</code>
            <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
              • Cole no PowerShell (basta clicar com o <strong>botão direito</strong> dentro da janela do PowerShell) e aperte <strong>Enter</strong>.
            </span>
          </li>
          <li style="margin-bottom: 15px;">
            <strong>Acompanhe a Instalação</strong>:<br>
            <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
              • O script validará a chave <strong style="color: #f87171;">${licenseKey}</strong> e fará todo o processo oficial de download e ativação 100% automático.
            </span>
          </li>
        </ol>

        ${supportBox}
      </div>
    `;
  }
  
  if (name.includes('windows')) {
    const isWindows11 = name.includes('11');
    const winName = isWindows11 ? 'Windows 11 Pro' : 'Windows 10 Pro';
    return `
      <div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
        <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🎉 Instruções para ativação do ${winName}</h3>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #f87171;">${licenseKey}</span></p>
        
        <hr style="border: 0; border-top: 1px solid #1e293b; margin: 15px 0;">
        
        <ul style="padding-left: 20px; margin: 15px 0; font-size: 14px; color: #f1f5f9; line-height: 1.8; list-style-type: none; margin-left: 0; padding-left: 0;">
          <li style="margin-bottom: 8px;">👉 Clique no <strong>Menu Iniciar</strong></li>
          <li style="margin-bottom: 8px;">👉 Vá em <strong>Configurações ⚙️</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Sistema</strong></li>
          <li style="margin-bottom: 8px;">👉 Selecione <strong>Ativação</strong></li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Alterar chave do produto</strong></li>
          <li style="margin-bottom: 8px;">👉 Digite a chave do Windows Pro (25 caracteres) indicada acima</li>
          <li style="margin-bottom: 8px;">👉 Clique em <strong>Avançar → Ativar</strong></li>
          <li style="margin-bottom: 8px;">👉 Aguarde a mensagem de ativação concluída ✅</li>
        </ul>
        
        <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;">
        
        ${supportBox}
      </div>
    `;
  }
  
  return `
    <div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
      <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🎉 Instruções para o produto ${prodName}</h3>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Chave:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #f87171;">${licenseKey}</span></p>
      
      ${supportBox}
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

  const waMessage = `Olá! Preciso de suporte com o pedido #${params.orderId} (${params.productName})`;
  const waUrl = `https://wa.me/5511935856950?text=${encodeURIComponent(waMessage)}`;

  // We hide the plain text license key from the email, rendering a link instead
  const secureKeyLink = `<span style="background-color: #e0e7ff; padding: 6px 12px; border-radius: 6px; border: 1px dashed #818cf8; color: #4f46e5; font-weight: bold; font-family: sans-serif; font-size: 14px;"><a href="${params.baseUrl}/licenca?id=${params.leadId}" style="color: #4f46e5; text-decoration: none;">🔑 Revelar Chave de Ativação</a></span>`;

  const mailOptions = {
    from: '"SuperSoftware - Entrega de Licenças" <pedido@supersoftware.info>',
    to: params.email,
    subject: `Sua Chave de Ativação - Pedido #${params.orderId}`,
    headers: {
      'List-Unsubscribe': `<mailto:unsubscribe@supersoftware.info>, <${params.baseUrl}/descadastro>`
    },
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1a202c;">
        
        <!-- Greeting -->
        <h2 style="color: #4f46e5; margin-bottom: 20px;">Olá, ${params.name}!</h2>
        <p style="font-size: 15px; color: #4a5568; line-height: 1.5;">
          Sua licença da SuperSoftware foi gerada com sucesso para o seu pedido da Shopee.
        </p>
        
        <!-- Order Details -->
        <div style="background-color: #f7fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 15px; margin: 20px 0;">
          <p style="margin: 5px 0; font-size: 14px; color: #2d3748;"><strong>Produto:</strong> ${params.productName}</p>
          <p style="margin: 5px 0; font-size: 14px; color: #2d3748;"><strong>Pedido:</strong> #${params.orderId}</p>
        </div>

        <!-- Key Rescue Button -->
        <div style="text-align: center; margin: 25px 0;">
          <div style="margin-top: 15px;">
            ${secureKeyLink}
          </div>
        </div>

        <!-- Warning Box -->
        <div style="margin: 25px 0; border: 2px solid #feebc8; background-color: #fffaf0; border-radius: 6px; padding: 15px;">
          <p style="margin: 0; font-weight: bold; color: #c05621; font-size: 14px;">📩 ATENÇÃO - IMPORTANTE PARA GARANTIR O RECEBIMENTO:</p>
          <p style="margin: 5px 0 0 0; font-size: 13px; color: #744210; line-height: 1.4;">
            Para garantir que você receba futuras chaves e ofertas na sua caixa de entrada, 
            <strong>adicione o e-mail <a href="mailto:pedido@supersoftware.info" style="color: #b45309; font-weight: bold;">pedido@supersoftware.info</a> aos seus contatos</strong> 
            ou marque este e-mail como "Não é spam".
          </p>
        </div>

        <!-- WhatsApp Support Box -->
        <div style="background-color: #e6fffa; border: 1px solid #b2f5ea; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 13px; color: #0d9488; line-height: 1.5;">
          <strong style="font-size: 14px; color: #0f766e; display: block; margin-bottom: 5px;">🟢 Suporte Técnico Especializado:</strong>
          Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição no WhatsApp:<br>
          <strong>Número: +55 (11) 93585-6950</strong><br><br>
          <a href="${waUrl}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; box-shadow: 0 2px 4px rgba(16,185,129,0.1);">
            💬 Chamar no WhatsApp
          </a>
        </div>

        <!-- Footer -->
        <p style="font-size: 12px; color: #a0aec0; margin-top: 40px; text-align: center; line-height: 1.5;">
          SuperSoftware - Licenciamento Oficial Microsoft<br>
          <a href="mailto:pedido@supersoftware.info" style="color: #4f46e5; text-decoration: none;">pedido@supersoftware.info</a> | <a href="https://www.supersoftware.info" style="color: #4f46e5; text-decoration: none;">www.supersoftware.info</a>
        </p>
        <p style="font-size: 11px; color: #a0aec0; margin-top: 15px; text-align: center; border-top: 1px dashed #edf2f7; padding-top: 15px;">
          Este é um e-mail de entrega de licença solicitado por você.<br>
          Caso não queira mais receber nossos informativos e ofertas, <a href="${params.baseUrl}/descadastro?email=${encodeURIComponent(params.email)}" style="color: #4f46e5; text-decoration: underline;">clique aqui para se descadastrar</a>.
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

    // Fetch corresponding order to check status
    const { data: order } = await supabase
      .from('shopee_orders')
      .select('status')
      .eq('order_id', lead.order_id)
      .maybeSingle();

    if (order && order.status?.toLowerCase().includes('cancelado')) {
      throw new Error('Não é possível revelar a chave pois este pedido foi cancelado.');
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
    const matchedTemplate = findMatchingTemplate(lead.product_name, templatesList);

    let instructionsHtml = getCombinedInstructions(lead.product_name, lead.license_key || 'Aguardando liberação de estoque', templatesList, lead.order_id);

    // Inject clickable WhatsApp support link with order ID prefilled
    const waMessage = `Olá! Preciso de suporte com o pedido #${lead.order_id} (${lead.product_name})`;
    const waUrl = `https://wa.me/5511935856950?text=${encodeURIComponent(waMessage)}`;
    const waLink = `🟢 <strong>Whatsapp: <a href="${waUrl}" style="color: #10b981; font-weight: bold; text-decoration: underline;">+55 (11) 93585-6950 (Falar no WhatsApp)</a></strong>`;
    instructionsHtml = instructionsHtml.replace(/🟢\s*<strong>Whatsapp:\s*\+55\s*\(11\)\s*93585-6950<\/strong>/gi, waLink);

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
    const products = lead.product_name.split(/\s*\+\s*/).map((p: string) => p.trim()).filter(Boolean);
    const matchedKeys: any[] = [];
    const allocatedIds = new Set<string>();
    let allKeysFound = true;

    for (const prod of products) {
      const remainingKeys = keysList.filter((k: any) => !allocatedIds.has(k.id));
      const key = findMatchingKey(prod, remainingKeys);
      if (key) {
        matchedKeys.push(key);
        allocatedIds.add(key.id);
      } else {
        allKeysFound = false;
      }
    }

    if (!allKeysFound || matchedKeys.length < products.length) {
      throw new Error(`Estoque insuficiente. Não há chaves disponíveis para todos os produtos do pedido (${lead.product_name}).`);
    }

    const licenseKeyText = matchedKeys.map(k => k.key_code).join(' / ');

    const { data: updatedLead } = await supabase
      .from('leads')
      .update({
        license_key: licenseKeyText,
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
      licenseKey: licenseKeyText,
      leadId: lead.id,
      baseUrl
    });

    return { success: true, lead: updatedLead };
  } catch (error) {
    console.error('Error in approveLead:', error);
    const err = error as Error;
    return { success: false, error: err.message || 'Failed to approve lead' };
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
<div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
  <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🚀 Método de Instalação Automático (PowerShell) - Office 2024 Pro Plus</h3>
  <p style="margin: 5px 0; font-size: 14px; color: #e2e8f0;">
    Para instalar e ativar o seu Office de forma totalmente automática, siga as etapas abaixo:
  </p>

  <ol style="padding-left: 20px; margin: 20px 0; font-size: 14px; color: #f1f5f9; line-height: 1.7;">
    <li style="margin-bottom: 15px;">
      <strong>Como abrir o PowerShell (Passo a Passo)</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13.5px; display: block; margin-top: 6px; line-height: 1.5;">
        • No seu teclado, aperte as teclas <strong style="color: #f3f4f6; background-color: #2d3748; padding: 2px 6px; border-radius: 4px;">Windows + X</strong> juntas.<br>
        • Ou, se preferir, clique com o <strong>botão direito</strong> do mouse em cima do botão <strong>Iniciar</strong> (o logotipo do Windows no canto inferior esquerdo da sua tela).<br>
        • No menu que se abrir, clique na opção <strong style="color: #f3f4f6;">"Windows PowerShell (Administrador)"</strong> ou <strong style="color: #f3f4f6;">"Terminal (Administrador)"</strong>.<br>
        • Uma janela de segurança irá perguntar se você confirma: clique em <strong>Sim</strong>.
      </span>
    </li>
    <li style="margin-bottom: 15px;">
      <strong>Copie e execute o comando</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px; margin-bottom: 4px;">
        • Clique no bloco abaixo para copiar o comando automaticamente:
      </span>
      <code style="display: block; background-color: #0f172a; color: #ef4444; padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px; word-break: break-all; border: 1px solid #1e293b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);">[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://instalar.supersoftware.info/setup/{licenseKey} | iex</code>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
        • Cole no PowerShell (basta clicar com o <strong>botão direito</strong> dentro da janela preta/azul do PowerShell) e aperte a tecla <strong>Enter</strong>.
      </span>
    </li>
    <li style="margin-bottom: 15px;">
      <strong>Acompanhe a Instalação</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
        • O script validará a chave <strong style="color: #f87171;">{licenseKey}</strong> e fará todo o processo oficial de download e ativação 100% automático.
      </span>
    </li>
  </ol>

  <div style="background-color: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); padding: 15px 20px; border-radius: 8px; margin-top: 25px; color: #fef08a; font-size: 13px; line-height: 1.5; font-family: system-ui, sans-serif;">
    <strong style="font-size: 14px; color: #fbbf24; display: block; margin-bottom: 6px;">🟢 Suporte Técnico Especializado:</strong>
    Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição no WhatsApp:<br>
    <strong style="font-size: 14px; color: #ffffff;">Número: +55 (11) 93585-6950</strong><br><br>
    <a href="https://wa.me/5511935856950?text=Ol%C3%A1!%20Preciso%20de%20suporte%20com%20o%20pedido%20%23{orderId}" 
       target="_blank" 
       style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
      💬 Chamar no WhatsApp
    </a>
  </div>
</div>`
        },
        {
          product_key: 'windows',
          name: 'Windows 10 / 11',
          template_html: `
<div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
  <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🎉 Instruções para ativação do Windows</h3>
  <p style="margin: 5px 0; font-size: 14px; color: #e2e8f0;"><strong>Chave de Ativação:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #f87171; background-color: rgba(248, 113, 113, 0.1); padding: 2px 6px; border-radius: 4px;">{licenseKey}</span></p>
  
  <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;">
  
  <ul style="padding-left: 0; margin: 15px 0; font-size: 14px; color: #f1f5f9; line-height: 1.8; list-style-type: none;">
    <li style="margin-bottom: 10px;">👉 Clique no <strong>Menu Iniciar</strong> do Windows</li>
    <li style="margin-bottom: 10px;">👉 Abra as <strong>Configurações ⚙️</strong></li>
    <li style="margin-bottom: 10px;">👉 Clique em <strong>Sistema</strong> (ou Atualização e Segurança)</li>
    <li style="margin-bottom: 10px;">👉 Selecione a opção <strong>Ativação</strong></li>
    <li style="margin-bottom: 10px;">👉 Clique em <strong>Alterar chave do produto</strong></li>
    <li style="margin-bottom: 10px;">👉 Insira a sua chave acima e clique em <strong>Avançar → Ativar</strong></li>
    <li style="margin-bottom: 10px;">👉 Aguarde a confirmação de ativação concluída ✅</li>
  </ul>
  
  <hr style="border: 0; border-top: 1px solid #1e293b; margin: 20px 0;">
  
  <div style="background-color: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); padding: 15px 20px; border-radius: 8px; margin-top: 25px; color: #fef08a; font-size: 13px; line-height: 1.5; font-family: system-ui, sans-serif;">
    <strong style="font-size: 14px; color: #fbbf24; display: block; margin-bottom: 6px;">🟢 Suporte Técnico Especializado:</strong>
    Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição no WhatsApp:<br>
    <strong style="font-size: 14px; color: #ffffff;">Número: +55 (11) 93585-6950</strong><br><br>
    <a href="https://wa.me/5511935856950?text=Ol%C3%A1!%20Preciso%20de%20suporte%20com%20o%20pedido%20%23{orderId}" 
       target="_blank" 
       style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
      💬 Chamar no WhatsApp
    </a>
  </div>
</div>`
        },
        {
          product_key: 'office 2016 e 2021',
          name: 'Office 2016 / 2021',
          template_html: `
<div style="color: #e2e8f0; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif;">
  <h3 style="color: #818cf8; margin-top: 0; margin-bottom: 15px; font-size: 18px; font-weight: 700;">🚀 Método de Instalação Automático (PowerShell) - Office 2016 / 2019 / 2021 Pro Plus</h3>
  <p style="margin: 5px 0; font-size: 14px; color: #e2e8f0;">
    Para instalar e ativar o seu Office de forma totalmente automática, siga as etapas abaixo:
  </p>

  <ol style="padding-left: 20px; margin: 20px 0; font-size: 14px; color: #f1f5f9; line-height: 1.7;">
    <li style="margin-bottom: 15px;">
      <strong>Como abrir o PowerShell (Passo a Passo)</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13.5px; display: block; margin-top: 6px; line-height: 1.5;">
        • No seu teclado, aperte as teclas <strong style="color: #f3f4f6; background-color: #2d3748; padding: 2px 6px; border-radius: 4px;">Windows + X</strong> juntas.<br>
        • Ou, se preferir, clique com o <strong>botão direito</strong> do mouse em cima do botão <strong>Iniciar</strong> (o logotipo do Windows no canto inferior esquerdo da sua tela).<br>
        • No menu que se abrir, clique na opção <strong style="color: #f3f4f6;">"Windows PowerShell (Administrador)"</strong> ou <strong style="color: #f3f4f6;">"Terminal (Administrador)"</strong>.<br>
        • Uma janela de segurança irá perguntar se você confirma: clique em <strong>Sim</strong>.
      </span>
    </li>
    <li style="margin-bottom: 15px;">
      <strong>Copie e execute o comando</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px; margin-bottom: 4px;">
        • Clique no bloco abaixo para copiar o comando automaticamente:
      </span>
      <code style="display: block; background-color: #0f172a; color: #ef4444; padding: 12px 16px; border-radius: 8px; margin: 10px 0; font-family: SFMono-Regular, Consolas, monospace; font-size: 13px; word-break: break-all; border: 1px solid #1e293b; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);">[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://instalar.supersoftware.info/setup/{licenseKey} | iex</code>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
        • Cole no PowerShell (basta clicar com o <strong>botão direito</strong> dentro da janela preta/azul do PowerShell) e aperte a tecla <strong>Enter</strong>.
      </span>
    </li>
    <li style="margin-bottom: 15px;">
      <strong>Acompanhe a Instalação</strong>:<br>
      <span style="color: #e2e8f0; font-size: 13px; display: block; margin-top: 4px;">
        • O script validará a chave <strong style="color: #f87171;">{licenseKey}</strong> e fará todo o processo oficial de download e ativação 100% automático.
      </span>
    </li>
  </ol>

  <div style="background-color: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); padding: 15px 20px; border-radius: 8px; margin-top: 25px; color: #fef08a; font-size: 13px; line-height: 1.5; font-family: system-ui, sans-serif;">
    <strong style="font-size: 14px; color: #fbbf24; display: block; margin-bottom: 6px;">🟢 Suporte Técnico Especializado:</strong>
    Teve alguma dificuldade técnica durante o processo? Nossa equipe está à disposição no WhatsApp:<br>
    <strong style="font-size: 14px; color: #ffffff;">Número: +55 (11) 93585-6950</strong><br><br>
    <a href="https://wa.me/5511935856950?text=Ol%C3%A1!%20Preciso%20de%20suporte%20com%20o%20pedido%20%23{orderId}" 
       target="_blank" 
       style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px;">
      💬 Chamar no WhatsApp
    </a>
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
              const orderId = orderIdMatch[1].trim().toUpperCase();
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

export async function unsubscribeEmail(email: string) {
  try {
    if (!email) return { success: false, error: 'Email invalid' };
    const emailClean = email.trim().toLowerCase();
    const { error } = await supabase
      .from('leads')
      .update({ unsubscribed: true })
      .eq('email', emailClean);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error in unsubscribeEmail:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Error unsubscribing email' };
  }
}


