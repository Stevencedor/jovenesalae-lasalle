import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  crearAsistencia,
  getDashboardMetrics,
  getMateriasConRegistroSemana,
  getMateriasEstudiante,
} from '../services/asistenciaService'
import type { TipoAsistencia } from '../types/domain'

const opciones: Array<{ value: TipoAsistencia; label: string }> = [
  { value: 'Si', label: 'Sí' },
  { value: 'No', label: 'No' },
  { value: 'No_sesion', label: 'No se tenía sesión esta semana' },
  { value: 'Sesion_aplazada_cancelada', label: 'Sesión aplazada/cancelada' },
]

export function AsistenciaPage() {
  const { materiaId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [materiaNombre, setMateriaNombre] = useState('')
  const [asistencia, setAsistencia] = useState<TipoAsistencia | ''>('')
  const [motivo, setMotivo] = useState('')
  const [rating, setRating] = useState(0)
  const [razonRating, setRazonRating] = useState('')
  const [observacion, setObservacion] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiereMotivo = asistencia === 'No'
  const requiereRating = asistencia === 'Si'
  const requiereRazonRating = requiereRating && rating > 0 && rating < 4

  const canSubmit = useMemo(() => {
    if (!asistencia) {
      return false
    }

    if (requiereMotivo && !motivo.trim()) {
      return false
    }

    if (requiereRating && rating === 0) {
      return false
    }

    if (requiereRazonRating && !razonRating.trim()) {
      return false
    }

    return true
  }, [asistencia, motivo, rating, razonRating, requiereMotivo, requiereRazonRating, requiereRating])

  useEffect(() => {
    if (!profile || !materiaId) {
      return
    }

    const materiaIdNum = Number(materiaId)

    if (Number.isNaN(materiaIdNum)) {
      setError('El identificador de la materia no es valido.')
      setLoading(false)
      return
    }

    getMateriasEstudiante(profile.id)
      .then((materias) => {
        const materia = materias.find((item) => item.id === materiaIdNum)
        if (!materia) {
          setError('La materia no pertenece a tu matricula actual.')
        } else {
          setMateriaNombre(materia.nombre)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la materia')
        setLoading(false)
      })
  }, [materiaId, profile])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!profile || !materiaId || !asistencia) {
      return
    }

    const materiaIdNum = Number(materiaId)

    if (Number.isNaN(materiaIdNum)) {
      setError('El identificador de la materia no es valido.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const materias = await getMateriasEstudiante(profile.id)
      const materiaExiste = materias.some((m) => m.id === materiaIdNum)

      if (!materiaExiste) {
        throw new Error('La materia no pertenece a tu matricula actual.')
      }

      const metrics = await getDashboardMetrics(profile)

      if (!metrics.semanaObjetivo) {
        throw new Error('No existe semana activa para registrar asistencia.')
      }

      await crearAsistencia({
        estudianteId: profile.id,
        semanaId: metrics.semanaObjetivo.id,
        materiaId: materiaIdNum,
        asistencia,
        motivoInasistencia: requiereMotivo ? motivo : 'N/A',
        rating: requiereRating ? rating : 0,
        razonRating: requiereRazonRating ? razonRating : 'N/A',
        observaciones: observacion.trim() ? observacion : 'Ninguna observacion',
      })

      const materiasPendientes = await getMateriasConRegistroSemana(
        profile,
        metrics.semanaObjetivo.id,
      )

      const faltantes = materiasPendientes.some((item) => !item.registro)
      navigate(faltantes ? '/materias' : '/dashboard', { replace: true })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No fue posible registrar la asistencia.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card">Cargando formulario...</div>
  }

  return (
    <section className="stack-lg">
      <div className="card">
        <p className="eyebrow">Registrar asistencia</p>
        <h1>{materiaNombre}</h1>
        <p>
          <Link to="/materias">Volver a materias</Link>
        </p>
      </div>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label>
          Pudiste asistir?
          <select
            value={asistencia}
            onChange={(event) => setAsistencia(event.target.value as TipoAsistencia)}
            required
          >
            <option value="">Selecciona una opcion</option>
            {opciones.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </label>

        {requiereMotivo ? (
          <label>
            Motivo de inasistencia
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} />
          </label>
        ) : null}

        {requiereRating ? (
          <div>
            <label style={{ textAlign: 'center' }}>¿Cómo calificarías la sesión?</label>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`star-btn ${rating >= star ? 'active' : ''}`}
                  title={`${star} Estrellas`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {requiereRazonRating ? (
          <label>
            Cuentanos tu inconformidad
            <textarea
              value={razonRating}
              onChange={(event) => setRazonRating(event.target.value)}
              rows={3}
            />
          </label>
        ) : null}

        <label>
          Observacion (opcional)
          <textarea
            value={observacion}
            onChange={(event) => setObservacion(event.target.value)}
            rows={3}
          />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <button className="btn-primary" disabled={!canSubmit || saving}>
          {saving ? 'Guardando...' : 'Enviar registro'}
        </button>
      </form>
    </section>
  )
}
