/**
 * Routage de l'application.
 *
 * On utilise HashRouter : les URL prennent la forme
 * https://utilisateur.github.io/cave-pos/#/produits
 * ce qui evite les erreurs 404 de GitHub Pages au rafraichissement de la page
 * (GitHub Pages ne sait pas reecrire les URL vers index.html).
 */

import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { hasSupabaseConfig } from '@/lib/supabase'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { SettingsProvider } from '@/hooks/useSettings'
import { SyncProvider } from '@/hooks/useSyncQueue'
import { ToastProvider } from '@/hooks/useToast'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Spinner } from '@/components/ui'
import Login from '@/pages/Login'
import ConfigMissing from '@/pages/ConfigMissing'

// Chargement a la demande : la caisse ne telecharge pas le code des rapports.
const Dashboard     = lazy(() => import('@/pages/Dashboard'))
const Products      = lazy(() => import('@/pages/Products'))
const Stock         = lazy(() => import('@/pages/Stock'))
const Movements     = lazy(() => import('@/pages/Movements'))
const Pos           = lazy(() => import('@/pages/Pos'))
const Sales         = lazy(() => import('@/pages/Sales'))
const Inventory     = lazy(() => import('@/pages/Inventory'))
const Suppliers     = lazy(() => import('@/pages/Suppliers'))
const Receptions    = lazy(() => import('@/pages/Receptions'))
const Customers     = lazy(() => import('@/pages/Customers'))
const CashSessions  = lazy(() => import('@/pages/CashSessions'))
const Reports       = lazy(() => import('@/pages/Reports'))
const SettingsPage  = lazy(() => import('@/pages/Settings'))

export default function App() {
  // Sans cles Supabase, on affiche la procedure de configuration.
  if (!hasSupabaseConfig) return <ConfigMissing />

  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <SettingsProvider>
            <SyncProvider>
              <AppRoutes />
            </SyncProvider>
          </SettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Ouverture de l application..." />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/connexion" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<Spinner />}>
                <Routes>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/caisse" element={<Pos />} />
                  <Route path="/ventes" element={<Sales />} />
                  <Route path="/clients" element={<Customers />} />
                  <Route path="/produits" element={<ProtectedRoute require="gerant"><Products /></ProtectedRoute>} />
                  <Route path="/stock" element={<ProtectedRoute require="gerant"><Stock /></ProtectedRoute>} />
                  <Route path="/mouvements" element={<ProtectedRoute require="gerant"><Movements /></ProtectedRoute>} />
                  <Route path="/inventaire" element={<ProtectedRoute require="gerant"><Inventory /></ProtectedRoute>} />
                  <Route path="/receptions" element={<ProtectedRoute require="gerant"><Receptions /></ProtectedRoute>} />
                  <Route path="/fournisseurs" element={<ProtectedRoute require="gerant"><Suppliers /></ProtectedRoute>} />
                  <Route path="/caisses" element={<ProtectedRoute require="gerant"><CashSessions /></ProtectedRoute>} />
                  <Route path="/rapports" element={<ProtectedRoute require="gerant"><Reports /></ProtectedRoute>} />
                  <Route path="/parametres" element={<ProtectedRoute require="admin"><SettingsPage /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

/** Un caissier arrive directement sur la caisse, les autres sur le tableau de bord. */
function HomeRedirect() {
  const { role } = useAuth()
  if (role === 'caissier') return <Navigate to="/caisse" replace />
  return <Dashboard />
}
