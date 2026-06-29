export interface Order {
  order_id: string;
  order_date: string;
  product_name: string;
  quantity: number;
  total_revenue: number; // Value from Total global
  commission_fee: number;
  service_fee: number;
  status: string;
  original_price: number;
  seller_discount: number;
  seller_coupon: number;
  payout_amount?: number;
  payout_date?: string;
  payout_unmatched?: boolean;
}

export interface AdData {
  report_period: string;
  product_id: string;
  ad_name: string;
  cost: number; // Total ads cost
  cost_per_conversion: number; // Avg cost per order
}

export interface ProductCost {
  search_term: string;
  cost: number;
}

export interface SupplierPayment {
  id: string;
  payment_date: string;
  amount: number;
  notes?: string;
  created_at?: string;
}

export interface AdsBillingRecord {
  id: string;
  sequence_number: number;
  transaction_date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = deduction, positive = recharge
  observation: string;
  credit_paid: number | null;
  credit_free: number | null;
  import_file: string;
}

export interface AdsBillingDaily {
  date: string; // YYYY-MM-DD
  total_spent: number; // absolute value of deductions for this day
}

export interface CalculatedOrder extends Order {
  product_cost: number;
  ads_cost: number;
  net_profit: number;
}

export function calculateProfit(
  orders: Order[],
  ads: AdData[],
  costs: ProductCost[],
  adsBillingDaily?: AdsBillingDaily[]
): CalculatedOrder[] {
  // Pre-build a map of daily ads spend from billing data
  const dailyAdsMap = new Map<string, number>();
  if (adsBillingDaily && adsBillingDaily.length > 0) {
    for (const day of adsBillingDaily) {
      dailyAdsMap.set(day.date, day.total_spent);
    }
  }

  // Pre-calculate daily total revenue for proportional distribution
  const dailyRevenue = new Map<string, number>();
  const validOrders = orders.filter(o => !o.status?.toLowerCase().includes('cancelado'));
  for (const order of validOrders) {
    const dateStr = order.order_date.split('T')[0]; // YYYY-MM-DD
    const current = dailyRevenue.get(dateStr) || 0;
    dailyRevenue.set(dateStr, current + Math.abs(order.total_revenue));
  }

  const hasBillingData = dailyAdsMap.size > 0;

  return orders.map((order) => {
    // 1. Determine Product Cost
    let product_cost = 0;
    const lowerName = order.product_name.toLowerCase();

    // Sum costs for all matching search terms (e.g. "Windows 11" and "Office 2024" in the same product)
    let matchedCosts = 0;
    for (const costItem of costs) {
      if (lowerName.includes(costItem.search_term.toLowerCase())) {
        matchedCosts += costItem.cost;
      }
    }
    product_cost = matchedCosts > 0 ? matchedCosts : 0;
    
    // Multiply by quantity
    product_cost = product_cost * order.quantity;

    // 2. Determine Ads Cost
    let ads_cost = 0;
    const isCancelled = order.status?.toLowerCase().includes('cancelado');

    if (!isCancelled) {
      if (hasBillingData) {
        // NEW: Proportional daily distribution from billing data
        const orderDate = order.order_date.split('T')[0];
        const dailySpent = dailyAdsMap.get(orderDate) || 0;
        const dailyTotal = dailyRevenue.get(orderDate) || 0;

        if (dailySpent > 0 && dailyTotal > 0 && Math.abs(order.total_revenue) > 0) {
          // Distribute proportionally based on order's share of daily revenue
          ads_cost = (dailySpent * Math.abs(order.total_revenue)) / dailyTotal;
        }
      } else {
        // LEGACY fallback: match by product name from shopee_ads table
        const matchedAd = ads.find(
          (ad) =>
            lowerName.includes(ad.ad_name.toLowerCase()) ||
            ad.ad_name.toLowerCase().includes(lowerName)
        );

        if (matchedAd) {
          ads_cost = matchedAd.cost_per_conversion * order.quantity;
        }
      }
    }

    // 3. Calculate Net Profit
    // Net profit = (Total Revenue from Shopee) - (Product Cost) - (Ads Cost)
    // Note: total_revenue (Total global) already has Shopee fees discounted.
    const net_profit = order.total_revenue - product_cost - ads_cost;

    return {
      ...order,
      product_cost,
      ads_cost,
      net_profit,
    };
  });
}
