import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  Appointment,
  Bill,
  Category,
  Client,
  ClientDetailData,
  ClientesData,
  ContasData,
  DashboardData,
  DashboardYearData,
  DayAgenda,
  DeleteImpact,
  Equipment,
  HomeData,
  PackageRow,
  Product,
  TeamMember,
  Role,
  Recurring,
  ResultadoData,
  Service,
  Settings,
  Transaction,
} from './types';

// Any write invalidates the whole cache — nearly every mutation in this app
// (a transaction, a bill settlement, a stock sale...) ripples into the
// dashboard/DRE/balance/clients reports, so fine-grained invalidation would
// just re-introduce the same "did I forget one" bugs by hand.
function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

// ---------- Categories ----------
export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories') });
}
export function useSaveCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; type: 'receita' | 'despesa'; investment?: boolean }) =>
      input.id ? api.put<Category>(`/categories/${input.id}`, input) : api.post<Category>('/categories', input),
    onSuccess: invalidate,
  });
}
export function useDeleteCategory() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/categories/${id}`), onSuccess: invalidate });
}

// ---------- Clients ----------
/** `enabled` lets the command palette hold off fetching until it opens. */
export function useClients(enabled = true) {
  return useQuery({ queryKey: ['clients'], queryFn: () => api.get<Client[]>('/clients'), enabled });
}
export function useSaveClient() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; phone?: string | null; birthday?: string | null; notes?: string | null }) =>
      input.id ? api.put<Client>(`/clients/${input.id}`, input) : api.post<Client>('/clients', input),
    onSuccess: invalidate,
  });
}
export function useDeleteClient() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/clients/${id}`), onSuccess: invalidate });
}

// ---------- Products ----------
export function useProducts(enabled = true) {
  return useQuery({ queryKey: ['products'], queryFn: () => api.get<Product[]>('/products'), enabled });
}
export function useSaveProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; unit: string; packageCost: number; packageQty: number; salePrice?: number; stock?: number; expiresAt?: string | null; kind?: 'operacional' | 'descartavel'; lowStockAt?: number }) =>
      input.id ? api.put<Product>(`/products/${input.id}`, input) : api.post<Product>('/products', input),
    onSuccess: invalidate,
  });
}
export function useDeleteProduct() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/products/${id}`), onSuccess: invalidate });
}
/** Fetched only once the confirm dialog opens — it is a per-row query and
 *  would otherwise run for every product on the page. */
export function useProductDeleteImpact(id: string | null) {
  return useQuery({
    queryKey: ['product-delete-impact', id],
    queryFn: () => api.get<DeleteImpact>(`/products/${id}/delete-impact`),
    enabled: !!id,
  });
}
export function useProductEntrada() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id: string; qty: number; unitCost: number; lancarNoCaixa?: boolean }) => api.post(`/products/${input.id}/entrada`, input),
    onSuccess: invalidate,
  });
}
export function useProductVender() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id: string; qty: number; unitPrice: number }) => api.post(`/products/${input.id}/vender`, input),
    onSuccess: invalidate,
  });
}
export function useProductInventario() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id: string; real: number; note?: string }) => api.post(`/products/${input.id}/inventario`, input),
    onSuccess: invalidate,
  });
}

// ---------- Equipment ----------
export function useEquipment() {
  return useQuery({ queryKey: ['equipment'], queryFn: () => api.get<Equipment[]>('/equipment') });
}
export function useSaveEquipment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; kind: string; qty?: number; cost: number; usefulUses: number; kwh?: number }) =>
      input.id ? api.put<Equipment>(`/equipment/${input.id}`, input) : api.post<Equipment>('/equipment', input),
    onSuccess: invalidate,
  });
}
export function useDeleteEquipment() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/equipment/${id}`), onSuccess: invalidate });
}
export function useEquipmentDeleteImpact(id: string | null) {
  return useQuery({
    queryKey: ['equipment-delete-impact', id],
    queryFn: () => api.get<DeleteImpact>(`/equipment/${id}/delete-impact`),
    enabled: !!id,
  });
}
export function useEquipmentComprar() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { id: string; qty: number; unitCost: number }) => api.post(`/equipment/${input.id}/comprar`, input), onSuccess: invalidate });
}
export function useEquipmentBaixa() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { id: string; qty: number }) => api.post(`/equipment/${input.id}/baixa`, input), onSuccess: invalidate });
}

// ---------- Services ----------
export function useServices(enabled = true) {
  return useQuery({ queryKey: ['services'], queryFn: () => api.get<Service[]>('/services'), enabled });
}
export function useSaveService() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; price: number; category?: string | null; items: { kind: string; refId: string; qty: number }[] }) =>
      input.id ? api.put<Service>(`/services/${input.id}`, input) : api.post<Service>('/services', input),
    onSuccess: invalidate,
  });
}
export function useDeleteService() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/services/${id}`), onSuccess: invalidate });
}
export function useDuplicateService() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.post<Service>(`/services/${id}/duplicate`), onSuccess: invalidate });
}

// ---------- Settings ----------
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
}
export function useSaveSettings() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: Partial<Settings>) => api.put<Settings>('/settings', input), onSuccess: invalidate });
}

// ---------- Reconciliation ----------
export interface ReconciliationData {
  lines: { kind: 'product' | 'equipment'; id: string; name: string; missing: number }[];
  totalMissing: number;
}
/** Only fetched while the Balanço shows a plug — it is a diagnostic query. */
export function useReconciliation(enabled: boolean) {
  return useQuery({ queryKey: ['reconciliation'], queryFn: () => api.get<ReconciliationData>('/reports/reconciliation'), enabled });
}
export function useReconcile() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: () => api.post<{ created: number; total: number }>('/reports/reconciliation'), onSuccess: invalidate });
}

// ---------- Transactions ----------
export interface TxInput {
  id?: string;
  type: 'receita' | 'despesa';
  amount: number;
  categoryId?: string | null;
  clientId?: string | null;
  serviceId?: string | null;
  date: string;
  note?: string | null;
  items?: { kind: string; refId: string; qty: number }[];
  sales?: { productId: string; qty: number }[];
  distanciaKm?: number | null;
  payment?: string | null;
  parcelas?: number | null;
  capital?: 'aporte' | 'pagamento' | null;
  capitalKind?: 'capital' | 'emprestimo' | null;
  socio?: string | null;
}
export function useTransactions(filters?: { from?: string; to?: string; type?: string }) {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.type) params.set('type', filters.type);
  const qs = params.toString();
  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api.get<Transaction[]>(`/transactions${qs ? '?' + qs : ''}`),
  });
}
export function useTransaction(id: string | null | undefined) {
  return useQuery({ queryKey: ['transaction', id], queryFn: () => api.get<Transaction>(`/transactions/${id}`), enabled: !!id });
}
export function useSaveTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: TxInput) => (input.id ? api.put<Transaction>(`/transactions/${input.id}`, input) : api.post<Transaction>('/transactions', input)),
    onSuccess: invalidate,
  });
}
export function useDeleteTransaction() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/transactions/${id}`), onSuccess: invalidate });
}
export function useSacarProlabore() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (amount: number) => api.post('/transactions/sacar-prolabore', { amount }), onSuccess: invalidate });
}

// ---------- Bills ----------
export function useBills() {
  return useQuery({ queryKey: ['bills'], queryFn: () => api.get<Bill[]>('/bills') });
}
export function useSaveBill() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string } & Omit<Bill, 'id' | 'settled' | 'settledAt' | 'txId' | 'recId'>) =>
      input.id ? api.put<Bill>(`/bills/${input.id}`, input) : api.post<Bill>('/bills', input),
    onSuccess: invalidate,
  });
}
export function useDeleteBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/bills/${id}`), onSuccess: invalidate });
}
export function useSettleBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { id: string; amount: number }) => api.post(`/bills/${input.id}/settle`, { amount: input.amount }), onSuccess: invalidate });
}
export function useReopenBill() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.post(`/bills/${id}/reopen`), onSuccess: invalidate });
}

// ---------- Recurring ----------
export function useRecurring() {
  return useQuery({ queryKey: ['recurring'], queryFn: () => api.get<Recurring[]>('/recurring') });
}
export function useSaveRecurring() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; desc: string; amount: number; dueDay: number; categoryId?: string | null }) =>
      input.id ? api.put<Recurring>(`/recurring/${input.id}`, input) : api.post<Recurring>('/recurring', input),
    onSuccess: invalidate,
  });
}
export function useDeleteRecurring() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/recurring/${id}`), onSuccess: invalidate });
}

// ---------- Packages ----------
export function usePackages(clientId?: string) {
  return useQuery({ queryKey: ['packages', clientId], queryFn: () => api.get<PackageRow[]>(`/packages${clientId ? `?clientId=${clientId}` : ''}`) });
}
export interface PackageInput {
  clientId: string;
  serviceId?: string | null;
  sessions: number;
  amount: number;
  payment: string;
  mode: 'avista' | 'prazo';
  parcelas?: number;
  /** Credit-card installments on an à-vista sale (fee table lookup). */
  parcelasCartao?: number;
  primeiroVenc?: string;
}
export function useSavePackage() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: PackageInput) => api.post('/packages', input), onSuccess: invalidate });
}
export function useUsePackageSession() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.post(`/packages/${id}/use-session`), onSuccess: invalidate });
}
export function useDeletePackage() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/packages/${id}`), onSuccess: invalidate });
}

// ---------- Reports ----------
export function useHomeReport() {
  return useQuery({ queryKey: ['reports', 'home'], queryFn: () => api.get<HomeData>('/reports/home') });
}
export function useDashboardReport(monthOffset: number) {
  return useQuery({ queryKey: ['reports', 'dashboard', monthOffset], queryFn: () => api.get<DashboardData>(`/reports/dashboard?monthOffset=${monthOffset}`) });
}
export function useDashboardYearReport(yearOffset: number) {
  return useQuery({ queryKey: ['reports', 'dashboard-year', yearOffset], queryFn: () => api.get<DashboardYearData>(`/reports/dashboard-year?yearOffset=${yearOffset}`) });
}
export function useResultadoReport(scope: 'month' | 'year', monthOffset: number, yearOffset: number) {
  return useQuery({
    queryKey: ['reports', 'resultado', scope, monthOffset, yearOffset],
    queryFn: () => api.get<ResultadoData>(`/reports/resultado?scope=${scope}&monthOffset=${monthOffset}&yearOffset=${yearOffset}`),
  });
}
export function useContasReport() {
  return useQuery({ queryKey: ['reports', 'contas'], queryFn: () => api.get<ContasData>('/reports/contas') });
}
export function useClientesReport() {
  return useQuery({ queryKey: ['reports', 'clientes'], queryFn: () => api.get<ClientesData>('/reports/clientes') });
}
export function useClientDetail(id: string | null) {
  return useQuery({
    queryKey: ['reports', 'client', id],
    queryFn: () => api.get<ClientDetailData>(`/reports/clients/${id}`),
    enabled: !!id,
  });
}

// ---------- Backup ----------
export function useExportBackup() {
  return useMutation({ mutationFn: () => api.get('/backup') });
}
export function useRestoreBackup() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (data: unknown) => api.post('/backup/restore', data), onSuccess: invalidate });
}
export function useImportData() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (data: unknown) => api.post<{ ok: boolean; summary: Record<string, number> }>('/backup/import', data), onSuccess: invalidate });
}

// ---------- Team ----------
export function useTeam() {
  return useQuery({ queryKey: ['team'], queryFn: () => api.get<TeamMember[]>('/team') });
}
export function useInviteMember() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string; role: Role }) => api.post<TeamMember>('/team/invite', input),
    onSuccess: invalidate,
  });
}
export function useChangeMemberRole() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (input: { membershipId: string; role: Role }) => api.put(`/team/${input.membershipId}/role`, { role: input.role }), onSuccess: invalidate });
}
export function useRemoveMember() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (membershipId: string) => api.del(`/team/${membershipId}`), onSuccess: invalidate });
}

// ---------- Appointments ----------
export function useAppointmentsRange(from: string, to: string) {
  return useQuery({ queryKey: ['appointments', 'range', from, to], queryFn: () => api.get<Appointment[]>(`/appointments?from=${from}&to=${to}`) });
}
export function useDayAgenda(date: string) {
  return useQuery({ queryKey: ['appointments', 'day', date], queryFn: () => api.get<DayAgenda>(`/appointments/day?date=${date}`) });
}
export function useSaveAppointment() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: { id?: string; clientId: string; serviceId?: string | null; date: string; time: string; durationMin?: number; note?: string | null }) =>
      input.id ? api.put<Appointment>(`/appointments/${input.id}`, input) : api.post<Appointment>('/appointments', input),
    onSuccess: invalidate,
  });
}
export function useDeleteAppointment() {
  const invalidate = useInvalidateAll();
  return useMutation({ mutationFn: (id: string) => api.del(`/appointments/${id}`), onSuccess: invalidate });
}
