import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../auth/passwordApi';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <img src="/ar-mark-t.png" alt="Rikari" style={{ width: 96 }} />
          <h1 className="serif" style={{ fontSize: 20 }}>
            Esqueci minha senha
          </h1>
        </div>
        {sent ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center' }}>
            Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira sua caixa de entrada.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>Informe o e-mail da sua conta e enviaremos um link para redefinir a senha.</div>
            <label className="field">
              E-mail
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="btn-primary" type="submit" disabled={submitting}>
              Enviar link
            </button>
          </>
        )}
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>
            Voltar para o login
          </Link>
        </div>
      </form>
    </div>
  );
}
