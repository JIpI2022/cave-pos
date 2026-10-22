/**
 * Lecture de codes-barres par la camera du telephone / de la tablette.
 * S'appuie sur html5-qrcode (qui utilise le decodeur ZXing en interne).
 *
 * Formats reconnus : EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 et QR.
 */

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { Camera, SwitchCamera } from 'lucide-react'
import { Alert, Button, Modal } from '@/components/ui'
import { normalizeScan } from '@/lib/barcode'

const ELEMENT_ID = 'cave-barcode-reader'

const FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
]

export default function BarcodeScanner({
  open, onClose, onDetected, title = 'Scanner un code-barres', continuous = false,
}: {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
  title?: string
  /** Si vrai, la camera reste ouverte apres chaque lecture (inventaire). */
  continuous?: boolean
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([])
  const [cameraIndex, setCameraIndex] = useState(0)
  const lastDetectedAt = useRef(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function start() {
      setError(null)
      try {
        const devices = await Html5Qrcode.getCameras()
        if (cancelled) return
        if (!devices.length) {
          setError("Aucune camera detectee sur cet appareil.")
          return
        }
        setCameras(devices.map((d) => ({ id: d.id, label: d.label })))

        // On privilegie la camera arriere (son libelle contient « back » ou « arriere »).
        const backIndex = devices.findIndex((d) => /back|arriere|rear|environment/i.test(d.label))
        const index = cameraIndex || (backIndex >= 0 ? backIndex : 0)
        setCameraIndex(index)

        const scanner = new Html5Qrcode(ELEMENT_ID, {
          formatsToSupport: FORMATS,
          verbose: false,
        })
        scannerRef.current = scanner

        await scanner.start(
          devices[index].id,
          { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.4 },
          (decoded) => {
            // Anti-rebond : une douchette camera relit le meme code plusieurs fois par seconde.
            const now = Date.now()
            if (now - lastDetectedAt.current < 1200) return
            lastDetectedAt.current = now

            const code = normalizeScan(decoded)
            setLastCode(code)
            onDetected(code)
            if (!continuous) onClose()
          },
          () => { /* images sans code : on ignore */ },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (/NotAllowed|Permission/i.test(message)) {
          setError(
            "Acces a la camera refuse. Autorisez la camera dans les reglages du navigateur, "
            + "puis rechargez la page. Sur iPhone : Reglages > Safari > Camera.",
          )
        } else if (/NotFound|no camera/i.test(message)) {
          setError('Aucune camera disponible.')
        } else if (!window.isSecureContext) {
          setError("La camera exige une connexion securisee (https). GitHub Pages est en https : verifiez l adresse.")
        } else {
          setError(`Demarrage de la camera impossible : ${message}`)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) {
        scanner.stop().then(() => scanner.clear()).catch(() => { /* deja arretee */ })
      }
    }
    // cameraIndex volontairement inclus : changer de camera relance le flux.
  }, [open, cameraIndex, continuous, onClose, onDetected])

  function switchCamera() {
    if (cameras.length < 2) return
    setCameraIndex((i) => (i + 1) % cameras.length)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          {cameras.length > 1 && (
            <Button variant="secondary" icon={SwitchCamera} onClick={switchCamera}>Changer de camera</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <Alert kind="error">{error}</Alert>
        ) : (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Camera className="h-4 w-4" /> Presentez le code-barres devant l objectif.
          </p>
        )}

        <div id={ELEMENT_ID} className="overflow-hidden rounded-lg bg-slate-900" />

        {continuous && lastCode && (
          <Alert kind="success">Dernier code lu : <span className="font-mono">{lastCode}</span></Alert>
        )}
      </div>
    </Modal>
  )
}
