import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Register() {
  const { register, error, clearError } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await register(email, password, name);
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
            Criar conta no Rikari
          </h1>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <label className="field">
          Nome
          <input className="input" required value={name} onChange={(e) => { setName(e.target.value); clearError(); }} />
        </label>
        <label className="field">
          E-mail
          <input className="input" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} />
        </label>
        <label className="field">
          Senha (mínimo 8 caracteres)
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} />
        </label>
        <button className="btn-primary" type="submit" disabled={submitting}>
          Criar conta
        </button>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
          Já tem conta? <Link to="/login" style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Entrar</Link>
        </div>
      </form>
    </div>
  );
}
