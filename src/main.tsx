import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * Quand une nouvelle version prend la main, on recharge la page une fois.
 *
 * Sans cela, l'onglet deja ouvert continue d'utiliser les anciens fichiers
 * jusqu'a ce que quelqu'un pense a rafraichir — ce que personne ne fait sur
 * un telephone de caisse. Le garde-fou « avaitUnControleur » evite un
 * rechargement inutile a la toute premiere visite.
 */
if ('serviceWorker' in navigator) {
  const avaitUnControleur = Boolean(navigator.serviceWorker.controller)
  let dejaRecharge = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUnControleur || dejaRecharge) return
    dejaRecharge = true
    window.location.reload()
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
