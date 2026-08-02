import Modal from './Modal';

/** The five daily flows, in plain language — written for the person who
 *  runs the clinic, not for whoever configured the app. */
const PASSOS: { titulo: string; como: string[] }[] = [
  {
    titulo: '🗓️ Agendar uma cliente',
    como: ['Início → "Agendar atendimento" (ou Agenda → toque num horário livre)', 'Escolha a cliente e o serviço → Salvar', 'Cliente nova? Cadastre antes em Início → "Novo cliente"'],
  },
  {
    titulo: '💬 Lembrar a cliente do horário',
    como: ['Agenda → botão "Lembrete WhatsApp" no agendamento', 'A mensagem já vai pronta com nome, dia e hora', 'Ela respondeu confirmando? Toque em "confirmou?"'],
  },
  {
    titulo: '💗 Cliente atendida (o mais importante!)',
    como: [
      'Agenda → botão "Registrar atendimento" no agendamento dela',
      'Já vem tudo preenchido — só confira como ela pagou e toque em Salvar',
      'O app pergunta se quer deixar o retorno agendado — aproveite!',
    ],
  },
  {
    titulo: '📷 Guardar a anamnese ou fotos',
    como: ['Clientes → toque no nome dela → "📷 Adicionar foto"', 'Diga o que é (Anamnese, Antes, Depois) e a câmera abre', 'Fica tudo guardado na ficha, em segurança'],
  },
  {
    titulo: '🧾 Mandar recibo',
    como: ['Clientes → nome dela → no Histórico, toque em "recibo"', 'Dá pra copiar, mandar no WhatsApp ou salvar em PDF'],
  },
  {
    titulo: '💵 Cliente vai pagar depois (fiado)',
    como: [
      'Registre o atendimento normal — em "Recebimento", toque em "Fica pra depois" (ou "Recebi uma parte")',
      'O que faltar vira uma continha no nome dela, na aba Contas',
      'Quando ela pagar: Contas → toque na conta → "Recebi". Tem até botão de cobrar pelo WhatsApp 💬',
    ],
  },
  {
    titulo: '🛍️ Vender um produto (sem atendimento)',
    como: ['Início → "Vender produto"', 'Escolha o produto — o preço e o estoque já aparecem', 'Dá desconto se quiser e Salvar. O estoque baixa sozinho'],
  },
  {
    titulo: '📦 Pacote de sessões',
    como: [
      'Vender: Início → "Vender pacote" — escolha cliente, sessões e valor',
      'A cada visita: Clientes → nome dela → "Usar sessão"',
      'O app desconta a sessão e baixa os produtos usados, tudo sozinho',
    ],
  },
  {
    titulo: '🧴 Chegou produto novo? Estoque estranho?',
    como: [
      'Chegou compra: Estoque → "+ Entrada" no produto — diga quantos e quanto pagou',
      'Apareceu aviso vermelho de estoque? Toque em "Contagem", conte o que tem na prateleira e digite — o app acerta o resto',
    ],
  },
];

export default function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Como usar no dia a dia" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        O dia a dia inteiro acontece em duas telas: <strong>Início</strong> e <strong>Agenda</strong>. As abas Caixa e Contas mostram o dinheiro — pode olhar sem medo,{' '}
        <strong>olhar não estraga nada</strong>. Já <strong>Relatórios</strong> e <strong>Ajustes</strong> são as telas "de contador": pode deixar pra quem cuida dos números. 😉
      </div>
      {PASSOS.map((p) => (
        <div key={p.titulo} style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '12px 16px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{p.titulo}</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {p.como.map((c) => (
              <li key={c} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {c}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        Errou alguma coisa? Quase tudo dá pra <strong>editar ou excluir</strong> tocando no próprio item — e o que for perigoso o app pede confirmação antes.
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-primary" onClick={onClose}>
          Entendi!
        </button>
      </div>
    </Modal>
  );
}
