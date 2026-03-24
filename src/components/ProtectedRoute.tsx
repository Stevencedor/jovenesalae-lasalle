import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import type { RolUsuario } from '../types/domain'

interface ProtectedRouteProps {
  allowedRoles?: RolUsuario[]
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { loading, user, profile } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="shell shell-center">
        <div className="card">
          <h2>Cargando sesion...</h2>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!profile) {
    return (
      <div className="shell shell-center">
        <div className="card">
          <h2>Usuario sin perfil activo</h2>
          <p>Verifica que tu email exista en la tabla estudiantes con estado Activo.</p>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.rol)) {
    return <Navigate to="/dashboard" replace />
  }

  const debeConfirmarMatricula =
    profile.rol === 'Hermano_Menor' && !profile.matricula_confirmada

  if (debeConfirmarMatricula && location.pathname !== '/matricula/confirmar') {
    return <Navigate to="/matricula/confirmar" replace />
  }

  if (!debeConfirmarMatricula && location.pathname === '/matricula/confirmar') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
