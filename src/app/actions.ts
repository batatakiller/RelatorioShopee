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
  } catch (error: any) {
    console.error('Error in fetchDashboardData:', error);
    throw new Error(error.message || 'Failed to fetch dashboard data');
  }
}

export async function upsertAds(adsData: any[]) {
  try {
    const { error } = await supabase.from('shopee_ads').upsert(adsData, { onConflict: 'report_period, product_id' });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error in upsertAds:', error);
    throw new Error(error.message || 'Failed to upsert ads');
  }
}

export async function upsertOrders(ordersData: any[]) {
  try {
    const { error } = await supabase.from('shopee_orders').upsert(ordersData, { onConflict: 'order_id' });
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error in upsertOrders:', error);
    throw new Error(error.message || 'Failed to upsert orders');
  }
}

export async function fetchProductCosts() {
  try {
    const { data, error } = await supabase.from('product_costs').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    return data as ProductCost[] || [];
  } catch (error: any) {
    console.error('Error in fetchProductCosts:', error);
    throw new Error(error.message || 'Failed to fetch product costs');
  }
}

export async function addProductCost(newTerm: string, costNum: number) {
  try {
    const { error } = await supabase.from('product_costs').insert([{ search_term: newTerm, cost: costNum }]);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error in addProductCost:', error);
    throw new Error(error.message || 'Failed to add product cost');
  }
}

export async function deleteProductCost(searchTerm: string) {
  try {
    const { error } = await supabase.from('product_costs').delete().eq('search_term', searchTerm);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error in deleteProductCost:', error);
    throw new Error(error.message || 'Failed to delete product cost');
  }
}

export async function updateProductCost(editingTerm: string, costNum: number) {
  try {
    const { error } = await supabase.from('product_costs').update({ cost: costNum }).eq('search_term', editingTerm);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error in updateProductCost:', error);
    throw new Error(error.message || 'Failed to update product cost');
  }
}
