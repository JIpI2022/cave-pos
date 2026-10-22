import { describe, expect, it } from 'vitest'
import {
  buildInternalCode, buildInternalEan13, detectBarcodeKind, digitsOnly,
  ean13CheckDigit, ean8CheckDigit, isValidEan13, isValidEan8, isValidUpcA,
  looksLikeScannerInput, normalizeScan, upcToEan13,
} from '@/lib/barcode'

describe('EAN-13', () => {
  it('calcule la cle de controle', () => {
    expect(ean13CheckDigit('376001234567')).toBe(0)   // 3760012345670
    expect(ean13CheckDigit('978020137962')).toBe(4)   // ISBN de reference
    expect(ean13CheckDigit('400638133393')).toBe(1)
  })

  it('valide un code complet', () => {
    expect(isValidEan13('3760012345670')).toBe(true)
    expect(isValidEan13('9780201379624')).toBe(true)
    expect(isValidEan13('3760012345678')).toBe(false) // cle erronee
    expect(isValidEan13('376001234567')).toBe(false)  // 12 chiffres
    expect(isValidEan13('')).toBe(false)
  })

  it('genere un code-barres interne valide (prefixe 200-299)', () => {
    const code = buildInternalEan13(123)
    expect(code).toHaveLength(13)
    expect(code.startsWith('200')).toBe(true)
    expect(isValidEan13(code)).toBe(true)
  })
})

describe('EAN-8 et UPC-A', () => {
  it('valide un EAN-8', () => {
    expect(ean8CheckDigit('5512345')).toBe(7)
    expect(isValidEan8('55123457')).toBe(true)
    expect(isValidEan8('55123456')).toBe(false)
  })

  it('valide un UPC-A et le convertit en EAN-13', () => {
    expect(isValidUpcA('036000291452')).toBe(true)
    expect(upcToEan13('036000291452')).toBe('0036000291452')
    expect(isValidEan13(upcToEan13('036000291452'))).toBe(true)
  })
})

describe('identification et normalisation des codes', () => {
  it('reconnait la nature du code', () => {
    expect(detectBarcodeKind('3760012345670')).toBe('EAN-13')
    expect(detectBarcodeKind('036000291452')).toBe('UPC-A')
    expect(detectBarcodeKind('55123457')).toBe('EAN-8')
    expect(detectBarcodeKind('CAV000123')).toBe('INTERNE')
    expect(detectBarcodeKind('ABC-12/XY')).toBe('AUTRE')
  })

  it('nettoie une saisie de douchette (retour chariot, espaces)', () => {
    expect(normalizeScan('  3760012345670\r\n')).toBe('3760012345670')
    expect(normalizeScan('cav000123')).toBe('CAV000123')
    expect(normalizeScan('036000291452')).toBe('0036000291452') // UPC complete en EAN-13
    expect(normalizeScan('')).toBe('')
  })

  it('ne garde que les chiffres quand c est demande', () => {
    expect(digitsOnly('376-0012 345678')).toBe('3760012345678')
  })
})

describe('codes internes', () => {
  it('construit un code avec prefixe et zeros', () => {
    expect(buildInternalCode('CAV', 123)).toBe('CAV000123')
    expect(buildInternalCode('CAV', 1, 4)).toBe('CAV0001')
    expect(buildInternalCode('cav', 7)).toBe('CAV000007')
    expect(buildInternalCode('CA-V!', 7)).toBe('CAV000007') // caracteres parasites retires
  })

  it('utilise un prefixe de repli', () => {
    expect(buildInternalCode('', 5)).toBe('CAV000005')
  })
})

describe('detection d une douchette', () => {
  it('reconnait une saisie instantanee', () => {
    expect(looksLikeScannerInput([0, 5, 10, 15, 20, 25])).toBe(true)
  })

  it('ne confond pas avec une frappe humaine', () => {
    expect(looksLikeScannerInput([0, 120, 260, 400])).toBe(false)
    expect(looksLikeScannerInput([0, 5])).toBe(false) // trop court pour decider
  })
})
