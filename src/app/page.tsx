'use client';

import { useEffect, useState, useMemo } from 'react';
import { fetchDashboardData, addSupplierPayment, deleteSupplierPayment } from '@/app/actions';
import { AdData, AdsBillingDaily, AdsBillingRecord, OrderAudit, CalculatedOrder, calculateProfit, SupplierPayment } from '@/utils/profitCalculator';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, ShoppingBag, CheckCircle, Clock, AlertTriangle, Wallet, History, Plus, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Dashboard() {
  const [orders, setOrders] = useState<CalculatedOrder[]>([]);
  const [ads, setAds] = useState<AdData[]>([]);
  const [adsBillingDaily, setAdsBillingDaily] = useState<AdsBillingDaily[]>([]);
  const [adsBillingRaw, setAdsBillingRaw] = useState<AdsBillingRecord[]>([]);
  const [auditOrder, setAuditOrder] = useState<CalculatedOrder | null>(null);
  const [dailyRecharges, setDailyRecharges] = useState<{date: string; paid: number; free: number}[]>([]);
  const [totalRechargesPaid, setTotalRechargesPaid] = useState(0);
  const [totalFreeCredits, setTotalFreeCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedValueRange, setSelectedValueRange] = useState<string>('all');
  const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false);

  const [activeFilter, setActiveFilter] = useState<'today' | 'week' | 'month' | 'all' | null>(null);

  const setQuickFilter = (type: 'today' | 'week' | 'month' | 'all') => {
    setActiveFilter(type);
    const today = new Date();
    
    if (type === 'today') {
      const todayStr = getLocalDateString(today);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === 'week') {
      const start = new Date();
      start.setDate(today.getDate() - 6);
      const startStr = getLocalDateString(start);
      const endStr = getLocalDateString(today);
      
      setStartDate(startStr);
      setEndDate(endStr);
    } else if (type === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const firstDayStr = getLocalDateString(firstDay);
      
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const lastDayStr = getLocalDateString(lastDay);
      
      setStartDate(firstDayStr);
      setEndDate(lastDayStr);
    } else if (type === 'all') {
      if (orders.length > 0) {
        const dates = orders.map(o => getLocalDateString(new Date(o.order_date)));
        dates.sort();
        setStartDate(dates[0]);
        setEndDate(dates[dates.length - 1]);
      } else {
        setStartDate('');
        setEndDate('');
      }
    }
  };

  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const openPaymentModal = () => {
    setPaymentAmount('');
    setPaymentDate(getLocalDateString(new Date()));
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Por favor, insira um valor válido maior que zero.');
      return;
    }
    
    setIsSavingPayment(true);
    try {
      await addSupplierPayment(amountNum, paymentDate, paymentNotes);
      await fetchData();
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar pagamento ao fornecedor.');
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro de pagamento?')) return;
    
    try {
      await deleteSupplierPayment(id);
      await fetchData();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir pagamento.');
    }
  };

  const totalPaidToSupplier = useMemo(() => {
    return supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [supplierPayments]);

  const fetchData = async () => {
    setLoading(true);
    
    try {
      const data = await fetchDashboardData();
      const calcOrders = calculateProfit(
        data.orders, 
        data.ads, 
        data.costs,
        data.adsBillingRaw || []
      );
      setOrders(calcOrders);
      setAds(data.ads);
      setAdsBillingDaily(data.adsBillingDaily || []);
      setAdsBillingRaw(data.adsBillingRaw || []);
      setDailyRecharges(data.dailyRecharges || []);
      setTotalRechargesPaid(data.totalRechargesPaid || 0);
      setTotalFreeCredits(data.totalFreeCredits || 0);
      setSupplierPayments(data.supplierPayments || []);

      const products = new Set<string>();
      calcOrders.forEach(o => {
        if (o.product_name) products.add(o.product_name);
      });
      setSelectedProducts(Array.from(products));

      // Set default date range to 'today'
      const todayStr = getLocalDateString(new Date());
      setStartDate(todayStr);
      setEndDate(todayStr);
      setActiveFilter('today');
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchData();
    });
  }, []);

  const availableProducts = useMemo(() => {
    const products = new Set<string>();
    orders.forEach(o => {
      if (o.product_name) products.add(o.product_name);
    });
    return Array.from(products).sort();
  }, [orders]);

  const { totalRevenue, totalAdsCost, totalProductCost, totalProfit, totalOrders, cancelledOrders, chartData, filteredOrders, totalReceived, totalPending, globalProductCost, filteredPaidRecharges, filteredFreeCredits, paidRatio } = useMemo(() => {
    let tr = 0;
    let tProductCost = 0;
    let tAdsCost = 0;
    let validOrdersCount = 0;
    let cancelledCount = 0;
    let totalReceived = 0;
    let totalPending = 0;

    let gProductCost = 0;
    orders.forEach(order => {
      if (!order.status?.toLowerCase().includes('cancelado')) {
        gProductCost += order.product_cost;
      }
    });

    const dailyData: Record<string, { date: string, revenue: number, profit: number, ads: number }> = {};

    const filtered = orders.filter(o => {
      const orderDateStr = getLocalDateString(new Date(o.order_date));

      // Date range filter
      if (startDate && orderDateStr < startDate) return false;
      if (endDate && orderDateStr > endDate) return false;

      // Product filter
      if (!selectedProducts.includes(o.product_name)) return false;

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
      if (order.status?.toLowerCase().includes('cancelado')) {
        cancelledCount++;
        return;
      }

      tr += order.total_revenue;
      tProductCost += order.product_cost;
      tAdsCost += order.ads_cost;
      validOrdersCount++;

      if (order.payout_amount !== undefined && order.payout_amount !== null) {
        totalReceived += order.payout_amount;
      } else {
        if (!order.payout_unmatched) {
          totalPending += order.total_revenue;
        }
      }

      const dateStr = format(parseISO(order.order_date), 'dd/MM/yyyy');
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { date: dateStr, revenue: 0, profit: 0, ads: 0 };
      }
      dailyData[dateStr].revenue += order.total_revenue;
      dailyData[dateStr].profit += order.net_profit;
      dailyData[dateStr].ads += order.ads_cost;
    });

    // Filter daily recharges by the dashboard date range
    let fPaidRecharges = 0;
    let fFreeCredits = 0;
    for (const dr of dailyRecharges) {
      if (startDate && dr.date < startDate) continue;
      if (endDate && dr.date > endDate) continue;
      fPaidRecharges += dr.paid;
      fFreeCredits += dr.free;
    }

    // paidRatio: proportion of ads wallet that was paid from pocket
    // Uses ALL-TIME recharges (not date-filtered) because the wallet is cumulative —
    // a recharge on 26/06 pays for clicks on 02/07.
    // e.g. R$ 500 paid + R$ 312 free = 61.55% paid
    const globalTotalRecharges = totalRechargesPaid + totalFreeCredits;
    const ratio = globalTotalRecharges > 0 ? totalRechargesPaid / globalTotalRecharges : 1;

    // Lucro Real = Receita - Custo de Produtos - Custo de Ads Rateado
    const tp = tr - tProductCost - tAdsCost;

    return {
      totalRevenue: tr,
      totalAdsCost: tAdsCost,
      totalProductCost: tProductCost,
      totalProfit: tp,
      totalOrders: validOrdersCount,
      cancelledOrders: cancelledCount,
      chartData: Object.values(dailyData),
      filteredOrders: filtered,
      totalReceived,
      totalPending,
      globalProductCost: gProductCost,
      filteredPaidRecharges: fPaidRecharges,
      filteredFreeCredits: fFreeCredits,
      paidRatio: ratio
    };
  }, [orders, dailyRecharges, totalRechargesPaid, totalFreeCredits, startDate, endDate, selectedProducts, selectedValueRange]);

  // Remove availableMonths since we use calendar inputs now

  if (loading) {
    return <div style={{ color: 'var(--text-muted)' }}>Analisando dados do Supabase...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Resumo Geral</h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Quick Search Date Filters */}
          <div style={{ display: 'flex', backgroundColor: '#1e2130', borderRadius: '8px', border: '1px solid #2d3748', overflow: 'hidden' }}>
            <button 
              onClick={() => setQuickFilter('today')} 
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                color: activeFilter === 'today' ? 'white' : 'var(--text-muted)',
                backgroundColor: activeFilter === 'today' ? 'var(--primary)' : 'transparent',
                transition: 'all 0.2s',
                fontWeight: activeFilter === 'today' ? '600' : 'normal',
                cursor: 'pointer'
              }}
            >
              Hoje
            </button>
            <button 
              onClick={() => setQuickFilter('week')} 
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                color: activeFilter === 'week' ? 'white' : 'var(--text-muted)',
                backgroundColor: activeFilter === 'week' ? 'var(--primary)' : 'transparent',
                borderLeft: '1px solid #2d3748',
                transition: 'all 0.2s',
                fontWeight: activeFilter === 'week' ? '600' : 'normal',
                cursor: 'pointer'
              }}
            >
              Semana
            </button>
            <button 
              onClick={() => setQuickFilter('month')} 
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                color: activeFilter === 'month' ? 'white' : 'var(--text-muted)',
                backgroundColor: activeFilter === 'month' ? 'var(--primary)' : 'transparent',
                borderLeft: '1px solid #2d3748',
                transition: 'all 0.2s',
                fontWeight: activeFilter === 'month' ? '600' : 'normal',
                cursor: 'pointer'
              }}
            >
              Mês
            </button>
            <button 
              onClick={() => setQuickFilter('all')} 
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                color: activeFilter === 'all' ? 'white' : 'var(--text-muted)',
                backgroundColor: activeFilter === 'all' ? 'var(--primary)' : 'transparent',
                borderLeft: '1px solid #2d3748',
                transition: 'all 0.2s',
                fontWeight: activeFilter === 'all' ? '600' : 'normal',
                cursor: 'pointer'
              }}
            >
              Tudo
            </button>
          </div>

          {/* Calendar Inputs for Start Date and End Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#1e2130', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid #2d3748' }}>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => {
                setStartDate(e.target.value);
                setActiveFilter(null);
              }} 
              style={{ 
                backgroundColor: 'transparent', 
                color: 'var(--text)', 
                border: 'none', 
                outline: 'none', 
                fontSize: '0.875rem',
                cursor: 'pointer'
              }} 
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>até</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => {
                setEndDate(e.target.value);
                setActiveFilter(null);
              }} 
              style={{ 
                backgroundColor: 'transparent', 
                color: 'var(--text)', 
                border: 'none', 
                outline: 'none', 
                fontSize: '0.875rem',
                cursor: 'pointer'
              }} 
            />
          </div>

          {/* Product Filter (Custom Multi-select Dropdown) */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsProductDropdownOpen(!isProductDropdownOpen)}
              style={{ 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                backgroundColor: '#1e2130', 
                color: 'var(--text)',
                border: '1px solid #2d3748',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                minWidth: '200px',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedProducts.length === 0 
                  ? "Nenhum Produto" 
                  : selectedProducts.length === availableProducts.length 
                    ? "Todos os Produtos" 
                    : `${selectedProducts.length} Selecionados`}
              </span>
              <span style={{ fontSize: '0.6rem' }}>▼</span>
            </button>
            
            {isProductDropdownOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setIsProductDropdownOpen(false)} />
                <div style={{ 
                  position: 'absolute', 
                  top: '100%', 
                  right: 0, 
                  backgroundColor: '#1e2130', 
                  border: '1px solid #2d3748', 
                  borderRadius: '8px', 
                  padding: '0.5rem', 
                  zIndex: 100, 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  minWidth: '260px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  marginTop: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.5rem', borderBottom: '1px solid #2d3748', marginBottom: '0.5rem', paddingBottom: '0.5rem' }}>
                    <button 
                      onClick={() => setSelectedProducts(availableProducts)} 
                      style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Selecionar Todos
                    </button>
                    <button 
                      onClick={() => setSelectedProducts([])} 
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Limpar
                    </button>
                  </div>
                  {availableProducts.map(p => {
                    const isChecked = selectedProducts.includes(p);
                    return (
                      <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text)' }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedProducts(selectedProducts.filter(item => item !== p));
                            } else {
                              setSelectedProducts([...selectedProducts, p]);
                            }
                          }}
                        />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }} title={p}>
                          {p}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Receita Líquida (Shopee)</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {totalRevenue.toFixed(2)}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: 'var(--success)' }}>
            <CheckCircle size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Recebido (Balanço)</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {totalReceived.toFixed(2)}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', color: 'var(--warning)' }}>
            <Clock size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Pendente de Liberação</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {totalPending.toFixed(2)}</h3>
          </div>
        </div>

        <div 
          className="card" 
          onClick={openPaymentModal}
          style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', cursor: 'pointer' }}
          title="Clique para ver o histórico e registrar pagamentos"
        >
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: 'var(--danger)' }}>
            <History size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Custo de Produtos (Saldo Devedor)</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {(globalProductCost - totalPaidToSupplier).toFixed(2)}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.625rem', marginTop: '0.125rem' }}>
              Acumulado: R$ {globalProductCost.toFixed(2)} | Pago: R$ {totalPaidToSupplier.toFixed(2)}
            </p>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', color: 'var(--danger)' }}>
            <TrendingDown size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Custo de Ads</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {totalAdsCost.toFixed(2)}</h3>
          </div>
        </div>

        {filteredPaidRecharges > 0 && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
            <div style={{ padding: '0.75rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', color: 'var(--warning)' }}>
              <Wallet size={20} />
            </div>
            <div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Investido (Recargas)</p>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {filteredPaidRecharges.toFixed(2)}</h3>
              {filteredFreeCredits > 0 && (
                <p style={{ color: 'var(--success)', fontSize: '0.625rem', marginTop: '0.125rem' }}>Bônus gratuito: R$ {filteredFreeCredits.toFixed(2)}</p>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '12px', color: 'var(--success)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Lucro Real</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>R$ {totalProfit.toFixed(2)}</h3>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
            <ShoppingBag size={20} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total de Pedidos</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {totalOrders} 
              {cancelledOrders > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--danger)', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.125rem 0.35rem', borderRadius: '4px' }}>
                  {cancelledOrders} canc.
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                <th>Qtd.</th>
                <th>Subtotal Vendido</th>
                <th>Receita Líq. (Antes Ads)</th>
                <th>Custo Produto</th>
                <th>Ads Consumido Rateado</th>
                <th>% Pago Ads</th>
                <th title="Custo de Ads real pago é o consumo efetivo de anúncios rateado entre os pedidos, descontada somente a parcela financiada por créditos promocionais gratuitos." style={{ cursor: 'help' }}>
                  Custo Ads Real (?)
                </th>
                <th>Lucro Real</th>
                <th>Margem Real</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const isCancelled = order.status?.toLowerCase().includes('cancelado');
                const isUnmatched = order.payout_unmatched;
                
                let rowStyle: React.CSSProperties = {};
                if (isCancelled) {
                  rowStyle = { opacity: 0.5, backgroundColor: 'rgba(255, 255, 255, 0.02)' };
                } else if (isUnmatched) {
                  rowStyle = { backgroundColor: 'rgba(245, 158, 11, 0.05)', borderLeft: '3px solid var(--warning)' };
                }

                return (
                  <tr key={order.order_id} style={rowStyle}>
                    <td style={{ fontSize: '0.875rem', fontWeight: isUnmatched ? 'bold' : 'normal' }}>
                      {isUnmatched && <AlertTriangle size={14} className="text-warning" style={{ display: 'inline', marginRight: '0.25rem', verticalAlign: 'text-bottom' }} />}
                      {order.order_id}
                    </td>
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
                    <td style={{ 
                      maxWidth: '200px', 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      color: isUnmatched ? 'var(--warning)' : 'inherit',
                      fontStyle: isUnmatched ? 'italic' : 'normal'
                    }} title={order.product_name}>
                      {order.product_name}
                    </td>
                    <td style={{ textAlign: 'center' }}>{order.quantity}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      R$ {((order.original_price || 0) - (order.seller_discount || 0)).toFixed(2)}
                    </td>
                    <td>
                      R$ {(order.audit?.netRevenueBeforeAds || order.total_revenue).toFixed(2)}
                    </td>
                    <td className="text-danger">- R$ {order.product_cost.toFixed(2)}</td>
                    <td className="text-danger">- R$ {(order.audit?.allocatedRawAds || 0).toFixed(2)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {((order.audit?.paidRatio || 0) * 100).toFixed(1)}%
                    </td>
                    <td className="text-danger">- R$ {order.ads_cost.toFixed(2)}</td>
                    <td className={(order.net_profit >= 0 && !isCancelled) ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                      R$ {order.net_profit.toFixed(2)}
                    </td>
                    <td className={(order.audit?.realMargin || 0) >= 0 && !isCancelled ? 'text-success' : 'text-danger'} style={{ fontWeight: 'bold' }}>
                      {((order.audit?.realMargin || 0) * 100).toFixed(1)}%
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setAuditOrder(order)}
                      >
                        Auditar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Nenhum pedido importado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Pagamentos ao Fornecedor */}
      {isPaymentModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '550px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} style={{ color: 'var(--primary)' }} />
                Pagamentos ao Fornecedor
              </h3>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                style={{ color: 'var(--text-muted)', transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Summary Stats */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                gap: '1rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>CUSTO TOTAL ACUMULADO</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--text)' }}>R$ {globalProductCost.toFixed(2)}</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>TOTAL PAGO (ABATIDO)</p>
                  <p style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--success)' }}>R$ {totalPaidToSupplier.toFixed(2)}</p>
                </div>
                <div style={{ gridColumn: 'span 2', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', marginTop: '0.25rem' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>SALDO DEVEDOR REMANESCENTE</p>
                  <p style={{ fontSize: '1.375rem', fontWeight: 'bold', color: 'var(--danger)' }}>R$ {(globalProductCost - totalPaidToSupplier).toFixed(2)}</p>
                </div>
              </div>

              {/* Add Payment Form */}
              <form onSubmit={handleAddPayment} style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                padding: '1.25rem', 
                border: '1px solid rgba(79, 70, 229, 0.3)', 
                backgroundColor: 'rgba(79, 70, 229, 0.03)', 
                borderRadius: '8px' 
              }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: '0.25rem' }}>
                  Registrar Novo Pagamento / Abatimento
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem' }}>Valor (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      required 
                      placeholder="0.00" 
                      className="input"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      disabled={isSavingPayment}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem' }}>Data do Pagamento</label>
                    <input 
                      type="date" 
                      required 
                      className="input"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      disabled={isSavingPayment}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem' }}>Observação (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Pagamento referente ao lote de junho" 
                    className="input"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    disabled={isSavingPayment}
                  />
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '0.5rem' }}
                  disabled={isSavingPayment}
                >
                  <Plus size={16} />
                  {isSavingPayment ? 'Salvando...' : 'Confirmar Lançamento'}
                </button>
              </form>

              {/* Payments History List */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                  Histórico de Abatimentos
                </h4>
                {supplierPayments.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem' }}>
                    Nenhum pagamento registrado ainda.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {supplierPayments.map((payment) => (
                      <div 
                        key={payment.id} 
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem 1rem',
                          backgroundColor: 'rgba(255, 255, 255, 0.01)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '0.875rem', color: 'var(--success)' }}>
                              R$ {payment.amount.toFixed(2)}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {format(parseISO(payment.payment_date.split('T')[0]), 'dd/MM/yyyy')}
                            </span>
                          </div>
                          {payment.notes && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                              {payment.notes}
                            </p>
                          )}
                        </div>
                        <button 
                          onClick={() => handleDeletePayment(payment.id)}
                          style={{ color: 'var(--text-muted)', padding: '0.25rem', transition: 'color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="btn btn-secondary"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Auditoria do Pedido */}
      {auditOrder && auditOrder.audit && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0 }}>
                  Auditoria de Lucro Real
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.125rem 0 0 0' }}>
                  Pedido ID: <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{auditOrder.order_id}</span>
                </p>
              </div>
              <button 
                onClick={() => setAuditOrder(null)}
                style={{ 
                  color: 'var(--text-muted)', 
                  backgroundColor: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Product Info */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Item Vendido</p>
                <p style={{ fontSize: '0.9375rem', fontWeight: '500', color: 'var(--text)' }}>{auditOrder.product_name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Quantidade: {auditOrder.quantity}</p>
              </div>

              {/* Grid with calculations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                
                {/* Left Column: Receita e Custos Shopee */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
                    1. Fluxo Financeiro Shopee
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Preço Subtotal:</span>
                    <span>R$ {auditOrder.audit.orderSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--warning)' }}>
                    <span>(-) Descontos Vendedor:</span>
                    <span>- R$ {auditOrder.audit.sellerDiscounts.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Comissão Shopee:</span>
                    <span>- R$ {auditOrder.audit.commissionFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Taxa Serviço:</span>
                    <span>- R$ {auditOrder.audit.serviceFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Taxa Transação / Envios:</span>
                    <span>- R$ {auditOrder.audit.transactionFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 'bold', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span>Receita Líquida (Antes Ads):</span>
                    <span className="text-success">R$ {auditOrder.audit.netRevenueBeforeAds.toFixed(2)}</span>
                  </div>
                </div>

                {/* Right Column: Custo Produto e Ads */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem' }}>
                    2. Custos de Operação (Bolso)
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Custo do Fornecedor:</span>
                    <span className="text-danger">R$ {auditOrder.audit.productCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ads Consumido Rateado (Bruto):</span>
                    <span className="text-danger">R$ {auditOrder.audit.allocatedRawAds.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Proporção Paga (paidRatio):</span>
                    <span>{(auditOrder.audit.paidRatio * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 'bold', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span>Custo de Ads Real Pago (Bolso):</span>
                    <span className="text-danger">R$ {auditOrder.audit.allocatedPaidAds.toFixed(2)}</span>
                  </div>
                </div>

              </div>

              {/* Moving Window Audit Detail */}
              <div style={{ 
                backgroundColor: 'rgba(79, 70, 229, 0.04)', 
                border: '1px solid rgba(79, 70, 229, 0.2)', 
                padding: '1rem', 
                borderRadius: '8px',
                fontSize: '0.8125rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <p style={{ fontWeight: 'bold', color: 'var(--primary)' }}>Memória de Cálculo do Rateio de Ads (Janela 30 dias)</p>
                <p style={{ color: 'var(--text-muted)' }}>
                  O rateio baseia-se na janela de 30 dias que termina na data do pedido (<b>{format(parseISO(auditOrder.order_date), 'dd/MM/yyyy')}</b>):
                </p>
                <ul style={{ paddingLeft: '1.25rem', margin: 0, color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <li>Gasto bruto de Ads na janela: <b>R$ {auditOrder.audit.adsConsumedInPeriod.toFixed(2)}</b></li>
                  <li>Dinheiro de recargas reais da janela: <b>R$ {auditOrder.audit.paidCreditsInPeriod.toFixed(2)}</b></li>
                  <li>Créditos gratuitos/bônus na janela: <b>R$ {auditOrder.audit.freeCreditsInPeriod.toFixed(2)}</b></li>
                  <li>Fator paidRatio da janela: <b>{(auditOrder.audit.paidRatio * 100).toFixed(2)}%</b></li>
                  <li>Ads real pago na janela (gasto × ratio): <b>R$ {(auditOrder.audit.adsConsumedInPeriod * auditOrder.audit.paidRatio).toFixed(2)}</b></li>
                  <li>Peso do pedido na janela: <b>{auditOrder.audit.allocationWeight.toFixed(4)}%</b></li>
                </ul>
              </div>

              {/* Net Profit Summary */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '1rem 1.25rem', 
                backgroundColor: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px' 
              }}>
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>LUCRO REAL DO PEDIDO</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: auditOrder.audit.realProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    R$ {auditOrder.audit.realProfit.toFixed(2)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>MARGEM REAL</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: auditOrder.audit.realMargin >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {(auditOrder.audit.realMargin * 100).toFixed(2)}%
                  </p>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(255, 255, 255, 0.02)'
            }}>
              <button 
                onClick={() => setAuditOrder(null)}
                className="btn btn-primary"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
