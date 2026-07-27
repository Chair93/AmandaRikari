import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Shell from './components/Shell';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import Agenda from './pages/Agenda';
import Dashboard from './pages/Dashboard';
import Resultado from './pages/Resultado';
import Contas from './pages/Contas';
import Estoque from './pages/Estoque';
import Lancamentos from './pages/Lancamentos';
import Clientes from './pages/Clientes';
import Catalogo from './pages/Catalogo';
import Categorias from './pages/Categorias';
import Ajustes from './pages/Ajustes';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/forgot-password" element={user ? <Navigate to="/" replace /> : <ForgotPassword />} />
      <Route path="/reset-password" element={user ? <Navigate to="/" replace /> : <ResetPassword />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Shell>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/agenda" element={<Agenda />} />
                <Route path="/caixa" element={<Dashboard />} />
                <Route path="/resultado" element={<Resultado />} />
                <Route path="/contas" element={<Contas />} />
                <Route path="/estoque" element={<Estoque />} />
                <Route path="/lancamentos" element={<Lancamentos />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/catalogo" element={<Catalogo />} />
                <Route path="/categorias" element={<Categorias />} />
                <Route path="/ajustes" element={<Ajustes />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
