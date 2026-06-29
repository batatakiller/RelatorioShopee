'use server';

import { createClient } from '@supabase/supabase-js';
import { Order, AdData, ProductCost, AdsBillingRecord, AdsBillingDaily, SupplierPayment } from '@/utils/profitCalculator';

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

