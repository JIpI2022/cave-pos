/**
 * Marque de l'application : une couronne.
 *
 * Dessinee en SVG plutot qu'en image : elle reste nette a toutes les tailles,
 * prend la couleur du texte environnant (`currentColor`) et fonctionne en
 * noir et blanc — indispensable pour l'en-tete d'un ticket thermique.
 */

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      {/* Couronne : trois pointes, la centrale plus haute */}
      <path
        d="M12 44 L7 18 L20 29 L32 10 L44 29 L57 18 L52 44 Z"
        fill="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
        stroke="currentColor"
      />
      {/* Bandeau de base */}
      <rect x="11" y="48" width="42" height="8" rx="4" fill="currentColor" />
      {/* Pierres : trois creux dans la couronne, pour la lisibilite a petite taille */}
      <circle cx="20" cy="36" r="2.6" className="fill-[rgb(var(--brand-ink))]" />
      <circle cx="32" cy="33" r="3" className="fill-[rgb(var(--brand-ink))]" />
      <circle cx="44" cy="36" r="2.6" className="fill-[rgb(var(--brand-ink))]" />
    </svg>
  )
}

/**
 * Logo complet : la marque et le nom. `enseigne` permet d'afficher le nom
 * reel de la boutique, saisi dans les parametres.
 */
export function LogoComplet({
  enseigne = 'Cave & Caisse',
  sousTitre,
  className = '',
  tailleMarque = 'h-9 w-9',
}: {
  enseigne?: string
  sousTitre?: string
  className?: string
  tailleMarque?: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid shrink-0 place-items-center rounded-xl bg-brand p-1.5 text-brand-ink shadow-sm">
        <Logo className={tailleMarque} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold leading-tight">{enseigne}</span>
        {sousTitre && <span className="block truncate text-xs opacity-70">{sousTitre}</span>}
      </span>
    </div>
  )
}
