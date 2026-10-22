/** Ecran affiche lorsque les cles Supabase ne sont pas configurees. */

import { Alert } from '@/components/ui'
import { TriangleAlert } from 'lucide-react'

export default function ConfigMissing() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="card w-full max-w-2xl space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-amber-100 text-amber-700">
            <TriangleAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Configuration Supabase manquante</h1>
            <p className="text-sm text-slate-500">L application ne sait pas a quelle base se connecter.</p>
          </div>
        </div>

        <Alert kind="warning">
          Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> n ont pas ete
          fournies au moment de la compilation.
        </Alert>

        <div className="space-y-3 text-sm text-slate-700">
          <p className="font-semibold">En developpement local</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Copiez le fichier <code>.env.example</code> en <code>.env</code>.</li>
            <li>Renseignez les deux valeurs (Supabase &gt; Project Settings &gt; API).</li>
            <li>Relancez <code>npm run dev</code>.</li>
          </ol>

          <p className="font-semibold">En production (GitHub Pages)</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Depot GitHub &gt; Settings &gt; Secrets and variables &gt; Actions.</li>
            <li>
              Ajoutez les secrets <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.
            </li>
            <li>Relancez le workflow « Deploiement GitHub Pages ».</li>
          </ol>

          <p className="text-xs text-slate-500">
            Le detail pas a pas se trouve dans le fichier <code>README.md</code> du projet.
          </p>
        </div>
      </div>
    </div>
  )
}
