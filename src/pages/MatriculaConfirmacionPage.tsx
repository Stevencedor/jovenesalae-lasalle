import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  confirmarMatriculaEstudiante,
  getMatriculasEstudiante,
} from '../services/asistenciaService'
import type { EstudianteMateria } from '../types/domain'

function tipoLabel(tipo: EstudianteMateria['tipo']) {
  if (tipo === 'repeticion') {
    return 'Recuperacion'
  }

  if (tipo === 'adelanto') {
    return 'Adelanto'
  }

  return 'Normal'
}

function tipoClass(tipo: EstudianteMateria['tipo']) {
  if (tipo === 'repeticion') {
    return 'pill pill-warn'
  }

  if (tipo === 'adelanto') {
    return 'pill pill-ok'
  }

  return 'pill'
}

export function MatriculaConfirmacionPage() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [matriculas, setMatriculas] = useState<EstudianteMateria[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) {
      return
    }

    getMatriculasEstudiante(profile.id)
      .then((rows) => {
        setMatriculas(rows)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudo cargar la matricula')
        setLoading(false)
      })
  }, [profile])

  async function handleConfirmar() {
    if (!profile || matriculas.length === 0) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await confirmarMatriculaEstudiante(profile.id)
      await refreshProfile()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible confirmar la matricula')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="card">Cargando matricula...</div>
  }

  return (
    <section className="stack-lg">
      <div className="card banner">
        <p className="eyebrow">Confirmacion unica</p>
        <h1>Confirma tu matricula de materias</h1>
        <p>
          Esta confirmacion se realiza una sola vez. Si necesitas cambios despues, tu Hermano Mayor
          debe gestionarlos desde el panel.
        </p>
      </div>

      <div className="list-card">
        {matriculas.length === 0 ? (
          <p>No tienes materias asignadas todavia. Contacta a tu Hermano Mayor.</p>
        ) : (
          matriculas.map((matricula) => (
            <article className="list-row" key={matricula.id}>
              <div>
                <h3>{matricula.materia?.nombre ?? `Materia #${matricula.materia_id}`}</h3>
                <small>Semestre base: {matricula.materia?.semestre ?? '-'}</small>
              </div>
              <span className={tipoClass(matricula.tipo)}>{tipoLabel(matricula.tipo)}</span>
            </article>
          ))
        )}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-primary" onClick={handleConfirmar} disabled={saving || matriculas.length === 0}>
          {saving ? 'Confirmando...' : 'Confirmar matricula'}
        </button>
      </div>
    </section>
  )
}
