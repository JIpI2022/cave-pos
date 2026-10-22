/**
 * Champ de saisie universel pour les codes produit.
 *
 * Trois modes de saisie :
 *  1. DOUCHETTE USB / Bluetooth : elle se comporte comme un clavier et termine
 *     par la touche Entree. Le champ garde le focus en permanence en caisse
 *     (option `keepFocus`) pour que le scan arrive toujours au bon endroit.
 *  2. CAMERA du telephone ou de la tablette (bouton appareil photo).
 *  3. SAISIE MANUELLE : code tape a la main, ou recherche par nom de produit.
 */

import { useEffect, useRef, useState } from 'react'
import { Camera, ScanLine, Search } from 'lucide-react'
import BarcodeScanner from './BarcodeScanner'
import { normalizeScan } from '@/lib/barcode'

export default function ScanInput({
  onScan, placeholder = 'Scanner ou taper un code / un nom...', keepFocus = false,
  autoFocus = true, disabled = false, className = '', onTextChange, value,
}: {
  /** Appele a la validation (Entree) ou apres une lecture camera. */
  onScan: (code: string) => void
  placeholder?: string
  /** Remet le focus sur le champ en permanence (ecran de caisse). */
  keepFocus?: boolean
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  /** Appele a chaque frappe (recherche en direct par nom). */
  onTextChange?: (text: string) => void
  /** Valeur controlee facultative. */
  value?: string
}) {
  const [text, setText] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const current = value !== undefined ? value : text

  // Garde le focus sur le champ : une douchette « tape » dans l element actif.
  useEffect(() => {
    if (!keepFocus || disabled) return
    const interval = setInterval(() => {
      const active = document.activeElement
      const isFormField =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      // On ne vole pas le focus si l utilisateur remplit un autre champ
      // ou si une fenetre modale est ouverte.
      if (!isFormField && !document.querySelector('.fixed.z-50')) {
        inputRef.current?.focus()
      }
    }, 800)
    return () => clearInterval(interval)
  }, [keepFocus, disabled])

  function submit() {
    const code = normalizeScan(current)
    if (!code) return
    onScan(code)
    setText('')
    onTextChange?.('')
    inputRef.current?.focus()
  }

  return (
    <>
      <div className={`flex items-stretch gap-2 ${className}`}>
        <div className="relative flex-1">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
          <input
            ref={inputRef}
            value={current}
            disabled={disabled}
            autoFocus={autoFocus}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value)
              onTextChange?.(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') { setText(''); onTextChange?.('') }
            }}
            className="input h-12 pl-11 pr-3 text-base"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || !current.trim()}
          className="btn-secondary h-12 px-3"
          title="Rechercher"
        >
          <Search className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={disabled}
          className="btn-primary h-12 px-3"
          title="Scanner avec la camera"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      <BarcodeScanner
        open={cameraOpen}
        onClose={() => { setCameraOpen(false); inputRef.current?.focus() }}
        onDetected={(code) => { onScan(code); setText(''); onTextChange?.('') }}
      />
    </>
  )
}
