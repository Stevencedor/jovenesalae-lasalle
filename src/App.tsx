import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { AsistenciaPage } from './pages/AsistenciaPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MatriculaConfirmacionPage } from './pages/MatriculaConfirmacionPage'
import { MateriasPage } from './pages/MateriasPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicLanding } from './pages/PublicLanding'
import { RegistroPage } from './pages/RegistroPage.tsx'

function App() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-center" theme="light" />
      <HashRouter>
        <Routes>
          <Route path="/" element={<PublicLanding />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/matricula/confirmar" element={<MatriculaConfirmacionPage />} />
              <Route
                path="/materias"
                element={<ProtectedRoute allowedRoles={['Hermano_Menor']} />}
              >
                <Route index element={<MateriasPage />} />
              </Route>
              <Route
                path="/asistencia/:materiaId"
                element={<ProtectedRoute allowedRoles={['Hermano_Menor']} />}
              >
                <Route index element={<AsistenciaPage />} />
              </Route>
              <Route path="/perfil" element={<ProfilePage />} />
              <Route
                path="/registro"
                element={
                  <ProtectedRoute allowedRoles={['Hermano_Mayor', 'Tutor']} />
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
