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

export interface CalculatedOrder extends Order {
  product_cost: number;
  ads_cost: number;
  net_profit: number;
}

export function calculateProfit(
  orders: Order[],
  ads: AdData[],
  costs: ProductCost[]
): CalculatedOrder[] {
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
    // Find ad matching the product. The ad_name is usually similar to product_name or we can match via ID if we had it.
    // In our CSV, Ads have ad_name. We'll check if the order product_name matches the ad_name.
    // Or just find the first ad that matches the product name partially.
    let ads_cost = 0;
    const matchedAd = ads.find(
      (ad) =>
        lowerName.includes(ad.ad_name.toLowerCase()) ||
        ad.ad_name.toLowerCase().includes(lowerName)
    );

    if (matchedAd) {
      // Allocate the average cost per conversion to this single order (times quantity)
      ads_cost = matchedAd.cost_per_conversion * order.quantity;
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
