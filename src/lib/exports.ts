/**
 * Exports et imports de fichiers : CSV (separateur « ; » compatible Excel FR)
 * et Excel (.xlsx) via SheetJS.
 */

import * as XLSX from 'xlsx'
import { formatDate } from './format'

export interface ExportColumn<T> {
  /** En-tete affiche dans le fichier. */
  header: string
  /** Valeur de la cellule. */
  value: (row: T) => string | number | null | undefined
}

/** Echappe une valeur pour le format CSV. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/**
 * Serialise des lignes en CSV.
 * Separateur « ; » et BOM UTF-8 : Excel francais ouvre le fichier correctement
 * sans assistant d'importation.
 */
export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(';')
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(';'))
  return '﻿' + [head, ...body].join('\r\n')
}

/** Declenche le telechargement d'un fichier dans le navigateur. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Liberation differee : Safari iOS a besoin que l'URL vive le temps du clic.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void {
  const csv = toCsv(rows, columns)
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), ensureExt(filename, 'csv'))
}

/** Export Excel (.xlsx) : une feuille, en-tetes figes, largeurs auto. */
export function downloadXlsx<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  filename: string,
  sheetName = 'Donnees',
): void {
  const data = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => normalizeCell(c.value(row)))),
  ]
  const sheet = XLSX.utils.aoa_to_sheet(data)

  // Largeur des colonnes d'apres le contenu (plafonnee a 40 caracteres)
  sheet['!cols'] = columns.map((c, i) => {
    const widest = data.reduce((max, line) => Math.max(max, String(line[i] ?? '').length), c.header.length)
    return { wch: Math.min(40, Math.max(10, widest + 2)) }
  })
  sheet['!freeze'] = { xSplit: '0', ySplit: '1' }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31))
  const out = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    ensureExt(filename, 'xlsx'),
  )
}

/** Export Excel multi-feuilles (ex. ventes + lignes de vente). */
export function downloadXlsxMulti(
  sheets: { name: string; rows: (string | number | null)[][] }[],
  filename: string,
): void {
  const book = XLSX.utils.book_new()
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31))
  }
  const out = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    ensureExt(filename, 'xlsx'),
  )
}

function normalizeCell(value: string | number | null | undefined): string | number | null {
  if (value === undefined || value === null) return null
  return value
}

function ensureExt(filename: string, ext: string): string {
  return filename.toLowerCase().endsWith(`.${ext}`) ? filename : `${filename}.${ext}`
}

/** Nom de fichier horodate : « produits_2026-10-21.csv ». */
export function stampedFilename(base: string, ext: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${base}_${stamp}.${ext}`
}

/** Nom de fichier lisible pour un ticket. */
export function ticketFilename(ref: string, date: string): string {
  return `ticket_${ref}_${formatDate(date).replace(/\//g, '-')}.pdf`
}

// ---------------------------------------------------------------------------
// Import CSV
// ---------------------------------------------------------------------------

/**
 * Analyse un CSV (separateur « ; » ou « , » detecte automatiquement).
 * Gere les guillemets, les doubles guillemets echappes et les sauts de ligne
 * a l'interieur des champs.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const delimiter = detectDelimiter(clean)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += ch
      continue
    }

    if (ch === '"') { inQuotes = true; continue }
    if (ch === delimiter) { row.push(field); field = ''; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    if (ch === '\r') continue
    field += ch
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }

  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function detectDelimiter(text: string): string {
  const head = text.split(/\r?\n/)[0] ?? ''
  const semi = (head.match(/;/g) ?? []).length
  const comma = (head.match(/,/g) ?? []).length
  const tab = (head.match(/\t/g) ?? []).length
  if (tab > semi && tab > comma) return '\t'
  return comma > semi ? ',' : ';'
}

/** Transforme un CSV en objets indexes par en-tete (en-tetes normalises). */
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const headers = rows[0].map((h) => h.trim().toLowerCase())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    return obj
  })
}

/** Lit un fichier choisi par l'utilisateur en texte UTF-8. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsText(file, 'utf-8')
  })
}
