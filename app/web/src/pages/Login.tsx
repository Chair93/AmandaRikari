import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      // error already surfaced via context
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={onSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <img src="/ar-mark-t.png" alt="Rikari" style={{ width: 96 }} />
          <h1 className="serif" style={{ fontSize: 22 }}>
            Entrar no Rikari
          </h1>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <label className="field">
          E-mail
          <input className="input" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} />
        </label>
        <label className="field">
          Senha
          <input className="input" type="password" required value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} />
        </label>
        <button className="btn-primary" type="submit" disabled={submitting}>
          Entrar
        </button>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
          Ainda não tem conta? <Link to="/register" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Criar conta</Link>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
          <Link to="/forgot-password" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Esqueci minha senha</Link>
        </div>
      </form>
    </div>
  );
}
