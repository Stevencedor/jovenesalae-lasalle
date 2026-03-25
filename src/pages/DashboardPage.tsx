import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KpiCard } from '../components/KpiCard'
import { useAuth } from '../context/useAuth'
import {
  getAsistenciasEstudiante,
  getDashboardMetrics,
  getMateriasEstudiante,
  getResumenHermanoMayor,
  getResumenTutorGeneral,
  getSemanaActual,
} from '../services/asistenciaService'
import type { DashboardMetrics, ResumenAsistencia, TutorGrupoResumen } from '../types/domain'

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(2)}%`
}

function normalizePercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [liderSummary, setLiderSummary] = useState<{
    totalHermanosMayores: number
    totalEstudiantes: number
    completadosSemana: number
    enProgresoSemana: number
    sinRegistroSemana: number
    asistenciasSemana: number
    totalMateriasSemana: number
    asistenciaSemanalPorcentaje: number
    asistenciasTotales: number
    totalEsperadoSemestre: number
    asistenciaSemestralPorcentaje: number
    detalleTutor: Array<{
      hermanoMayorNombre: string
      totalEstudiantes: number
      asistenciaSemanalPorcentaje: number
      asistenciaSemestralPorcentaje: number
      asistenciasSemana: number
      totalMateriasSemana: number
      asistenciasTotales: number
      totalEsperadoSemestre: number
    }>
    corte: string
    semanaAcademica: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function calcularResumenSemestral(
    rows: ResumenAsistencia[],
    corteSemestre: string,
    semanaAcademica: number,
  ) {
    const perStudent = await Promise.all(
      rows.map(async (item) => {
        const [materias, asistenciasSemestrales] = await Promise.all([
          getMateriasEstudiante(item.estudianteId),
          getAsistenciasEstudiante(item.estudianteId, corteSemestre),
        ])

        return {
          asistenciasSemana: item.asistenciaRealizada,
          totalMateriasSemana: materias.length,
          asistenciasTotales: asistenciasSemestrales.length,
          totalEsperadoSemestre: materias.length * semanaAcademica,
        }
      }),
    )

    const asistenciasSemana = perStudent.reduce((acc, curr) => acc + curr.asistenciasSemana, 0)
    const totalMateriasSemana = perStudent.reduce((acc, curr) => acc + curr.totalMateriasSemana, 0)
    const asistenciasTotales = perStudent.reduce((acc, curr) => acc + curr.asistenciasTotales, 0)
    const totalEsperadoSemestre = perStudent.reduce(
      (acc, curr) => acc + curr.totalEsperadoSemestre,
      0,
    )

    const asistenciaSemanalPorcentaje =
      totalMateriasSemana > 0 ? (asistenciasSemana * 100) / totalMateriasSemana : 0

    const asistenciaSemestralPorcentaje =
      totalEsperadoSemestre > 0 ? (asistenciasTotales * 100) / totalEsperadoSemestre : 0

    return {
      asistenciasSemana,
      totalMateriasSemana,
      asistenciasTotales,
      totalEsperadoSemestre,
      asistenciaSemanalPorcentaje,
      asistenciaSemestralPorcentaje,
    }
  }

  useEffect(() => {
    if (!profile) {
      return
    }

    if (profile.rol === 'Hermano_Menor') {
      getDashboardMetrics(profile)
        .then((result) => {
          setMetrics(result)
          setLiderSummary(null)
          setLoading(false)
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar metricas')
          setLoading(false)
        })
      return
    }

    getSemanaActual()
      .then(async (semanaActual) => {
        if (!semanaActual) {
          throw new Error('No hay semana activa configurada')
        }

        if (profile.rol === 'Hermano_Mayor') {
          const resumenSemana = await getResumenHermanoMayor(profile.id, semanaActual.id)
          const semestral = await calcularResumenSemestral(
            resumenSemana,
            semanaActual.corte_semestre,
            semanaActual.semana_academica,
          )

          setLiderSummary({
            totalHermanosMayores: 1,
            totalEstudiantes: resumenSemana.length,
            completadosSemana: resumenSemana.filter((r) => r.progreso === 'Completado').length,
            enProgresoSemana: resumenSemana.filter((r) => r.progreso === 'En progreso').length,
            sinRegistroSemana: resumenSemana.filter((r) => r.progreso === 'Sin registro').length,
            ...semestral,
            detalleTutor: [],
            corte: semanaActual.corte_semestre,
            semanaAcademica: semanaActual.semana_academica,
          })
          setMetrics(null)
          setLoading(false)
          return
        }

        const grupos = await getResumenTutorGeneral(semanaActual.id)
        const gruposConHermanoMayor = grupos.filter((g) => g.hermanoMayor !== null)
        const allRows = grupos.flatMap((g) => g.estudiantes)
        const semestral = await calcularResumenSemestral(
          allRows,
          semanaActual.corte_semestre,
          semanaActual.semana_academica,
        )

        const detalleTutor = await Promise.all(
          grupos.map(async (grupo: TutorGrupoResumen) => {
            const groupSemestral = await calcularResumenSemestral(
              grupo.estudiantes,
              semanaActual.corte_semestre,
              semanaActual.semana_academica,
            )

            return {
              hermanoMayorNombre: grupo.hermanoMayor?.nombre ?? 'Sin hermano mayor asignado',
              totalEstudiantes: grupo.totalEstudiantes,
              asistenciaSemanalPorcentaje: groupSemestral.asistenciaSemanalPorcentaje,
              asistenciaSemestralPorcentaje: groupSemestral.asistenciaSemestralPorcentaje,
              asistenciasSemana: groupSemestral.asistenciasSemana,
              totalMateriasSemana: groupSemestral.totalMateriasSemana,
              asistenciasTotales: groupSemestral.asistenciasTotales,
              totalEsperadoSemestre: groupSemestral.totalEsperadoSemestre,
            }
          }),
        )

        setLiderSummary({
          totalHermanosMayores: gruposConHermanoMayor.length,
          totalEstudiantes: allRows.length,
          completadosSemana: allRows.filter((r) => r.progreso === 'Completado').length,
          enProgresoSemana: allRows.filter((r) => r.progreso === 'En progreso').length,
          sinRegistroSemana: allRows.filter((r) => r.progreso === 'Sin registro').length,
          ...semestral,
          detalleTutor,
          corte: semanaActual.corte_semestre,
          semanaAcademica: semanaActual.semana_academica,
        })
        setMetrics(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar metricas')
        setLoading(false)
      })
  }, [profile])

  if (loading) {
    return <div className="card">Cargando resumen...</div>
  }

  if (error) {
    return <div className="card error-text">{error ?? 'No hay datos para mostrar.'}</div>
  }

  if (profile?.rol === 'Hermano_Menor' && !metrics) {
    return <div className="card error-text">No hay datos para mostrar.</div>
  }

  if ((profile?.rol === 'Hermano_Mayor' || profile?.rol === 'Tutor') && !liderSummary) {
    return <div className="card error-text">No hay datos para mostrar.</div>
  }

  if (profile?.rol === 'Hermano_Menor') {
    return (
      <section className="stack-xl">
        <div className="card banner">
          <p className="eyebrow">Resumen semanal</p>
          <h1>Hola, {profile?.nombre}</h1>
          <p>
            Semana actual: {metrics?.semanaActual?.semana_academica ?? '-'} | Corte:{' '}
            {metrics?.semanaActual?.corte_semestre ?? '-'}
          </p>
        </div>

        <div className="kpi-grid">
          <KpiCard
            title="Materias del semestre"
            value={`${metrics?.totalMaterias ?? 0}`}
            subtitle={`Semestre ${profile?.semestre ?? '-'}`}
          />
          <KpiCard
            title="Asistencia semanal"
            value={formatPercent(metrics?.asistenciaSemanalPorcentaje ?? 0)}
            subtitle={`${metrics?.asistenciasSemana ?? 0} registradas de ${metrics?.totalMaterias ?? 0}`}
          />
          <KpiCard
            title="Asistencia semestral"
            value={formatPercent(metrics?.asistenciaSemestralPorcentaje ?? 0)}
            subtitle={`${metrics?.asistenciasTotales ?? 0} de ${metrics?.totalEsperadoSemestre ?? 0}`}
          />
        </div>

        <div className="card actions-card">
          <h2>Acciones</h2>
          <div className="hero-actions">
            <Link className="btn-primary" to="/materias">
              Registrar asistencia semanal
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="stack-xl">
      <div className="card banner">
        <p className="eyebrow">Resumen de liderazgo</p>
        <h1>Hola, {profile?.nombre}</h1>
        <p>
          Semana actual: {liderSummary?.semanaAcademica ?? '-'} | Corte: {liderSummary?.corte ?? '-'}
        </p>
      </div>

      <div className="kpi-grid">
        {profile?.rol === 'Tutor' ? (
          <KpiCard
            title="Hermanos Mayores"
            value={`${liderSummary?.totalHermanosMayores ?? 0}`}
            subtitle="Lideres activos"
          />
        ) : null}
        <KpiCard
          title="Hermanos Menores"
          value={`${liderSummary?.totalEstudiantes ?? 0}`}
          subtitle="Total bajo seguimiento"
        />
        <KpiCard
          title="Asistencia semanal"
          value={formatPercent(liderSummary?.asistenciaSemanalPorcentaje ?? 0)}
          subtitle={`${liderSummary?.asistenciasSemana ?? 0} registros de ${liderSummary?.totalMateriasSemana ?? 0}`}
        />
        <KpiCard
          title="Asistencia semestral"
          value={formatPercent(liderSummary?.asistenciaSemestralPorcentaje ?? 0)}
          subtitle={`${liderSummary?.asistenciasTotales ?? 0} de ${liderSummary?.totalEsperadoSemestre ?? 0}`}
        />
      </div>

      <div className="card">
        <h2>Estado semanal</h2>
        <div className="hero-actions" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <span className="pill pill-ok">Completado: {liderSummary?.completadosSemana ?? 0}</span>
          <span className="pill pill-warn">En progreso: {liderSummary?.enProgresoSemana ?? 0}</span>
          <span className="pill pill-danger">Sin registro: {liderSummary?.sinRegistroSemana ?? 0}</span>
        </div>
      </div>

      {profile?.rol === 'Tutor' && (liderSummary?.detalleTutor.length ?? 0) > 0 ? (
        <div className="card stack-md">
          <h2>Detalle por Hermano Mayor</h2>
          <div className="hm-exec-grid">
            {liderSummary?.detalleTutor.map((item) => (
              <article key={item.hermanoMayorNombre} className="hm-exec-card">
                <header className="hm-exec-header">
                  <div>
                    <p className="hm-exec-label">Lider de grupo</p>
                    <h3>{item.hermanoMayorNombre}</h3>
                  </div>
                  <span className="pill">{item.totalEstudiantes} estudiantes</span>
                </header>

                <div className="hm-progress-block">
                  <div className="hm-progress-head">
                    <span>Asistencia semanal</span>
                    <strong>{formatPercent(item.asistenciaSemanalPorcentaje)}</strong>
                  </div>
                  <div className="hm-progress-track">
                    <span
                      className="hm-progress-fill"
                      style={{ width: `${normalizePercent(item.asistenciaSemanalPorcentaje)}%` }}
                    />
                  </div>
                  <small>
                    {item.asistenciasSemana} registros de {item.totalMateriasSemana} esperados
                  </small>
                </div>

                <div className="hm-exec-metrics">
                  <div>
                    <p>Semestral</p>
                    <strong>{formatPercent(item.asistenciaSemestralPorcentaje)}</strong>
                  </div>
                  <div>
                    <p>Registros acumulados</p>
                    <strong>{item.asistenciasTotales}</strong>
                  </div>
                  <div>
                    <p>Meta acumulada</p>
                    <strong>{item.totalEsperadoSemestre}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card actions-card">
        <h2>Acciones</h2>
        <div className="hero-actions">
          <Link className="btn-primary" to="/registro">
            Ver panel de seguimiento
          </Link>
        </div>
      </div>
    </section>
  )
}
