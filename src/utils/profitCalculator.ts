export interface Order {
  order_id: string;
  order_date: string;
  product_name: string;
  quantity: number;
  total_revenue: number; // Reconstructed net revenue from import
  commission_fee: number;
  service_fee: number;
  status: string;
  original_price: number; // Subtotal before discounts (Preço original * Quantidade)
  seller_discount: number;
  seller_coupon: number; // Cupom + Ajuste + Leve Mais
  payout_amount?: number | null;
  payout_date?: string | null;
  payout_unmatched?: boolean;
}

export interface AdData {
  report_period: string;
  product_id: string;
  ad_name: string;
  cost: number;
  cost_per_conversion: number;
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
  date: string;
  total_spent: number;
}

export interface OrderAudit {
  orderSubtotal: number;
  sellerDiscounts: number;
  transactionFee: number;
  commissionFee: number;
  serviceFee: number;
  otherSellerCosts: number;
  netRevenueBeforeAds: number;
  productCost: number;
  adsConsumedInPeriod: number;
  paidCreditsInPeriod: number;
  freeCreditsInPeriod: number;
  paidRatio: number;
  allocationWeight: number;
  allocatedRawAds: number;
  allocatedPaidAds: number;
  realProfit: number;
  realMargin: number;
}

export interface CalculatedOrder extends Order {
  product_cost: number;
  ads_cost: number;
  net_profit: number;
  paid_ratio: number;
  audit?: OrderAudit;
}

/**
 * 1. Calculate Net Revenue before Ads.
 * Prioritizes payout_amount from Shopee Wallet (if available and matched).
 * Otherwise falls back to reconstructed total_revenue from orders XLSX.
 */
export function calculateNetRevenueBeforeAds(
  order: Order,
  netRevenueIncludesOrderCommissionTopup: boolean = false
): number {
  let revenue = order.payout_amount !== undefined && order.payout_amount !== null && !order.payout_unmatched
    ? order.payout_amount
    : order.total_revenue;

  // Scenario B: If commission recharge was already deducted from payout, we do not deduct it twice.
  // In Scenario A (default), netRevenueIncludesOrderCommissionTopup is false.
  return revenue;
}

/**
 * 2. Calculate paid ratio dynamically for a period.
 * paidRatio = paidCredits / (paidCredits + freeCredits)
 * Auto-recharge by commission is counted as paid credit.
 */
export function calculatePaidRatio(
  billingRecords: AdsBillingRecord[],
  startDate?: string,
  endDate?: string
): number {
  let paidCreditsCents = 0;
  let freeCreditsCents = 0;

  for (const record of billingRecords) {
    if (record.amount <= 0) continue; // Skip deductions

    // Filter by date
    if (startDate && record.transaction_date < startDate) continue;
    if (endDate && record.transaction_date > endDate) continue;

    let paidAmtCents = 0;
    let freeAmtCents = 0;

    if (record.credit_paid !== null && record.credit_paid !== undefined) {
      paidAmtCents = Math.round(record.credit_paid * 100);
      freeAmtCents = Math.round((record.credit_free || 0) * 100);
    } else {
      const descLower = (record.description || '').toLowerCase();
      // Only promotions/rewards are free; commission recharges are paid
      const isFree =
        descLower.includes('free') ||
        descLower.includes('bônus') ||
        descLower.includes('bonus') ||
        descLower.includes('gratuito') ||
        descLower.includes('recompensa') ||
        descLower.includes('promo');

      const amountCents = Math.round(record.amount * 100);
      if (isFree) {
        freeAmtCents = amountCents;
      } else {
        paidAmtCents = amountCents;
      }
    }

    paidCreditsCents += paidAmtCents;
    freeCreditsCents += freeAmtCents;
  }

  const totalCreditsCents = paidCreditsCents + freeCreditsCents;
  if (totalCreditsCents === 0) return 1.0;
  
  const ratio = paidCreditsCents / totalCreditsCents;
  return Math.max(0.0, Math.min(1.0, ratio));
}

/**
 * Helper to subtract days from YYYY-MM-DD string
 */
export function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone shifts
  date.setDate(date.getDate() - days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 3. Allocate paid ads to orders using a 30-day moving window.
 * Formula: orderAds = paidAds30Days * (orderSubtotal / totalCompletedOrdersSubtotal30Days)
 */
export function allocatePaidAdsToOrders(
  orders: Order[],
  billingRecords: AdsBillingRecord[]
): Map<string, {
  allocatedAdsCents: number;
  paidRatio: number;
  adsConsumedCents: number;
  paidCreditsCents: number;
  freeCreditsCents: number;
  totalSubtotalCents: number;
}> {
  const sortedOrders = [...orders].sort((a, b) => a.order_date.localeCompare(b.order_date));
  const eligibleOrders = sortedOrders.filter(o => {
    const s = (o.status || '').toLowerCase();
    return !s.includes('cancelado') && !s.includes('devolvido') && !s.includes('reembolsado');
  });
  const allocationMap = new Map<string, {
    allocatedAdsCents: number;
    paidRatio: number;
    adsConsumedCents: number;
    paidCreditsCents: number;
    freeCreditsCents: number;
    totalSubtotalCents: number;
  }>();

  // Group eligible orders by date (YYYY-MM-DD)
  const ordersByDate = new Map<string, Order[]>();
  for (const order of eligibleOrders) {
    const dateStr = order.order_date.split('T')[0];
    const group = ordersByDate.get(dateStr) || [];
    group.push(order);
    ordersByDate.set(dateStr, group);
  }

  // Iterate over each date group
  for (const [dateStr, dayOrders] of ordersByDate.entries()) {
    const startDate30 = subtractDays(dateStr, 29);
    const endDate30 = dateStr;

    // A. Sum ads consumed (deductions) in this 30-day window
    let adsConsumedCents = 0;
    for (const record of billingRecords) {
      if (record.transaction_date >= startDate30 && record.transaction_date <= endDate30) {
        if (record.amount < 0) {
          adsConsumedCents += Math.round(Math.abs(record.amount) * 100);
        }
      }
    }

    // B. Calculate paidRatio in this 30-day window
    let paidCreditsCents = 0;
    let freeCreditsCents = 0;

    for (const record of billingRecords) {
      if (record.amount <= 0) continue;
      if (record.transaction_date >= startDate30 && record.transaction_date <= endDate30) {
        let paidAmtCents = 0;
        let freeAmtCents = 0;

        if (record.credit_paid !== null && record.credit_paid !== undefined) {
          paidAmtCents = Math.round(record.credit_paid * 100);
          freeAmtCents = Math.round((record.credit_free || 0) * 100);
        } else {
          const descLower = (record.description || '').toLowerCase();
          const isFree =
            descLower.includes('free') ||
            descLower.includes('bônus') ||
            descLower.includes('bonus') ||
            descLower.includes('gratuito') ||
            descLower.includes('recompensa') ||
            descLower.includes('promo');

          const amountCents = Math.round(record.amount * 100);
          if (isFree) {
            freeAmtCents = amountCents;
          } else {
            paidAmtCents = amountCents;
          }
        }
        paidCreditsCents += paidAmtCents;
        freeCreditsCents += freeAmtCents;
      }
    }

    const totalCreditsCents = paidCreditsCents + freeCreditsCents;
    const paidRatio = totalCreditsCents === 0 ? 1.0 : paidCreditsCents / totalCreditsCents;
    const paidAdsCents = Math.round(adsConsumedCents * paidRatio);

    // C. Sum effective subtotals of eligible orders in this 30-day window
    let totalSubtotalCents = 0;
    for (const other of eligibleOrders) {
      const otherDateStr = other.order_date.split('T')[0];
      if (otherDateStr >= startDate30 && otherDateStr <= endDate30) {
        const subtotal = Math.round(((other.original_price || 0) - (other.seller_discount || 0)) * 100);
        totalSubtotalCents += subtotal;
      }
    }

    // D. Sum effective subtotals of orders on this specific day
    let daySubtotalCents = 0;
    for (const order of dayOrders) {
      const subtotal = Math.round(((order.original_price || 0) - (order.seller_discount || 0)) * 100);
      daySubtotalCents += subtotal;
    }

    // E. Calculate the total ads allocated to this day
    let dayShareOfAdsCents = 0;
    if (totalSubtotalCents > 0) {
      dayShareOfAdsCents = Math.round((paidAdsCents * daySubtotalCents) / totalSubtotalCents);
    }

    // F. Distribute dayShareOfAdsCents among orders of this day, adjusting rounding on the last one
    let allocatedSum = 0;
    for (let i = 0; i < dayOrders.length; i++) {
      const order = dayOrders[i];
      const orderSubtotalCents = Math.round(((order.original_price || 0) - (order.seller_discount || 0)) * 100);
      
      let allocatedAdsCents = 0;
      if (i === dayOrders.length - 1) {
        // Last order of the day gets the remainder to prevent cents leakage
        allocatedAdsCents = dayShareOfAdsCents - allocatedSum;
      } else {
        if (daySubtotalCents > 0) {
          allocatedAdsCents = Math.round((dayShareOfAdsCents * orderSubtotalCents) / daySubtotalCents);
        }
        allocatedSum += allocatedAdsCents;
      }

      allocationMap.set(order.order_id, {
        allocatedAdsCents,
        paidRatio,
        adsConsumedCents,
        paidCreditsCents,
        freeCreditsCents,
        totalSubtotalCents
      });
    }
  }

  return allocationMap;
}

/**
 * 4. Main profit calculator function.
 * Updates CalculatedOrder object with product cost, ads cost, profit, and audit logs.
 */
export function calculateProfit(
  orders: Order[],
  ads: AdData[],
  costs: ProductCost[],
  adsBillingRaw?: AdsBillingRecord[],
  netRevenueIncludesOrderCommissionTopup: boolean = false
): CalculatedOrder[] {
  const hasBillingData = adsBillingRaw && adsBillingRaw.length > 0;
  
  // Compute moving window ads allocation for all orders
  const adsAllocationMap = hasBillingData 
    ? allocatePaidAdsToOrders(orders, adsBillingRaw!) 
    : new Map<string, { allocatedAdsCents: number; paidRatio: number; adsConsumedCents: number; paidCreditsCents: number; freeCreditsCents: number; totalSubtotalCents: number }>();

  return orders.map((order) => {
    // 1. Determine Product Cost
    let product_cost = 0;
    const lowerName = (order.product_name || '').toLowerCase();
    let matchedCosts = 0;
    const orderDateStr = order.order_date.split('T')[0];

    for (const costItem of costs) {
      const termLower = costItem.search_term.toLowerCase();
      if (lowerName.includes(termLower)) {
        let isZeroCost = false;
        
        // A partir de 21/06, o custo de Windows 10 e Windows 11 é R$ 0,00.
        // De 21/06 a 28/06, o custo de Office 2016 e Office 2021 é R$ 0,00.
        if (orderDateStr >= '2026-06-21') {
          const isWindowsZeroCost = lowerName.includes('windows 10') || lowerName.includes('windows 11');
          const isWindowsTerm = termLower.includes('windows');
          if (isWindowsZeroCost && isWindowsTerm) {
            isZeroCost = true;
          }

          if (orderDateStr <= '2026-06-28') {
            const isLegacyOfficeZeroCost = lowerName.includes('office 2021') || lowerName.includes('office 2016');
            const isOfficeTerm = termLower.includes('office');
            if (isLegacyOfficeZeroCost && isOfficeTerm) {
              isZeroCost = true;
            }
          }
        }

        // A partir de 29/06, o custo de todos os produtos Office é R$ 0,00.
        if (orderDateStr >= '2026-06-29') {
          if (lowerName.includes('office') && termLower.includes('office')) {
            isZeroCost = true;
          }
        }

        if (!isZeroCost) {
          if (costItem.cost !== null && costItem.cost !== undefined) {
            matchedCosts += costItem.cost;
          }
        }
      }
    }
    
    product_cost = matchedCosts * order.quantity;

    // 2. Determine Net Revenue before Ads
    const netRevenueBeforeAds = calculateNetRevenueBeforeAds(order, netRevenueIncludesOrderCommissionTopup);

    // 3. Determine Ads Cost
    let ads_cost = 0;
    let paidRatio = 1.0;
    let adsConsumedCents = 0;
    let paidCreditsCents = 0;
    let freeCreditsCents = 0;
    let totalSubtotalCents = 0;

    const statusLower = (order.status || '').toLowerCase();
    const isCancelled = statusLower.includes('cancelado') || statusLower.includes('devolvido') || statusLower.includes('reembolsado');

    if (!isCancelled) {
      if (hasBillingData) {
        const allocation = adsAllocationMap.get(order.order_id);
        if (allocation) {
          ads_cost = allocation.allocatedAdsCents / 100;
          paidRatio = allocation.paidRatio;
          adsConsumedCents = allocation.adsConsumedCents;
          paidCreditsCents = allocation.paidCreditsCents;
          freeCreditsCents = allocation.freeCreditsCents;
          totalSubtotalCents = allocation.totalSubtotalCents;
        }
      } else {
        // Fallback: legacy matching by product name in shopee_ads
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

    // 4. Calculate Net Profit
    const net_profit = netRevenueBeforeAds - product_cost - ads_cost;

    // 5. Build Audit details
    const subtotal = order.original_price || 0;
    const discounts = order.seller_discount || 0;
    const coupon = order.seller_coupon || 0;
    const comm = order.commission_fee || 0;
    const serv = order.service_fee || 0;
    // Reconstruct transactionFee/others
    const otherSellerCosts = Math.max(0, subtotal - discounts - coupon - comm - serv - order.total_revenue);

    const orderSubtotal = subtotal - discounts; // Effective subtotal sold
    const orderSubtotalCents = Math.round(orderSubtotal * 100);
    const realMargin = orderSubtotal > 0 ? net_profit / orderSubtotal : 0;

    const audit: OrderAudit = {
      orderSubtotal: subtotal,
      sellerDiscounts: discounts,
      transactionFee: otherSellerCosts, // transaction + reverse shipping
      commissionFee: comm,
      serviceFee: serv,
      otherSellerCosts: 0.0,
      netRevenueBeforeAds,
      productCost: product_cost,
      adsConsumedInPeriod: adsConsumedCents / 100,
      paidCreditsInPeriod: paidCreditsCents / 100,
      freeCreditsInPeriod: freeCreditsCents / 100,
      paidRatio,
      allocationWeight: totalSubtotalCents > 0 ? (orderSubtotal * 100) / totalSubtotalCents : 0,
      allocatedRawAds: totalSubtotalCents > 0 ? (adsConsumedCents * orderSubtotalCents) / totalSubtotalCents / 100 : 0,
      allocatedPaidAds: ads_cost,
      realProfit: net_profit,
      realMargin
    };

    return {
      ...order,
      product_cost,
      ads_cost,
      net_profit,
      paid_ratio: paidRatio,
      audit
    };
  });
}
