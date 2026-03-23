import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function AppLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const roleLabel = profile?.rol?.replace('_', ' ')

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <span className="brand-dot" />
          Asistencia La Salle
        </Link>

        <nav className="menu">
          <NavLink to="/dashboard">Inicio</NavLink>
          <NavLink to="/materias">Materias</NavLink>
          {profile?.rol === 'Hermano_Mayor' && <NavLink to="/registro">Panel</NavLink>}
        </nav>

        <div className="user-chip">
          <div className="user-info">
            <strong>{profile?.nombre ?? 'Usuario'}</strong>
            <small>{roleLabel ?? 'Sin rol'}</small>
          </div>
          <button onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className="page-wrap">
        <Outlet />
      </main>
    </div>
  )
}
