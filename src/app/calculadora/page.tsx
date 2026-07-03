'use client';

import { useState } from 'react';
import { Calculator, ArrowRight, DollarSign, Percent, TrendingUp, HelpCircle } from 'lucide-react';

export default function CalculatorPage() {
  // Input states
  const [originalPrice, setOriginalPrice] = useState<number>(50.0);
  const [productCost, setProductCost] = useState<number>(10.0);
  const [sellerDiscount, setSellerDiscount] = useState<number>(0.0);
  const [commissionRate, setCommissionRate] = useState<number>(18.0);
  const [serviceFee, setServiceFee] = useState<number>(7.51);
  const [transactionFee, setTransactionFee] = useState<number>(0.00);
  const [otherCosts, setOtherCosts] = useState<number>(0.0);
  const [adsRate, setAdsRate] = useState<number>(10.0); // 10% of sale price
  const [paidRatio, setPaidRatio] = useState<number>(85.0); // 85% paid from pocket

  // Calculations
  const subtotal = originalPrice;
  const commissionFee = subtotal * (commissionRate / 100);
  const orderSubtotal = Math.max(0, subtotal - sellerDiscount);
  // Service fee is now a fixed flat fee (R$ 7.51) if there is a sale
  const finalServiceFee = orderSubtotal > 0 ? serviceFee : 0;
  // Transaction fee is now fixed flat fee (R$ 0.00) if there is a sale
  const finalTransactionFee = orderSubtotal > 0 ? transactionFee : 0;
  
  const netRevenueBeforeAds = subtotal - sellerDiscount - commissionFee - finalServiceFee - finalTransactionFee - otherCosts;
  
  const rawAdsCost = subtotal * (adsRate / 100);
  const allocatedPaidAds = rawAdsCost * (paidRatio / 100);
  
  const realProfit = netRevenueBeforeAds - productCost - allocatedPaidAds;
  const realMargin = orderSubtotal > 0 ? (realProfit / orderSubtotal) * 100 : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <style>{`
        .tooltip-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          cursor: help;
        }
        .tooltip-text {
          visibility: hidden;
          width: 250px;
          background-color: #1e1e2f;
          color: #f3f4f6;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 12px;
          position: absolute;
          z-index: 100;
          bottom: 130%;
          left: 50%;
          transform: translateX(-50%);
          opacity: 0;
          transition: opacity 0.2s, visibility 0.2s;
          font-size: 0.75rem;
          font-weight: normal;
          line-height: 1.4;
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5);
        }
        .tooltip-container:hover .tooltip-text {
          visibility: visible;
          opacity: 1;
        }
        .tooltip-text::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -5px;
          border-width: 5px;
          border-style: solid;
          border-color: #1e1e2f transparent transparent transparent;
        }
      `}</style>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ padding: '0.75rem', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderRadius: '12px', color: 'var(--primary)' }}>
          <Calculator size={24} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>Simulador de Margem & Preço</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
            Simule o preço de venda de seus produtos e veja o lucro líquido real descontando todas as taxas da Shopee e anúncios.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
        {/* Left Column: Inputs Form */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', margin: 0 }}>
            Configurar Simulação
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Price & Cost */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Preço de Venda (R$)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    style={{ paddingLeft: '2rem', width: '100%' }}
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Custo do Produto (R$)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    style={{ paddingLeft: '2rem', width: '100%' }}
                    value={productCost}
                    onChange={(e) => setProductCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Discount & Extras */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Desconto do Vendedor (R$)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    style={{ paddingLeft: '2rem', width: '100%' }}
                    value={sellerDiscount}
                    onChange={(e) => setSellerDiscount(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Outros Custos (Frete/etc)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    style={{ paddingLeft: '2rem', width: '100%' }}
                    value={otherCosts}
                    onChange={(e) => setOtherCosts(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </div>

            {/* Fee Preset Buttons */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Atalho de Comissão Shopee</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', flex: 1 }}
                  onClick={() => { setCommissionRate(18); setServiceFee(0.00); }}
                >
                  Apenas Comissão (18%)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', flex: 1 }}
                  onClick={() => { setCommissionRate(18); setServiceFee(7.51); }}
                >
                  Comissão + Serviço (18% + R$ 7,51)
                </button>
              </div>
            </div>

            {/* Platform Fee Percentages */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Comissão (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className="input"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Serviço (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.375rem', fontWeight: 'bold' }}>Transação (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={transactionFee}
                  onChange={(e) => setTransactionFee(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Ads spent configuration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginTop: '0.25rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.375rem', fontWeight: 'bold' }}>
                  Gasto Ads (%)
                  <span className="tooltip-container">
                    <HelpCircle size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="tooltip-text">
                      Porcentagem do valor da venda consumido por cliques em anúncios. Ex: se o produto vende a R$ 50 e gasta R$ 5 em Ads para cada venda, esta taxa é de 10%.
                    </span>
                  </span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={adsRate}
                  onChange={(e) => setAdsRate(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.375rem', fontWeight: 'bold' }}>
                  Proporção Paga (%)
                  <span className="tooltip-container">
                    <HelpCircle size={14} style={{ color: 'var(--text-muted)' }} />
                    <span className="tooltip-text">
                      Fator paidRatio. Porcentagem do gasto de Ads pago com dinheiro real do seu bolso (recargas). O restante (créditos bônus ou gratuitos da Shopee) não é debitado de você.
                    </span>
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  className="input"
                  value={paidRatio}
                  onChange={(e) => setPaidRatio(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

          </div>
        </div>

        {/* Right Column: Simulated Audit Modal Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '0', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(79, 70, 229, 0.3)' }}>
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              backgroundColor: 'rgba(79, 70, 229, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, color: 'var(--primary)' }}>
                  Auditoria de Lucro Real Simulado
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.125rem 0 0 0' }}>
                  Pedido ID: <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>SIMULACAO-001</span>
                </p>
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Product Info */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.25rem', margin: 0 }}>Item Simulado</p>
                <p style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--text)', margin: 0 }}>Produto de Simulação Shopee</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.125rem', margin: 0 }}>Quantidade: 1</p>
              </div>

              {/* Grid with calculations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                
                {/* Left Column: Receita e Custos Shopee */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', margin: 0 }}>
                    1. Fluxo Financeiro Shopee
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Preço Subtotal:</span>
                    <span>R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--warning)' }}>
                    <span>(-) Desconto Vendedor:</span>
                    <span>- R$ {sellerDiscount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Comissão Shopee ({commissionRate}%):</span>
                    <span>- R$ {commissionFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Taxa Serviço:</span>
                    <span>- R$ {finalServiceFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--danger)' }}>
                    <span>(-) Taxa Transação:</span>
                    <span>- R$ {finalTransactionFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 'bold', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span>Receita Líquida:</span>
                    <span className="text-success">R$ {netRevenueBeforeAds.toFixed(2)}</span>
                  </div>
                </div>

                {/* Right Column: Custo Produto e Ads */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 'bold', color: 'var(--primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', margin: 0 }}>
                    2. Custos de Operação (Bolso)
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Custo do Fornecedor:</span>
                    <span className="text-danger">R$ {productCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Ads Estimado ({adsRate}%):</span>
                    <span className="text-danger">R$ {rawAdsCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Proporção Paga:</span>
                    <span>{paidRatio.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 'bold', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span>Custo de Ads Real Pago:</span>
                    <span className="text-danger">R$ {allocatedPaidAds.toFixed(2)}</span>
                  </div>
                </div>

              </div>

              {/* Net Profit Summary */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '1rem 1.25rem', 
                backgroundColor: 'rgba(255,255,255,0.02)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px',
                marginTop: '0.5rem'
              }}>
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>LUCRO REAL SIMULADO</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: realProfit >= 0 ? 'var(--success)' : 'var(--danger)', margin: '0.25rem 0 0 0' }}>
                    R$ {realProfit.toFixed(2)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold', margin: 0 }}>MARGEM REAL</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: realMargin >= 0 ? 'var(--success)' : 'var(--danger)', margin: '0.25rem 0 0 0' }}>
                    {realMargin.toFixed(2)}%
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
