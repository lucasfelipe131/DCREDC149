export const fields = {
  revenue: 'Receita operacional prevista em 12 meses (R$)',
  otherIncome: 'Outras entradas disponíveis em 12 meses (R$)',
  operatingCosts:
    'Custos, tributos e desembolsos operacionais em 12 meses (R$)',
  householdCosts: 'Retiradas familiares em 12 meses (R$)',
  existingDebtService: 'Parcelas de dívidas existentes em 12 meses (R$)',
  principal: 'Crédito solicitado (R$)',
  monthlyRate: 'Taxa de juros mensal (%)',
  termMonths: 'Prazo total (meses)',
  collateral: 'Valor declarado das garantias (R$)',
  stressRevenuePct: 'Queda de receita no cenário adverso (%)',
  stressCostPct: 'Aumento de custos no cenário adverso (%)',
};
export const required = [
  'revenue',
  'otherIncome',
  'operatingCosts',
  'householdCosts',
  'existingDebtService',
  'principal',
  'monthlyRate',
  'termMonths',
  'stressRevenuePct',
  'stressCostPct',
];
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function analyze(data, documents = []) {
  const missing = required.filter(
    (k) => typeof data[k] !== 'number' || !Number.isFinite(data[k]),
  );
  const warnings = [];
  if (!documents.length)
    warnings.push('Nenhum documento anexado para sustentar os dados.');
  if (documents.some((d) => d.status !== 'reviewed'))
    warnings.push('Existem documentos sem conferência humana concluída.');
  for (const key of required)
    if (!data.sources?.[key])
      warnings.push(`Fonte não informada: ${fields[key]}.`);
  if (!data.history) warnings.push('Histórico produtivo não informado.');
  if (!data.soil) warnings.push('Informações de solo não informadas.');
  if (!data.climate) warnings.push('Riscos climáticos não descritos.');
  const common = {
    model: 'cashflow-price-12m-v1',
    horizonMonths: 12,
    missing: missing.map((k) => fields[k]),
    warnings,
    assumptions: [
      'Parcelas mensais constantes (Price), primeira parcela em um mês, sem carência.',
      'Valores nominais: não inclui IOF, tarifas, seguros ou encargos não informados. Não é cálculo de CET.',
      'Entradas e desembolsos devem corresponder aos mesmos próximos 12 meses. A soma anual não verifica o caixa de cada mês.',
      'Garantias são valores declarados: não há avaliação independente ou validação jurídica.',
      'Não há score de crédito nem aprovação automática.',
    ],
    externalSources: {
      climate: 'não conectado',
      soil: 'informado pelo usuário',
      CAR: 'não conectado',
      SIGEF: 'não conectado',
    },
    references: [
      {
        title: 'Iowa State University — Financial Performance Measures',
        url: 'https://www.extension.iastate.edu/agdm/wholefarm/html/c3-55.html',
      },
    ],
  };
  if (missing.length)
    return { ...common, status: 'incomplete', base: null, stress: null };
  const r = data.monthlyRate / 100,
    n = data.termMonths,
    p = data.principal;
  const installment =
    r === 0 ? p / n : (p * r) / -Math.expm1(-n * Math.log1p(r));
  const newDebt = installment * Math.min(12, n);
  const debt = data.existingDebtService + newDebt;
  const calc = (revenue, costs) => {
    const available = revenue + data.otherIncome - costs - data.householdCosts;
    return {
      revenue: round(revenue),
      costs: round(costs),
      available: round(available),
      debtService: round(debt),
      coverage: debt > 0 ? round(available / debt) : null,
      balance: round(available - debt),
      coversPayments: available >= debt,
    };
  };
  const base = calc(data.revenue, data.operatingCosts);
  const stress = calc(
    data.revenue * (1 - data.stressRevenuePct / 100),
    data.operatingCosts * (1 + data.stressCostPct / 100),
  );
  return {
    ...common,
    status: 'calculated',
    base,
    stress,
    installment: round(installment),
    newDebt12m: round(newDebt),
    totalNewPayments: round(installment * n),
    collateralCoverage:
      data.collateral == null ? null : round(data.collateral / p),
    breakEvenRevenue: round(
      data.operatingCosts + data.householdCosts + debt - data.otherIncome,
    ),
    conclusion: base.coversPayments
      ? 'O fluxo declarado cobre as parcelas estimadas no cenário base.'
      : 'O fluxo declarado não cobre as parcelas estimadas no cenário base.',
    stressConclusion: stress.coversPayments
      ? 'O cenário adverso informado mantém cobertura das parcelas.'
      : 'O cenário adverso informado apresenta insuficiência de caixa.',
    formulas: {
      installment: 'P × i / [1 − (1 + i)^(-n)]; para i = 0: P / n',
      available:
        'Receita + outras entradas − custos operacionais − retiradas familiares',
      coverage:
        'Caixa disponível / (parcelas existentes + novas parcelas nos próximos 12 meses)',
      balance: 'Caixa disponível − serviço total da dívida em 12 meses',
    },
  };
}
