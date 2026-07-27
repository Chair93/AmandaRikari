import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../auth/passwordApi';
import { ApiError } from '../api/client';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao redefinir a senha');
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
            Redefinir senha
          </h1>
        </div>
        {!token && <div className="auth-error">Link inválido — peça um novo em "Esqueci minha senha".</div>}
        {done ? (
          <div style={{ fontSize: 13, color: 'var(--income-text)', textAlign: 'center' }}>Senha redefinida! Levando você para o login…</div>
        ) : (
          <>
            {error && <div className="auth-error">{error}</div>}
            <label className="field">
              Nova senha (mínimo 8 caracteres)
              <input className="input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <button className="btn-primary" type="submit" disabled={submitting || !token}>
              Redefinir senha
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
