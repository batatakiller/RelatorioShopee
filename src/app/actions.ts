'use server';

import { createClient } from '@supabase/supabase-js';
import { Order, AdData, ProductCost } from '@/utils/profitCalculator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Initialize server-side supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

export async function fetchDashboardData() {
  try {
    const [ordersRes, adsRes, costsRes] = await Promise.all([
      supabase.from('shopee_orders').select('*').order('order_date', { ascending: true }),
      supabase.from('shopee_ads').select('*'),
      supabase.from('product_costs').select('*')
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (adsRes.error) throw adsRes.error;
    if (costsRes.error) throw costsRes.error;

    return {
      orders: ordersRes.data as Order[] || [],
      ads: adsRes.data as AdData[] || [],
      costs: costsRes.data as ProductCost[] || []
    };
  } catch (error) {
    console.error('Error in fetchDashboardData:', error);
    const err = error as Error;
    throw new Error(err.message || 'Failed to fetch dashboard data');
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
    
    const { data: existingOrders, error: fetchError } = await supabase
      .from('shopee_orders')
      .select('order_id')
      .in('order_id', orderIds);

    if (fetchError) throw fetchError;

    const existingIds = new Set(existingOrders?.map(o => o.order_id) || []);

    const existingUpdates = [];
    const newInserts = [];

    for (const payout of payoutsData) {
      if (existingIds.has(payout.order_id)) {
        existingUpdates.push({
          order_id: payout.order_id,
          payout_amount: payout.payout_amount,
          payout_date: payout.payout_date,
          payout_unmatched: false
        });
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
