# Funcionamento do Cálculo de Lucro Líquido e Custos de Ads

Este documento detalha o funcionamento e a fórmula do cálculo de lucro líquido por pedido no painel de vendas da Shopee, considerando a importação dos relatórios de faturamento de anúncios (Ads).

---

## 1. Origem dos Dados

### Pedidos (`shopee_orders`)

* **Receita Líquida (`total_revenue`)**: É o valor líquido repassado pela Shopee por pedido (já com taxas, comissões e descontos da plataforma deduzidos).
* **Custo do Produto**: Calculado com base no custo cadastrado por termo de pesquisa do produto em `product_costs` multiplicado pela quantidade vendida.

### Faturamento de Ads (`shopee_ads_billing`)

* **Deduções (Gasto real)**: Valores negativos na coluna `quantidade` (ou `amount` no banco), representando o consumo diário de orçamento em anúncios.
* **Recargas (Investimento)**: Valores positivos na coluna `quantidade` (ou `amount`), que representam compras de créditos de anúncios (separados em créditos pagos e gratuitos/bônus na coluna `Observação`).

---

## 2. A Regra do Cálculo Proporcional

O custo diário de anúncios é distribuído entre os pedidos do dia de forma **proporcional à receita** que cada pedido gerou, garantindo uma atribuição justa do custo de marketing aos produtos mais vendidos.

### A Fórmula do Custo de Ads por Pedido

$$Custo\ de\ Ads\ do\ Pedido = \frac{Gasto\ Total\ de\ Ads\ no\ Dia \times Receita\ Líquida\ do\ Pedido}{Receita\ Total\ de\ todos\ os\ Pedidos\ do\ Dia}$$

---

## 3. Exemplo Prático

No dia **18/06/2026**:

* O gasto de anúncios total do dia extraído do arquivo de billing foi de **R$ 10,00**.
* Houve 2 pedidos ativos (não cancelados):
  * **Pedido A**: Receita líquida de **R$ 30,00**
  * **Pedido B**: Receita líquida de **R$ 10,00**
  * **Receita Total do Dia** = $R\$\ 30,00 + R\$\ 10,00 = R\$\ 40,00$

### Distribuição do Custo de Ads

* **Pedido A (gerou 75% da receita do dia):**
  $$Custo\ de\ Ads = \frac{R\$\ 10,00 \times R\$\ 30,00}{R\$\ 40,00} = R\$\ 7,50$$

* **Pedido B (gerou 25% da receita do dia):**
  $$Custo\ de\ Ads = \frac{R\$\ 10,00 \times R\$\ 10,00}{R\$\ 40,00} = R\$\ 2,50$$

---

## 4. O Cálculo do Lucro Líquido

O cálculo final por pedido é:

$$Lucro\ Líquido = Receita\ Líquida - Custo\ do\ Produto - Custo\ de\ Ads$$

---

## 5. Fluxo de Atualização com Pedidos Novos

O sistema se adapta de forma dinâmica dependendo da ordem das importações:

1. **Se você importar novos pedidos para um dia que já possui dados de Billing:**
   * A **Receita Total do Dia** é recalculada automaticamente.
   * O **Custo de Ads** daquele dia é redistribuído proporcionalmente de forma instantânea entre todos os pedidos (antigos e novos) daquela data.
   * O lucro líquido de todos os pedidos daquele dia se atualiza no dashboard.

2. **Se você importar novos pedidos para um dia que ainda não possui dados de Billing:**
   * O custo de anúncios para esses pedidos ficará temporariamente como **R$ 0,00**.
   * O lucro líquido parcial será exibido considerando apenas o custo do produto.
   * Assim que você importar o arquivo de faturamento de Ads contendo a data desses pedidos, o sistema identificará o gasto diário de Ads e fará a partilha proporcional do custo automaticamente.
