export type TxType = 'receita' | 'despesa';
export type PaymentMethod = 'dinheiro' | 'pix' | 'debito' | 'credito';
export type ItemKind = 'product' | 'equipment';

export type Role = 'owner' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  businessName: string;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  isYou: boolean;
}

export interface Category {
  id: string;
  name: string;
  type: TxType;
  investment: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  notes: string | null;
}

export interface Product {
  id: string;
  name: string;
  unit: 'ml' | 'g' | 'unidade';
  packageCost: number;
  packageQty: number;
  salePrice: number;
  stock: number;
  avgCost: number;
  expiresAt: string | null;
  kind: 'operacional' | 'descartavel';
  /** Alert when stock falls to this many units (per product). */
  lowStockAt: number;
}

export interface Equipment {
  id: string;
  name: string;
  kind: 'utensilio' | 'maquina';
  qty: number;
  cost: number;
  usefulUses: number;
  kwh: number;
  baixas: number;
  perdaBaixa: number;
  baixadoEm: string | null;
  usos?: number;
  depreciacaoAcumulada?: number;
}

/** What deleting a product or asset would take with it. Appointments and
 *  services are listed because they change, not because they are deleted. */
export interface DeleteImpact {
  vendas: { count: number; total: number };
  compras: { count: number; total: number };
  atendimentos: { count: number };
  servicos: { count: number; names: string[] };
}

export interface ServiceItem {
  id: string;
  kind: ItemKind;
  productId: string | null;
  equipmentId: string | null;
  qty: number;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  category: string | null;
  items: ServiceItem[];
  cost: number;
}

export interface TxItem {
  id: string;
  kind: ItemKind;
  productId: string | null;
  equipmentId: string | null;
  qty: number;
}
export interface TxSale {
  id: string;
  productId: string;
  qty: number;
  unitPrice: number;
  unitCost: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  clientId: string | null;
  serviceId: string | null;
  distanciaKm: number | null;
  variableCost: number | null;
  date: string;
  note: string | null;
  capital: 'aporte' | 'pagamento' | null;
  capitalKind: 'capital' | 'emprestimo' | null;
  socio: string | null;
  payment: PaymentMethod | null;
  feeOf: string | null;
  prolabore: boolean;
  estoque: boolean;
  ativo: boolean;
  cashOnly: boolean;
  accrualOnly: boolean;
  packageId: string | null;
  items: TxItem[];
  sales: (TxSale & { product?: { name: string } | null })[];
  /** Set on "+ Entrada"/"+ Compra" purchase entries — what was bought. */
  product?: { name: string } | null;
  equipment?: { name: string } | null;
  category?: { name: string; type: TxType };
  client?: { name: string } | null;
  service?: { name: string } | null;
}

export interface Settings {
  energyPricePerKwh: number;
  costPerKm: number;
  prolaboreMode: 'pct' | 'fixo';
  prolaborePct: number;
  prolaboreFixo: number;
  metaMensal: number;
  taxaCredito: number;
  taxaDebito: number;
  taxaPix: number;
  emailDigestEnabled: boolean;
  emailBackupEnabled: boolean;
  receiptDoc: string;
  receiptPhone: string;
  receiptAddress: string;
  receiptCity: string;
  /** Rented treatment room: 'fixo' = salaFixo R$ per atendimento; 'pct' = salaPct% of its value. */
  salaMode: 'off' | 'fixo' | 'pct';
  salaFixo: number;
  salaPct: number;
  agendaStartHour: number;
  agendaEndHour: number;
  agendaSlotMin: number;
}

export interface Bill {
  id: string;
  kind: 'pagar' | 'receber';
  desc: string;
  amount: number;
  due: string;
  categoryId: string | null;
  clientId: string | null;
  note: string | null;
  recorrente: boolean;
  settled: boolean;
  settledAt: string | null;
  txId: string | null;
  recId: string | null;
}

export interface Recurring {
  id: string;
  desc: string;
  amount: number;
  dueDay: number;
  categoryId: string | null;
  geradas: string[];
  jaGerouEsteMes: boolean;
}

export interface Appointment {
  id: string;
  clientId: string;
  client: { id: string; name: string; phone: string | null };
  serviceId: string | null;
  service: { id: string; name: string } | null;
  date: string;
  time: string;
  durationMin: number;
  status: 'confirmed' | 'cancelled';
  note: string | null;
}

export interface DayAgenda {
  date: string;
  appointments: Appointment[];
  availableSlots: string[];
}

export interface PackageRow {
  id: string;
  clientId: string;
  serviceId: string | null;
  sessions: number;
  used: number;
  amount: number;
  date: string;
  aprazo: boolean;
  parcelas: number | null;
  serviceName?: string | null;
  restantes?: number;
}

export interface Alert {
  id: string;
  kind: 'bill' | 'stock' | 'client';
  overdue: boolean;
  text: string;
}

export interface ProlaboreSuggestion {
  base: number;
  amount: number;
  mode: 'pct' | 'fixo';
  pct: number;
  retirado: number;
}

export interface DashboardData {
  monthKey: string;
  receitasTotal: number;
  receitasOp: number;
  despesasTotal: number;
  saldo: number;
  lucroOp: number;
  metaMensal: number;
  metaPct: number;
  margem: number;
  custoVariavelTotal: number;
  atendimentosComFicha: number;
  prolabore: ProlaboreSuggestion;
  categoryBreakdown: { id: string; name: string; amount: number }[];
  recentTx: TxSummary[];
  alerts: Alert[];
  sociosList: { name: string; aportado: number; pago: number; saldo: number }[];
}

export interface TxSummary {
  id: string;
  type: TxType;
  amount: number;
  date: string;
  categoryName: string;
  clientName: string | null;
  variableCost: number | null;
  hasMargem: boolean;
  margem: number | null;
  cashOnly: boolean;
  accrualOnly: boolean;
  payment: string | null;
}

export interface DashboardYearData {
  year: number;
  receitas: number;
  despesas: number;
  lucroOp: number;
  monthsInYear: { month: number; monthKey: string; receita: number; despesa: number; saldo: number }[];
}

export interface DreNumbers {
  key: string;
  serv: number;
  vendas: number;
  receita: number;
  custoVar: number;
  cmv: number;
  margem: number;
  desp: number;
  prolabore: number;
  resultado: number;
  atendCount: number;
}

export interface BalanceSheet {
  caixa: number;
  estoque: number;
  equipBruto: number;
  depreciacao: number;
  equipAtivo: number;
  ativoOperacional: number;
  aReceber: number;
  aPagar: number;
  ativoTotal: number;
  passivoTotal: number;
  aportesTotal: number;
  capitalSocios: number;
  emprestimoSocios: number;
  receitaDiferida: number;
  lucrosAcumulados: number;
  perdaBaixas: number;
  plLiquido: number;
  resultadoARealizar: number;
  ajusteConciliar: number;
  caixaProjetado: number;
}

export interface ResultadoData {
  scope: 'month' | 'year';
  key: string;
  dre: DreNumbers;
  breakEven: number | null;
  despPorAtend: number;
  porServico: { name: string; count: number; receita: number; margem: number }[];
  porProduto: { name: string; qty: number; receita: number; margem: number }[];
  last6: { monthKey: string; receita: number; lucro: number; margemPct: number | null }[];
  balance: BalanceSheet;
}

export interface ContasData {
  aReceberTotal: number;
  aPagarTotal: number;
  caixaProjetado: number;
  aPagarList: Bill[];
  aReceberList: Bill[];
  quitadasList: Bill[];
  balance: BalanceSheet;
}

export interface ClienteRow {
  id: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  notes: string | null;
  visitas: number;
  gasto: number;
  ticketMedio: number;
  diasDesde: number | null;
  saldo: number;
  aberto: number;
}

export interface ClientesData {
  ticketMedio: number;
  recorrentesPct: number;
  recorrentes: number;
  comVisita: number;
  ltvMedio: number;
  intervaloMedio: number | null;
  topClientes: { name: string; gasto: number; visitas: number }[];
  reativarList: { name: string; phone: string | null; diasDesde: number | null }[];
  inativosList: { id: string; name: string; phone: string | null; diasDesde: number | null }[];
  novosPorMes: { monthKey: string; count: number }[];
  clientsList: ClienteRow[];
}

export interface ClientDetailData {
  client: Client;
  pago: number;
  aberto: number;
  visitas: number;
  ticketMedio: number;
  bills: Bill[];
  history: TxSummary[];
  packages: PackageRow[];
}

export interface HomeData {
  alerts: Alert[];
  checklist: { hasCatalogItems: boolean; hasServices: boolean; hasTransactions: boolean };
}
