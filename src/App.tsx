import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { TreePage } from '@/pages/TreePage'
import { UsersPage } from '@/pages/UsersPage'
import { LoginPage } from '@/pages/LoginPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SecurityPage } from '@/pages/SecurityPage'
import { AdminRoute } from '@/components/AdminRoute'
import { UpdateDialog } from '@/components/UpdateDialog'
import { useUpdateChecker } from '@/hooks/useUpdateChecker'
import { useAuthStore } from '@/stores'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { updateInfo, downloading, downloadProgress, startUpdate, dismissUpdate } = useUpdateChecker()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/tree" element={<TreePage />} />
            <Route
              path="/config"
              element={
                <AdminRoute>
                  <SettingsPage />
                </AdminRoute>
              }
            />
            <Route path="/security" element={<SecurityPage />} />
            <Route
              path="/users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
      <UpdateDialog
        open={!!updateInfo}
        onOpenChange={(open) => !open && dismissUpdate()}
        updateInfo={updateInfo}
        onUpdate={startUpdate}
        onLater={dismissUpdate}
        downloading={downloading}
        downloadProgress={downloadProgress}
      />
    </QueryClientProvider>
  )
}

export default App
