import { useState, type FormEvent } from 'react'
import { useAuth } from '../context/useAuth'

export function ProfilePage() {
  const { profile, updatePassword } = useAuth()
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    try {
      await updatePassword(password)
      setSuccess(true)
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No fue posible actualizar la contraseña.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="stack-lg" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="card">
        <p className="eyebrow">Mi Perfil</p>
        <h1>{profile?.nombre}</h1>
        <p style={{ color: 'var(--ink-muted)' }}>{profile?.email}</p>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <h2>Cambiar Contraseña</h2>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          Para ingresar en dispositivos futuros, te recomendamos cambiar la contraseña por defecto.
        </p>
        
        <label>
          Nueva contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Minímo 6 caracteres"
          />
        </label>

        <label>
          Confirmar nueva contraseña
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}
        {success ? (
          <p className="pill pill-ok" style={{ display: 'block', textAlign: 'center' }}>
            ¡Contraseña actualizada exitosamente!
          </p>
        ) : null}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Guardando...' : 'Actualizar contraseña'}
        </button>
      </form>
    </section>
  )
}
