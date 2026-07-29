import Modal from './Modal';

/** The five daily flows, in plain language — written for the person who
 *  runs the clinic, not for whoever configured the app. */
const PASSOS: { titulo: string; como: string[] }[] = [
  {
    titulo: '🗓️ Agendar uma cliente',
    como: ['Agenda → toque num horário livre (ou em "+ Agendamento")', 'Escolha a cliente e o serviço → Salvar', 'Cliente nova? Cadastre antes em Início → "Novo cliente"'],
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
];

export default function GuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Como usar no dia a dia" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
        O dia a dia inteiro acontece em duas telas: <strong>Início</strong> e <strong>Agenda</strong>. As outras abas (Caixa, Contas, Relatórios) são os números do negócio — pode
        olhar sem medo, <strong>olhar não estraga nada</strong>.
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
