import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { AsistenciaPage } from './pages/AsistenciaPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MateriasPage } from './pages/MateriasPage'
import { PublicLanding } from './pages/PublicLanding'
import { RegistroPage } from './pages/RegistroPage'

function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<PublicLanding />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/materias" element={<MateriasPage />} />
              <Route path="/asistencia/:materiaId" element={<AsistenciaPage />} />
              <Route
                path="/registro"
                element={
                  <ProtectedRoute allowedRoles={['Hermano_Mayor']} />
                }
              >
                <Route index element={<RegistroPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}

export default App
