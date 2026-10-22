/**
 * Ossature de l'application : navigation laterale sur ordinateur,
 * barre inferieure sur mobile, bandeau d'etat reseau.
 * Les entrees de menu dependent du role de l'utilisateur connecte.
 */

import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight, BarChart3, Boxes, ClipboardList, Grape, LayoutDashboard, LogOut,
  Menu, Package, Receipt, RefreshCw, Settings as SettingsIcon, ShoppingCart, Truck,
  Users, Vault, WifiOff, X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSettings } from '@/hooks/useSettings'
import { useSyncQueue } from '@/hooks/useSyncQueue'
import { ROLE_LABELS } from '@/lib/format'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Role minimum requis ; 'caissier' = accessible a tous. */
  access: 'caissier' | 'gerant' | 'admin'
}

const NAV: NavItem[] = [
  { to: '/caisse',       label: 'Caisse',          icon: ShoppingCart,     access: 'caissier' },
  { to: '/ventes',       label: 'Ventes',          icon: Receipt,          access: 'caissier' },
  { to: '/',             label: 'Tableau de bord', icon: LayoutDashboard,  access: 'gerant' },
  { to: '/produits',     label: 'Produits',        icon: Package,          access: 'gerant' },
  { to: '/stock',        label: 'Stock',           icon: Boxes,            access: 'gerant' },
  { to: '/mouvements',   label: 'Mouvements',      icon: ArrowLeftRight,   access: 'gerant' },
  { to: '/inventaire',   label: 'Inventaire',      icon: ClipboardList,    access: 'gerant' },
  { to: '/receptions',   label: 'Receptions',      icon: Truck,            access: 'gerant' },
  { to: '/fournisseurs', label: 'Fournisseurs',    icon: Truck,            access: 'gerant' },
  { to: '/clients',      label: 'Clients',         icon: Users,            access: 'caissier' },
  { to: '/caisses',      label: 'Sessions de caisse', icon: Vault,         access: 'gerant' },
  { to: '/rapports',     label: 'Rapports',        icon: BarChart3,        access: 'gerant' },
  { to: '/parametres',   label: 'Parametres',      icon: SettingsIcon,     access: 'admin' },
]

/** Entrees de la barre inferieure sur mobile (les plus utilisees). */
const MOBILE_NAV_MANAGER = ['/caisse', '/produits', '/stock', '/', '/rapports']
const MOBILE_NAV_CASHIER = ['/caisse', '/ventes', '/clients']

function canAccess(item: NavItem, role: string | null): boolean {
  if (!role) return false
  if (item.access === 'caissier') return true
  if (item.access === 'gerant') return role === 'gerant' || role === 'admin'
  return role === 'admin'
}

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, role, signOut } = useAuth()
  const { settings } = useSettings()
  const { online, pendingCount, syncing, syncNow } = useSyncQueue()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const items = NAV.filter((i) => canAccess(i, role))
  const mobileKeys = role === 'caissier' ? MOBILE_NAV_CASHIER : MOBILE_NAV_MANAGER
  const mobileItems = mobileKeys
    .map((k) => items.find((i) => i.to === k))
    .filter((i): i is NavItem => Boolean(i))

  return (
    <div className="min-h-screen lg:flex">
      {/* ---------------- Navigation laterale (ordinateur) ---------------- */}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 text-slate-200 lg:flex">
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-wine-700 text-white">
            <Grape className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{settings?.company_name ?? 'Cave & Caisse'}</p>
            <p className="text-xs text-slate-400">{ROLE_LABELS[role ?? ''] ?? ''}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((i) => (
            <SideLink key={i.to} item={i} />
          ))}
        </nav>

        <div className="border-t border-slate-800 px-3 py-3 text-xs">
          <p className="truncate text-slate-300">{profile?.full_name || profile?.email}</p>
          <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 text-slate-400 hover:text-white">
            <LogOut className="h-4 w-4" /> Se deconnecter
          </button>
        </div>
      </aside>

      {/* ---------------- Contenu ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre superieure mobile */}
        <header className="safe-top sticky top-0 z-30 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:hidden">
          <button onClick={() => setMenuOpen(true)} className="btn-ghost p-2" aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/caisse" className="flex min-w-0 flex-1 items-center gap-2">
            <Grape className="h-5 w-5 shrink-0 text-wine-700" />
            <span className="truncate font-semibold text-slate-900">{settings?.company_name ?? 'Cave & Caisse'}</span>
          </Link>
          <StatusPill online={online} pendingCount={pendingCount} syncing={syncing} onSync={() => void syncNow()} />
        </header>

        {/* Bandeau hors ligne / file d'attente */}
        {(!online || pendingCount > 0) && (
          <div className={`flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-medium ${
            online ? 'bg-amber-100 text-amber-900' : 'bg-slate-800 text-white'}`}>
            <span className="flex items-center gap-1.5">
              {!online && <WifiOff className="h-3.5 w-3.5" />}
              {!online
                ? 'Mode hors ligne : les ventes sont enregistrees sur l appareil.'
                : `${pendingCount} vente(s) en attente de synchronisation.`}
            </span>
            {online && pendingCount > 0 && (
              <button onClick={() => void syncNow()} className="flex items-center gap-1 underline" disabled={syncing}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Synchroniser
              </button>
            )}
          </div>
        )}

        <main className="flex-1 px-3 pb-24 pt-3 sm:px-5 sm:pb-8 sm:pt-5 lg:pb-8">{children}</main>

        {/* Barre inferieure mobile */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white lg:hidden">
          {mobileItems.map((i) => {
            const active = i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)
            return (
              <NavLink
                key={i.to} to={i.to}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? 'text-wine-700' : 'text-slate-500'}`}
              >
                <i.icon className="h-5 w-5" />
                <span className="truncate px-0.5">{i.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* ---------------- Menu lateral mobile ---------------- */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-slate-900 text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
              <span className="font-semibold text-white">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="p-1 text-slate-400" aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" onClick={() => setMenuOpen(false)}>
              {items.map((i) => <SideLink key={i.to} item={i} />)}
            </nav>
            <div className="border-t border-slate-800 px-4 py-3 text-xs">
              <p className="truncate text-slate-300">{profile?.full_name || profile?.email}</p>
              <p className="text-slate-500">{ROLE_LABELS[role ?? ''] ?? ''}</p>
              <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 text-slate-400">
                <LogOut className="h-4 w-4" /> Se deconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-wine-700 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}

function StatusPill({
  online, pendingCount, syncing, onSync,
}: { online: boolean; pendingCount: number; syncing: boolean; onSync: () => void }) {
  if (online && pendingCount === 0) return null
  return (
    <button
      onClick={onSync}
      className={`badge ${online ? 'bg-amber-100 text-amber-900' : 'bg-slate-800 text-white'}`}
    >
      {online
        ? <><RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} /> {pendingCount}</>
        : <><WifiOff className="h-3 w-3" /> Hors ligne</>}
    </button>
  )
}
