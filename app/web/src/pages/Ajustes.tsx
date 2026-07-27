import { useRef, useState, type FormEvent } from 'react';
import PageHeader from '../components/PageHeader';
import {
  useCategories,
  useChangeMemberRole,
  useClients,
  useImportData,
  useInviteMember,
  useRemoveMember,
  useRestoreBackup,
  useSaveSettings,
  useServices,
  useSettings,
  useTeam,
} from '../api/hooks';
import { api, ApiError } from '../api/client';
import { changePassword } from '../auth/passwordApi';
import { useAuth } from '../auth/AuthContext';
import { numOr0, todayStr } from '../format';
import { loadXlsx, parseSheetDate, parseSheetNumber, pickField } from '../xlsx';
import type { Role, Settings } from '../api/types';

export default function Ajustes() {
  const { data: settings } = useSettings();
  const { data: categories = [] } = useCategories();
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const restoreBackup = useRestoreBackup();
  const importData = useImportData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function downloadBackup() {
    const data = await api.get('/backup');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rikari-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function downloadXlsx() {
    setBusy('xlsx');
    try {
      await loadXlsx();
      const XLSX = window.XLSX;
      const data = (await api.get('/backup')) as any;
      const catName = (id: string) => categories.find((c) => c.id === id)?.name || '';
      const cliName = (id: string | null) => clients.find((c) => c.id === id)?.name || '';
      const svcName = (id: string | null) => services.find((s) => s.id === id)?.name || '';

      const lanc = [...data.transactions]
        .sort((a: any, b: any) => (a.date < b.date ? -1 : 1))
        .map((t: any) => ({
          Data: t.date.split('-').reverse().join('/'),
          Tipo: t.type === 'receita' ? 'Receita' : 'Despesa',
          Valor: t.amount,
          Categoria: catName(t.categoryId),
          Cliente: cliName(t.clientId),
          Servico: svcName(t.serviceId),
          'Custo variavel': t.variableCost || 0,
          Observacao: t.note || '',
        }));
      const prods = data.products.map((p: any) => ({
        Nome: p.name,
        Unidade: p.unit,
        'Custo do pacote': p.packageCost,
        'Qtd no pacote': p.packageQty,
        'Preco de venda': p.salePrice,
        Estoque: p.stock,
        Validade: p.expiresAt ? p.expiresAt.split('-').reverse().join('/') : '',
      }));
      const servs = data.services.map((s: any) => ({ Nome: s.name, Preco: s.price }));
      const equips = data.equipment.map((e: any) => ({ Nome: e.name, Classificacao: e.kind === 'maquina' ? 'Maquina' : 'Utensilio', Quantidade: e.qty, 'Custo unitario': e.cost }));
      const bills = data.bills.map((b: any) => ({ Tipo: b.kind === 'pagar' ? 'A pagar' : 'A receber', Descricao: b.desc, Valor: b.amount, Vencimento: (b.due || '').split('-').reverse().join('/'), Situacao: b.settled ? 'Quitada' : 'Em aberto' }));
      const clis = data.clients.map((c: any) => ({ Nome: c.name, Telefone: c.phone || '', Aniversario: c.birthday || '', Observacoes: c.notes || '' }));

      const wb = XLSX.utils.book_new();
      const add = (name: string, rows: unknown[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
      add('Lancamentos', lanc);
      add('Produtos', prods);
      add('Servicos', servs);
      add('Equipamentos', equips);
      add('Contas', bills);
      add('Clientes', clis);
      XLSX.writeFile(wb, `rikari-${todayStr()}.xlsx`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao gerar a planilha.');
    } finally {
      setBusy(null);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (/\.json$/i.test(file.name)) {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        window.alert('Não consegui ler esse arquivo de backup.');
        return;
      }
      if (!window.confirm('Restaurar o backup? Isso substitui todos os dados atuais.')) return;
      setBusy('import');
      try {
        await restoreBackup.mutateAsync(data);
        window.alert('Backup restaurado.');
      } catch {
        window.alert('Não consegui restaurar esse backup.');
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('import');
    try {
      await loadXlsx();
      const XLSX = window.XLSX;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const sheetRows = (prefix: string) => {
        const name = wb.SheetNames.find((n: string) => n.toLowerCase().replace(/ç/g, 'c').replace(/[ãáà]/g, 'a').indexOf(prefix) === 0);
        return name ? (XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) as Record<string, unknown>[]) : [];
      };
      const rowsLanc = sheetRows('lanc');
      const rowsProd = sheetRows('produto');
      const rowsBills = sheetRows('conta');
      const rowsCli = sheetRows('cliente');
      if (!rowsLanc.length && !rowsProd.length && !rowsBills.length && !rowsCli.length) {
        window.alert('A planilha precisa ter uma aba chamada Lancamentos, Produtos, Contas ou Clientes.');
        return;
      }
      const summary: string[] = [];
      if (rowsLanc.length) summary.push(`${rowsLanc.length} lançamentos`);
      if (rowsProd.length) summary.push(`${rowsProd.length} produtos`);
      if (rowsBills.length) summary.push(`${rowsBills.length} contas`);
      if (rowsCli.length) summary.push(`${rowsCli.length} clientes`);
      if (!window.confirm(`Importar ${summary.join(', ')}?\n\nOs dados são adicionados aos existentes.`)) return;

      const payload = {
        clients: rowsCli
          .map((r) => ({ name: pickField(r, ['nome', 'cliente']), phone: pickField(r, ['telefone', 'fone', 'whatsapp']), birthday: pickField(r, ['aniversario', 'nascimento']), notes: pickField(r, ['observacoes', 'observacao', 'notas']) }))
          .filter((c) => c.name),
        products: rowsProd
          .map((r) => ({
            name: pickField(r, ['nome', 'produto']),
            unit: pickField(r, ['unidade', 'un']) || 'ml',
            packageCost: parseSheetNumber(pickField(r, ['custo do pacote', 'custo', 'preco de custo'])),
            packageQty: parseSheetNumber(pickField(r, ['qtd no pacote', 'quantidade no pacote', 'qtd'])) || 1,
            salePrice: parseSheetNumber(pickField(r, ['preco de venda', 'venda', 'preco'])),
            stock: parseSheetNumber(pickField(r, ['estoque', 'quantidade'])),
            expiresAt: parseSheetDate(pickField(r, ['validade', 'vencimento'])) || undefined,
          }))
          .filter((p) => p.name),
        bills: rowsBills
          .map((r) => ({
            kind: pickField(r, ['tipo', 'situacao']).toLowerCase().includes('receb') ? ('receber' as const) : ('pagar' as const),
            desc: pickField(r, ['descricao', 'conta', 'nome']),
            amount: parseSheetNumber(pickField(r, ['valor', 'total'])),
            due: parseSheetDate(pickField(r, ['vencimento', 'data'])),
            settled: pickField(r, ['situacao']).toLowerCase().includes('quit'),
          }))
          .filter((b) => b.desc && b.amount > 0),
        transactions: rowsLanc
          .map((r) => {
            const tipoRaw = pickField(r, ['tipo', 'entrada/saida']).toLowerCase();
            return {
              type: (tipoRaw.includes('rece') || tipoRaw.includes('entrada') ? 'receita' : 'despesa') as 'receita' | 'despesa',
              amount: parseSheetNumber(pickField(r, ['valor', 'total'])),
              categoryName: pickField(r, ['categoria']),
              clientName: pickField(r, ['cliente']),
              date: parseSheetDate(pickField(r, ['data'])),
              variableCost: parseSheetNumber(pickField(r, ['custo variavel'])) || undefined,
              note: pickField(r, ['observacao', 'obs', 'descricao']),
            };
          })
          .filter((t) => t.amount > 0),
      };
      const result = await importData.mutateAsync(payload);
      window.alert(`Importado: ${result.summary.clients} clientes, ${result.summary.products} produtos, ${result.summary.bills} contas, ${result.summary.transactions} lançamentos.`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Não consegui abrir essa planilha.');
    } finally {
      setBusy(null);
    }
  }

  const { isOwner } = useAuth();

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Taxas, custos de referência, pró-labore, meta e backup" />
      <div className="scroll-area">
        <div className="page">
          {settings && <SettingsCard settings={settings} />}

          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Dados e backup</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1, maxWidth: 420, lineHeight: 1.5 }}>
                Baixe a planilha para trabalhar no Excel — e use o mesmo formato para importar de volta (abas Lançamentos, Produtos, Contas, Clientes).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={downloadXlsx} disabled={busy === 'xlsx' || !isOwner}>
                Baixar planilha (Excel)
              </button>
              {isOwner && (
                <button className="pill accent" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
                  Importar planilha / backup
                </button>
              )}
              <button className="pill" onClick={downloadBackup}>
                Backup (.json)
              </button>
              {isOwner && <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.json" style={{ display: 'none' }} onChange={onImportFile} />}
            </div>
          </div>

          <PasswordCard />
          {isOwner && <TeamCard />}
        </div>
      </div>
    </>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao trocar a senha');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }} onSubmit={onSubmit}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Trocar senha</div>
      {error && <div className="auth-error">{error}</div>}
      {ok && <div style={{ fontSize: 12.5, color: 'var(--income-text)' }}>Senha alterada com sucesso.</div>}
      <label className="field">
        Senha atual
        <input className="input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
      <label className="field">
        Nova senha (mínimo 8 caracteres)
        <input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </label>
      <div>
        <button className="btn-primary" type="submit" disabled={submitting}>
          Salvar nova senha
        </button>
      </div>
    </form>
  );
}

function TeamCard() {
  const { data: members = [] } = useTeam();
  const invite = useInviteMember();
  const changeRole = useChangeMemberRole();
  const remove = useRemoveMember();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [error, setError] = useState<string | null>(null);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await invite.mutateAsync({ name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('viewer');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao criar acesso');
    }
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Equipe</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1, maxWidth: 420, lineHeight: 1.5 }}>
            Dono vê e edita tudo. Sócio(a) visualiza os dados mas não pode criar, editar ou excluir.
          </div>
        </div>
        {!showForm && (
          <button className="pill accent" onClick={() => setShowForm(true)}>
            + Adicionar pessoa
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={onInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {error && <div className="auth-error" style={{ width: '100%' }}>{error}</div>}
          <label className="field" style={{ width: 160 }}>
            Nome
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field" style={{ width: 200 }}>
            E-mail
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field" style={{ width: 160 }}>
            Senha (mín. 8 caracteres)
            <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field" style={{ width: 120 }}>
            Papel
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="viewer">Sócio(a)</option>
              <option value="owner">Dono(a)</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" type="submit" disabled={invite.isPending}>
              Criar acesso
            </button>
            <button className="pill" type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map((m) => (
          <div key={m.membershipId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {m.name} {m.isYou && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(você)</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{m.email}</div>
            </div>
            {m.isYou ? (
              <span className="pill sm active">{m.role === 'owner' ? 'Dono(a)' : 'Sócio(a)'}</span>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="input"
                  style={{ width: 110 }}
                  value={m.role}
                  onChange={(e) => changeRole.mutate({ membershipId: m.membershipId, role: e.target.value as Role })}
                >
                  <option value="viewer">Sócio(a)</option>
                  <option value="owner">Dono(a)</option>
                </select>
                <button
                  className="pill sm"
                  onClick={() => {
                    if (window.confirm(`Remover o acesso de ${m.name}?`)) remove.mutate(m.membershipId);
                  }}
                >
                  Remover
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Owns its own draft strings so typing "1,5" doesn't get clobbered by the
 *  round-trip through the server on every keystroke — commits on blur. */
function SettingsCard({ settings }: { settings: Settings }) {
  const { isOwner } = useAuth();
  const saveSettings = useSaveSettings();
  const [draft, setDraft] = useState({
    energyPricePerKwh: settings.energyPricePerKwh ? String(settings.energyPricePerKwh).replace('.', ',') : '',
    costPerKm: settings.costPerKm ? String(settings.costPerKm).replace('.', ',') : '',
    prolaboreFixo: settings.prolaboreFixo ? String(settings.prolaboreFixo).replace('.', ',') : '',
    prolaborePct: settings.prolaborePct ? String(settings.prolaborePct) : '',
    taxaCredito: settings.taxaCredito ? String(settings.taxaCredito).replace('.', ',') : '',
    taxaDebito: settings.taxaDebito ? String(settings.taxaDebito).replace('.', ',') : '',
    taxaPix: settings.taxaPix ? String(settings.taxaPix).replace('.', ',') : '',
    metaMensal: settings.metaMensal ? String(settings.metaMensal).replace('.', ',') : '',
    agendaStartHour: String(settings.agendaStartHour ?? 9),
    agendaEndHour: String(settings.agendaEndHour ?? 19),
    agendaSlotMin: String(settings.agendaSlotMin ?? 30),
  });

  function commit(key: keyof typeof draft) {
    saveSettings.mutate({ [key]: numOr0(draft[key]) } as never);
  }
  function bind(key: keyof typeof draft) {
    return {
      value: draft[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
      onBlur: () => commit(key),
    };
  }

  return (
    <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <fieldset disabled={!isOwner} style={{ border: 'none', margin: 0, padding: 0, display: 'contents' }}>
      <label className="field" style={{ width: 130 }}>
        Preço da energia (R$/kWh)
        <input className="input" inputMode="decimal" placeholder="0,00" {...bind('energyPricePerKwh')} />
      </label>
      <label className="field" style={{ width: 130 }}>
        Custo do km rodado (R$/km)
        <input className="input" inputMode="decimal" placeholder="0,00" {...bind('costPerKm')} />
      </label>
      <div className="field">
        Pró-labore
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className={'pill sm' + (settings.prolaboreMode === 'pct' ? ' active' : '')} onClick={() => saveSettings.mutate({ prolaboreMode: 'pct' })}>
            % do lucro
          </button>
          <button className={'pill sm' + (settings.prolaboreMode === 'fixo' ? ' active' : '')} onClick={() => saveSettings.mutate({ prolaboreMode: 'fixo' })}>
            Valor fixo
          </button>
          {settings.prolaboreMode === 'fixo' ? (
            <input className="input" style={{ width: 100 }} inputMode="decimal" placeholder="0,00" {...bind('prolaboreFixo')} />
          ) : (
            <input className="input" style={{ width: 70 }} inputMode="numeric" placeholder="Ex: 30" {...bind('prolaborePct')} />
          )}
        </div>
        <span style={{ fontWeight: 500, fontSize: 11 }}>Calculado sobre o lucro dos atendimentos do mês. No saque você pode digitar outro valor.</span>
      </div>
      <div className="field">
        Taxas da maquininha (%)
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ width: 78 }} inputMode="decimal" placeholder="Crédito" {...bind('taxaCredito')} />
          <input className="input" style={{ width: 78 }} inputMode="decimal" placeholder="Débito" {...bind('taxaDebito')} />
          <input className="input" style={{ width: 78 }} inputMode="decimal" placeholder="Pix" {...bind('taxaPix')} />
        </div>
        <span style={{ fontWeight: 500, fontSize: 11 }}>Crédito · débito · Pix. A taxa vira despesa automática a cada recebimento.</span>
      </div>
      <label className="field" style={{ width: 130 }}>
        Meta de faturamento mensal (R$)
        <input className="input" inputMode="decimal" placeholder="0,00" {...bind('metaMensal')} />
      </label>
      <div className="field">
        Horário de atendimento (Agenda)
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ width: 60 }} inputMode="numeric" placeholder="9" {...bind('agendaStartHour')} />
          <input className="input" style={{ width: 60 }} inputMode="numeric" placeholder="19" {...bind('agendaEndHour')} />
          <input className="input" style={{ width: 70 }} inputMode="numeric" placeholder="30" {...bind('agendaSlotMin')} />
        </div>
        <span style={{ fontWeight: 500, fontSize: 11 }}>Hora de início · hora de fim · duração do horário (min)</span>
      </div>
      <button
        onClick={() => saveSettings.mutate({ emailDigestEnabled: !settings.emailDigestEnabled })}
        style={{ all: 'unset', cursor: isOwner ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', alignSelf: 'flex-start' }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            flex: 'none',
            borderRadius: 6,
            border: '2px solid var(--accent)',
            background: settings.emailDigestEnabled ? 'var(--accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {settings.emailDigestEnabled ? '✓' : ''}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text)', maxWidth: 220 }}>
          <strong>Resumo diário por e-mail</strong> — contas vencendo, estoque baixo e clientes sumidos, toda manhã
        </span>
      </button>
      </fieldset>
    </div>
  );
}
