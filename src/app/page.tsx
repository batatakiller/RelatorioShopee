'use client';

import { useEffect, useState, useMemo } from 'react';
import { fetchDashboardData } from '@/app/actions';
import { Order, AdData, ProductCost, CalculatedOrder, calculateProfit } from '@/utils/profitCalculator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, ShoppingBag } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const [orders, setOrders] = useState<CalculatedOrder[]>([]);
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<string>('all');
  const [selectedValueRange, setSelectedValueRange] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    try {
      const data = await fetchDashboardData();
      const calcOrders = calculateProfit(
        data.orders, 
        data.ads, 
        data.costs
      );
      setOrders(calcOrders);
      setAds(data.ads);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const availableProducts = useMemo(() => {
    const products = new Set<string>();
    orders.forEach(o => {
      if (o.product_name) products.add(o.product_name);
    });
    return Array.from(products).sort();
  }, [orders]);

  const { totalRevenue, totalAdsCost, totalProfit, totalOrders, cancelledOrders, chartData, filteredOrders } = useMemo(() => {
    let tr = 0;
    let tProductCost = 0;
    let validOrdersCount = 0;
    let cancelledCount = 0;

    const dailyData: Record<string, { date: string, revenue: number, profit: number, ads: number }> = {};

    const filtered = orders.filter(o => {
      // Month filter
      if (selectedMonth !== 'all') {
        const orderMonth = format(parseISO(o.order_date), 'yyyy-MM');
        if (orderMonth !== selectedMonth) return false;
      }

      // Product filter
      if (selectedProduct !== 'all' && o.product_name !== selectedProduct) {
        return false;
      }

      // Price filter
      if (selectedValueRange !== 'all') {
        const price = o.original_price || 0;
        if (selectedValueRange === 'under30' && price > 30) return false;
        if (selectedValueRange === '30to100' && (price <= 30 || price > 100)) return false;
        if (selectedValueRange === 'over100' && price <= 100) return false;
      }

      return true;
    });

    filtered.forEach(order => {
      // Ignore Cancelado for KPIs and Charts
      if (order.status?.toLowerCase().includes('cancelado')) {
        cancelledCount++;
        return;
      }

      tr += order.total_revenue;
      tProductCost += order.product_cost;
      validOrdersCount++;

      const dateStr = format(parseISO(order.order_date), 'dd/MM/yyyy');
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { date: dateStr, revenue: 0, profit: 0, ads: 0 };
      }
      dailyData[dateStr].revenue += order.total_revenue;
      dailyData[dateStr].profit += order.net_profit;
      dailyData[dateStr].ads += order.ads_cost;
    });

    const filteredAds = ads.filter(ad => {
      // Month filter
      if (selectedMonth !== 'all') {
        const monthStr = format(parseISO(`${selectedMonth}-01`), 'MM/yyyy');
        if (!ad.report_period.includes(monthStr)) return false;
      }

      // Product filter
      if (selectedProduct !== 'all') {
        const adLower = ad.ad_name.toLowerCase();
        const prodLower = selectedProduct.toLowerCase();
        if (!adLower.includes(prodLower) && !prodLower.includes(adLower)) return false;
      }

      return true;
    });

    const realTotalAdsCost = filteredAds.reduce((sum, ad) => sum + ad.cost, 0);
    const tp = tr - tProductCost - realTotalAdsCost;

    return {
      totalRevenue: tr,
      totalAdsCost: realTotalAdsCost,
      totalProfit: tp,
      totalOrders: validOrdersCount,
      cancelledOrders: cancelledCount,
      chartData: Object.values(dailyData),
      filteredOrders: filtered
    };
  }, [orders, ads, selectedMonth, selectedProduct, selectedValueRange]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    orders.forEach(o => {
      const date = parseISO(o.order_date);
      months.add(format(date, 'yyyy-MM'));
    });
    return Array.from(months).sort().reverse();
  }, [orders]);

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Analisando dados do Supabase...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Resumo Geral</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Month Filter */}
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              backgroundColor: '#1e2130', 
              color: 'var(--text)',
              border: '1px solid #2d3748',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">Todos os Meses</option>
            {availableMonths.map(m => {
              const [year, month] = m.split('-');
              const date = new Date(parseInt(year), parseInt(month) - 1, 1);
              const label = format(date, 'MMMM yyyy', { locale: ptBR });
              return (
                <option key={m} value={m}>
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                </option>
              );
            })}
          </select>

          {/* Product Filter */}
          <select 
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              backgroundColor: '#1e2130', 
              color: 'var(--text)',
              border: '1px solid #2d3748',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              maxWidth: '220px'
            }}
          >
            <option value="all">Todos os Produtos</option>
            {availableProducts.map(p => (
              <option key={p} value={p} title={p}>
                {p.length > 25 ? `${p.slice(0, 25)}...` : p}
              </option>
            ))}
          </select>

          {/* Price Filter */}
          <select 
            value={selectedValueRange}
            onChange={(e) => setSelectedValueRange(e.target.value)}
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              backgroundColor: '#1e2130', 
              color: 'var(--text)',
              border: '1px solid #2d3748',
              outline: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            <option value="all">Todos os Preços</option>
            <option value="under30">Até R$ 30,00</option>
            <option value="30to100">R$ 30,00 a R$ 100,00</option>
            <option value="over100">Acima de R$ 100,00</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Receita Líquida (Shopee)</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>R$ {totalRevenue.toFixed(2)}</h3>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: 'var(--danger)' }}>
            <TrendingDown size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Custo Total de Ads</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>R$ {totalAdsCost.toFixed(2)}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: 'var(--success)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Lucro Real</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>R$ {totalProfit.toFixed(2)}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Total de Pedidos</p>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {totalOrders} 
              {cancelledOrders > 0 && (
                <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--danger)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>
                  {cancelledOrders} cancelados
                </span>
              )}
            </h3>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="card" style={{ marginBottom: '2rem', height: '400px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Desempenho Diário</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
            <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `R$ ${value}`} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e2130', borderColor: '#2d3748', color: '#f3f4f6', borderRadius: '8px' }}
              itemStyle={{ fontSize: '14px' }}
              formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, '']}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            <Bar dataKey="revenue" name="Receita" fill="#4F46E5" radius={[4, 4, 0, 0]} />
            <Bar dataKey="profit" name="Lucro" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ads" name="Ads" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Orders Table */}
      <div className="card">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Detalhamento por Pedido</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID Pedido</th>
                <th>Data</th>
                <th>Status</th>
                <th>Produto</th>
                <th>Preço Orig.</th>
                <th>Descontos</th>
                <th>Receita Liq.</th>
                <th>Custo Produto</th>
                <th>Custo Ads</th>
                <th>Lucro Líquido</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const isCancelled = order.status?.toLowerCase().includes('cancelado');
                const rowStyle = isCancelled ? { opacity: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.02)' } : {};
                
                return (
                  <tr key={order.order_id} style={rowStyle}>
                    <td style={{ fontSize: '0.875rem' }}>{order.order_id}</td>
                    <td>{format(parseISO(order.order_date), 'dd/MM/yy')}</td>
                    <td>
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem',
                        backgroundColor: isCancelled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                        color: isCancelled ? 'var(--danger)' : 'var(--success)'
                      }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={order.product_name}>
                      {order.product_name}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>R$ {order.original_price?.toFixed(2) || '0.00'}</td>
                    <td className="text-warning">- R$ {((order.seller_discount || 0) + (order.seller_coupon || 0)).toFixed(2)}</td>
                    <td>R$ {order.total_revenue.toFixed(2)}</td>
                    <td className="text-danger">- R$ {order.product_cost.toFixed(2)}</td>
                    <td className="text-danger">- R$ {order.ads_cost.toFixed(2)}</td>
                    <td className={order.net_profit >= 0 && !isCancelled ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                      R$ {order.net_profit.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum pedido importado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
