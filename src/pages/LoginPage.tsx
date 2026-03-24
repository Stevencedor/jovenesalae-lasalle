import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

export function LoginPage() {
  const { user, profile, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user && profile) {
    const to =
      profile.rol === 'Hermano_Menor' && !profile.matricula_confirmada
        ? '/matricula/confirmar'
        : '/dashboard'
    return <Navigate to={to} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    console.log('[LoginPage] Iniciando submit con email:', email);

    try {
      console.log('[LoginPage] Llamando a signIn...');
      await signIn(email, password)
      console.log('[LoginPage] signIn completado exitosamente.');
      
      const from = (location.state as { from?: string } | null)?.from
      console.log('[LoginPage] Navegando a: ', from ?? '/dashboard');
      navigate(from ?? '/dashboard', { replace: true })
    } catch (err) {
      console.error('[LoginPage] Error capturado en signIn:', err)
      const message = err instanceof Error ? err.message : 'No fue posible iniciar sesion.'
      setError(message)
    } finally {
      console.log('[LoginPage] Ejecutando finally (setLoading = false)');
      setLoading(false)
    }
  }

  return (
    <div className="shell shell-center">
      <form className="card form-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Acceso privado</p>
        <h2>Ingresa a tu panel</h2>
        <label>
          Correo institucional
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Validando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
