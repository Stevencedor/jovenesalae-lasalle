import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KpiCard } from '../components/KpiCard'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import {
  getDashboardMetrics,
  getResumenHermanoMayor,
  getResumenSemestralPorEstudiantes,
  getResumenTutorGeneral,
  getSemanaActual,
  getTipoSemanaEspecial,
} from '../services/asistenciaService'
import type {
  DashboardMetrics,
  ResumenAsistencia,
  TipoSemanaEspecial,
  TutorGrupoResumen,
} from '../types/domain'

type LiderSummary = {
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
  tipoSemanaEspecial: TipoSemanaEspecial | null
}

type DashboardCacheEntry = {
  metrics: DashboardMetrics | null
  liderSummary: LiderSummary | null
  semanaId: number | null
}

type SemestralSnapshot = {
  totalMateriasSemana: number
  asistenciasTotales: number
  totalEsperadoSemestre: number
}

type SemestralCacheEntry = {
  data: Map<number, SemestralSnapshot>
  expiresAt: number
}

const dashboardViewCache = new Map<string, DashboardCacheEntry>()
const semestralSnapshotCache = new Map<string, SemestralCacheEntry>()
const DASHBOARD_CACHE_PREFIX = 'dashboard-cache:v1:'
const SEMESTRAL_SEGMENT_TTL_MS = 60_000

function getDashboardCacheKey(profileId: number, rol: string) {
  return `${profileId}:${rol}`
}

function getSemestralSegmentKey(corteSemestre: string, semanaAcademica: number, estudianteIds: number[]) {
  const ids = Array.from(new Set(estudianteIds)).sort((a, b) => a - b)
  return `${corteSemestre}:${semanaAcademica}:${ids.join(',')}`
}

function readDashboardCacheFromSession(cacheKey: string): DashboardCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(`${DASHBOARD_CACHE_PREFIX}${cacheKey}`)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as DashboardCacheEntry
  } catch {
    return null
  }
}

function saveDashboardCache(cacheKey: string, entry: DashboardCacheEntry) {
  dashboardViewCache.set(cacheKey, entry)
  try {
    sessionStorage.setItem(`${DASHBOARD_CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry))
  } catch {
    // Ignore storage quota/transient errors and keep in-memory cache.
  }
}

const emptyLiderSummary: LiderSummary = {
  totalHermanosMayores: 0,
  totalEstudiantes: 0,
  completadosSemana: 0,
  enProgresoSemana: 0,
  sinRegistroSemana: 0,
  asistenciasSemana: 0,
  totalMateriasSemana: 0,
  asistenciaSemanalPorcentaje: 0,
  asistenciasTotales: 0,
  totalEsperadoSemestre: 0,
  asistenciaSemestralPorcentaje: 0,
  detalleTutor: [],
  corte: '-',
  semanaAcademica: 0,
  tipoSemanaEspecial: null,
}

const emptyMetrics: DashboardMetrics = {
  totalMaterias: 0,
  asistenciaSemanalPorcentaje: 0,
  asistenciasSemana: 0,
  asistenciaSemestralPorcentaje: 0,
  asistenciasTotales: 0,
  totalEsperadoSemestre: 0,
  semanaObjetivo: null,
  semanaActual: null,
  tipoSemanaEspecial: null,
}

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(2)}%`
}

function normalizePercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [liderSummary, setLiderSummary] = useState<LiderSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  function calcularResumenSemestral(
    rows: ResumenAsistencia[],
    semestralPorEstudiante: Map<number, SemestralSnapshot>,
  ) {
    let asistenciasSemana = 0
    let totalMateriasSemana = 0
    let asistenciasTotales = 0
    let totalEsperadoSemestre = 0

    for (const item of rows) {
      const semestral = semestralPorEstudiante.get(item.estudianteId)
      asistenciasSemana += item.asistenciaRealizada
      totalMateriasSemana += semestral?.totalMateriasSemana ?? 0
      asistenciasTotales += semestral?.asistenciasTotales ?? 0
      totalEsperadoSemestre += semestral?.totalEsperadoSemestre ?? 0
    }

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

  async function getSemestralSegmentSnapshot(
    estudianteIds: number[],
    corteSemestre: string,
    semanaAcademica: number,
  ): Promise<Map<number, SemestralSnapshot>> {
    const key = getSemestralSegmentKey(corteSemestre, semanaAcademica, estudianteIds)
    const cached = semestralSnapshotCache.get(key)

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    const data = await getResumenSemestralPorEstudiantes(estudianteIds, corteSemestre, semanaAcademica)
    semestralSnapshotCache.set(key, {
      data,
      expiresAt: Date.now() + SEMESTRAL_SEGMENT_TTL_MS,
    })

    return data
  }

  const refreshLiderSummaryForKnownWeek = useCallback(async (
    cacheKey: string,
    semanaId: number,
    corteSemestre: string,
    semanaAcademica: number,
  ) => {
    if (!profile || profile.rol === 'Hermano_Menor') {
      return
    }

    const cached = dashboardViewCache.get(cacheKey) ?? readDashboardCacheFromSession(cacheKey)
    const tipoSemanaEspecial = cached?.liderSummary?.tipoSemanaEspecial ?? null

    if (profile.rol === 'Hermano_Mayor') {
      const resumenSemana = await getResumenHermanoMayor(profile.id, semanaId)
      const semestralPorEstudiante = await getSemestralSegmentSnapshot(
        resumenSemana.map((item) => item.estudianteId),
        corteSemestre,
        semanaAcademica,
      )
      const semestral = calcularResumenSemestral(resumenSemana, semestralPorEstudiante)

      const nextSummary: LiderSummary = {
        totalHermanosMayores: 1,
        totalEstudiantes: resumenSemana.length,
        completadosSemana: resumenSemana.filter((r) => r.progreso === 'Completado').length,
        enProgresoSemana: resumenSemana.filter((r) => r.progreso === 'En progreso').length,
        sinRegistroSemana: resumenSemana.filter((r) => r.progreso === 'Sin registro').length,
        ...semestral,
        detalleTutor: [],
        corte: corteSemestre,
        semanaAcademica,
        tipoSemanaEspecial,
      }

      setLiderSummary(nextSummary)
      setMetrics(null)
      saveDashboardCache(cacheKey, {
        metrics: null,
        liderSummary: nextSummary,
        semanaId,
      })
      return
    }

    const grupos = await getResumenTutorGeneral(semanaId)
    const gruposConHermanoMayor = grupos.filter((g) => g.hermanoMayor !== null)
    const allRows = grupos.flatMap((g) => g.estudiantes)
    const semestralPorEstudiante = await getSemestralSegmentSnapshot(
      allRows.map((item) => item.estudianteId),
      corteSemestre,
      semanaAcademica,
    )
    const semestral = calcularResumenSemestral(allRows, semestralPorEstudiante)

    const detalleTutor = grupos.map((grupo: TutorGrupoResumen) => {
      const groupSemestral = calcularResumenSemestral(grupo.estudiantes, semestralPorEstudiante)

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
    })

    const nextSummary: LiderSummary = {
      totalHermanosMayores: gruposConHermanoMayor.length,
      totalEstudiantes: allRows.length,
      completadosSemana: allRows.filter((r) => r.progreso === 'Completado').length,
      enProgresoSemana: allRows.filter((r) => r.progreso === 'En progreso').length,
      sinRegistroSemana: allRows.filter((r) => r.progreso === 'Sin registro').length,
      ...semestral,
      detalleTutor,
      corte: corteSemestre,
      semanaAcademica,
      tipoSemanaEspecial,
    }

    setLiderSummary(nextSummary)
    setMetrics(null)
    saveDashboardCache(cacheKey, {
      metrics: null,
      liderSummary: nextSummary,
      semanaId,
    })
  }, [profile])

  useEffect(() => {
    if (!profile) {
      return
    }

    const cacheKey = getDashboardCacheKey(profile.id, profile.rol)
    const cached = dashboardViewCache.get(cacheKey) ?? readDashboardCacheFromSession(cacheKey)

    if (cached) {
      dashboardViewCache.set(cacheKey, cached)
      queueMicrotask(() => {
        setMetrics(cached.metrics)
        setLiderSummary(cached.liderSummary)
        setHasLoadedOnce(true)
        setLoading(false)
      })
    }

    const shouldFetch = refreshToken > 0 || !cached
    if (!shouldFetch) {
      return
    }

    queueMicrotask(() => {
      setLoading(true)
      setError(null)
    })

    if (profile.rol === 'Hermano_Menor') {
      getDashboardMetrics(profile)
        .then((result) => {
          setMetrics(result)
          setLiderSummary(null)
          saveDashboardCache(cacheKey, {
            metrics: result,
            liderSummary: null,
            semanaId: result.semanaActual?.id ?? null,
          })
          setHasLoadedOnce(true)
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
          const semestralPorEstudiante = await getSemestralSegmentSnapshot(
            resumenSemana.map((item) => item.estudianteId),
            semanaActual.corte_semestre,
            semanaActual.semana_academica,
          )
          const semestral = calcularResumenSemestral(resumenSemana, semestralPorEstudiante)

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
            tipoSemanaEspecial: getTipoSemanaEspecial(semanaActual),
          })
          setMetrics(null)
          saveDashboardCache(cacheKey, {
            metrics: null,
            liderSummary: {
              totalHermanosMayores: 1,
              totalEstudiantes: resumenSemana.length,
              completadosSemana: resumenSemana.filter((r) => r.progreso === 'Completado').length,
              enProgresoSemana: resumenSemana.filter((r) => r.progreso === 'En progreso').length,
              sinRegistroSemana: resumenSemana.filter((r) => r.progreso === 'Sin registro').length,
              ...semestral,
              detalleTutor: [],
              corte: semanaActual.corte_semestre,
              semanaAcademica: semanaActual.semana_academica,
              tipoSemanaEspecial: getTipoSemanaEspecial(semanaActual),
            },
            semanaId: semanaActual.id,
          })
          setHasLoadedOnce(true)
          setLoading(false)
          return
        }

        const grupos = await getResumenTutorGeneral(semanaActual.id)
        const gruposConHermanoMayor = grupos.filter((g) => g.hermanoMayor !== null)
        const allRows = grupos.flatMap((g) => g.estudiantes)
        const semestralPorEstudiante = await getSemestralSegmentSnapshot(
          allRows.map((item) => item.estudianteId),
          semanaActual.corte_semestre,
          semanaActual.semana_academica,
        )
        const semestral = calcularResumenSemestral(allRows, semestralPorEstudiante)

        const detalleTutor = grupos.map((grupo: TutorGrupoResumen) => {
          const groupSemestral = calcularResumenSemestral(
            grupo.estudiantes,
            semestralPorEstudiante,
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
        })

        const nextSummary: LiderSummary = {
          totalHermanosMayores: gruposConHermanoMayor.length,
          totalEstudiantes: allRows.length,
          completadosSemana: allRows.filter((r) => r.progreso === 'Completado').length,
          enProgresoSemana: allRows.filter((r) => r.progreso === 'En progreso').length,
          sinRegistroSemana: allRows.filter((r) => r.progreso === 'Sin registro').length,
          ...semestral,
          detalleTutor,
          corte: semanaActual.corte_semestre,
          semanaAcademica: semanaActual.semana_academica,
          tipoSemanaEspecial: getTipoSemanaEspecial(semanaActual),
        }

        setLiderSummary(nextSummary)
        setMetrics(null)
        saveDashboardCache(cacheKey, {
          metrics: null,
          liderSummary: nextSummary,
          semanaId: semanaActual.id,
        })
        setHasLoadedOnce(true)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar metricas')
        setLoading(false)
      })
  }, [profile, refreshToken])

  useEffect(() => {
    if (!profile) {
      return
    }

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null

    const queueFullRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }

      refreshTimeout = setTimeout(() => {
        setRefreshToken((prev) => prev + 1)
      }, 300)
    }

    const queueSoftRefresh = async () => {
      const cacheKey = getDashboardCacheKey(profile.id, profile.rol)
      const cached = dashboardViewCache.get(cacheKey) ?? readDashboardCacheFromSession(cacheKey)

      if (!cached?.liderSummary || !cached.semanaId) {
        queueFullRefresh()
        return
      }

      try {
        await refreshLiderSummaryForKnownWeek(
          cacheKey,
          cached.semanaId,
          cached.liderSummary.corte,
          cached.liderSummary.semanaAcademica,
        )
      } catch {
        queueFullRefresh()
      }
    }

    const onAsistenciasOrMatriculasChange = () => {
      if (profile.rol === 'Hermano_Menor') {
        queueFullRefresh()
        return
      }
      void queueSoftRefresh()
    }

    const channel = supabase
      .channel(`dashboard-live-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'asistencias' }, onAsistenciasOrMatriculasChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estudiante_materias' }, onAsistenciasOrMatriculasChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estudiantes' }, queueFullRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'semanas' }, queueFullRefresh)
      .subscribe()

    return () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout)
      }
      supabase.removeChannel(channel)
    }
  }, [profile, refreshLiderSummaryForKnownWeek])

  if (error) {
    return <div className="card error-text">{error ?? 'No hay datos para mostrar.'}</div>
  }

  const viewMetrics = metrics ?? emptyMetrics
  const viewSummary = liderSummary ?? emptyLiderSummary
  const tipoSemanaEspecial = viewMetrics.tipoSemanaEspecial ?? viewSummary.tipoSemanaEspecial

  const bannerSemanaEspecial = tipoSemanaEspecial ? (
    <div className="card banner banner-special">
      <p className="eyebrow">Semana especial</p>
      <h1>{tipoSemanaEspecial}</h1>
      <p>
        Esta semana se registra en el calendario para trazabilidad, pero no es hábil para
        diligenciar asistencia.
      </p>
      <span className="pill pill-warn">No requiere asistencia</span>
    </div>
  ) : null

  if (profile?.rol === 'Hermano_Menor') {
    return (
      <section className="stack-xl">
        {bannerSemanaEspecial}
        <div className="card banner">
          <p className="eyebrow">Resumen semanal</p>
          <h1>Hola, {profile?.nombre}</h1>
          <p>
            Semana actual: {viewMetrics.semanaActual?.semana_academica ?? '-'} | Corte:{' '}
            {viewMetrics.semanaActual?.corte_semestre ?? '-'}
          </p>
          {loading && hasLoadedOnce ? <small>Actualizando datos...</small> : null}
        </div>

        <div className="kpi-grid">
          <KpiCard
            title="Materias del semestre"
            value={`${viewMetrics.totalMaterias}`}
            subtitle={`Semestre ${profile?.semestre ?? '-'}`}
          />
          <KpiCard
            title="Asistencia semanal"
            value={formatPercent(viewMetrics.asistenciaSemanalPorcentaje)}
            subtitle={`${viewMetrics.asistenciasSemana} registradas de ${viewMetrics.totalMaterias}`}
          />
          <KpiCard
            title="Asistencia semestral"
            value={formatPercent(viewMetrics.asistenciaSemestralPorcentaje)}
            subtitle={`${viewMetrics.asistenciasTotales} de ${viewMetrics.totalEsperadoSemestre}`}
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
      {bannerSemanaEspecial}
      <div className="card banner">
        <p className="eyebrow">Resumen de liderazgo</p>
        <h1>Hola, {profile?.nombre}</h1>
        <p>
          Semana actual: {viewSummary.semanaAcademica || '-'} | Corte: {viewSummary.corte}
        </p>
        {loading && hasLoadedOnce ? <small>Actualizando datos...</small> : null}
      </div>

      <div className="kpi-grid">
        {profile?.rol === 'Tutor' ? (
          <KpiCard
            title="Hermanos Mayores"
            value={`${viewSummary.totalHermanosMayores}`}
            subtitle="Lideres activos"
          />
        ) : null}
        <KpiCard
          title="Hermanos Menores"
          value={`${viewSummary.totalEstudiantes}`}
          subtitle="Total bajo seguimiento"
        />
        <KpiCard
          title="Asistencia semanal"
          value={formatPercent(viewSummary.asistenciaSemanalPorcentaje)}
          subtitle={`${viewSummary.asistenciasSemana} registros de ${viewSummary.totalMateriasSemana}`}
        />
        <KpiCard
          title="Asistencia semestral"
          value={formatPercent(viewSummary.asistenciaSemestralPorcentaje)}
          subtitle={`${viewSummary.asistenciasTotales} de ${viewSummary.totalEsperadoSemestre}`}
        />
      </div>

      <div className="card">
        <h2>Estado semanal</h2>
        <div className="hero-actions" style={{ marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <span className="pill pill-ok">Completado: {viewSummary.completadosSemana}</span>
          <span className="pill pill-warn">En progreso: {viewSummary.enProgresoSemana}</span>
          <span className="pill pill-danger">Sin registro: {viewSummary.sinRegistroSemana}</span>
        </div>
      </div>

      {profile?.rol === 'Tutor' && viewSummary.detalleTutor.length > 0 ? (
        <div className="card stack-md">
          <h2>Detalle por Hermano Mayor</h2>
          <div className="hm-exec-grid">
            {viewSummary.detalleTutor.map((item) => (
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
