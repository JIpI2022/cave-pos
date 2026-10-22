import { describe, expect, it } from 'vitest'
import { csvToObjects, parseCsv, toCsv, stampedFilename } from '@/lib/exports'

interface Row { nom: string; prix: number; note: string | null }

const rows: Row[] = [
  { nom: 'Chablis 1er Cru', prix: 31, note: null },
  { nom: 'Cuvee "Patron"', prix: 4.9, note: 'remise ; stock bas' },
]

const columns = [
  { header: 'Nom', value: (r: Row) => r.nom },
  { header: 'Prix', value: (r: Row) => r.prix },
  { header: 'Note', value: (r: Row) => r.note },
]

describe('export CSV', () => {
  it('ecrit un en-tete et un separateur point-virgule', () => {
    const csv = toCsv(rows, columns)
    const lines = csv.replace('﻿', '').split('\r\n')
    expect(lines[0]).toBe('Nom;Prix;Note')
    expect(lines[1]).toBe('Chablis 1er Cru;31;')
  })

  it('echappe les guillemets et les points-virgules', () => {
    const csv = toCsv(rows, columns)
    expect(csv).toContain('"Cuvee ""Patron"""')
    expect(csv).toContain('"remise ; stock bas"')
  })

  it('ajoute un BOM UTF-8 pour Excel francais', () => {
    expect(toCsv(rows, columns).startsWith('﻿')).toBe(true)
  })
})

describe('import CSV', () => {
  it('analyse un fichier a separateur point-virgule', () => {
    const parsed = parseCsv('nom;prix\nChablis;31\nSancerre;17,9')
    expect(parsed).toEqual([['nom', 'prix'], ['Chablis', '31'], ['Sancerre', '17,9']])
  })

  it('analyse un fichier a separateur virgule', () => {
    expect(parseCsv('nom,prix\nChablis,31')).toEqual([['nom', 'prix'], ['Chablis', '31']])
  })

  it('gere les champs entre guillemets contenant le separateur', () => {
    const parsed = parseCsv('nom;note\n"Cuvee ""Patron""";"remise ; stock"\n')
    expect(parsed[1]).toEqual(['Cuvee "Patron"', 'remise ; stock'])
  })

  it('gere les sauts de ligne a l interieur d un champ', () => {
    const parsed = parseCsv('nom;note\nChablis;"ligne 1\nligne 2"')
    expect(parsed[1][1]).toBe('ligne 1\nligne 2')
  })

  it('ignore les lignes vides', () => {
    expect(parseCsv('a;b\n\n1;2\n\n')).toHaveLength(2)
  })

  it('transforme en objets indexes par en-tete normalise', () => {
    const objs = csvToObjects('Nom;Prix TTC\nChablis;31')
    expect(objs).toEqual([{ nom: 'Chablis', 'prix ttc': '31' }])
  })

  it('renvoie une liste vide si le fichier n a qu un en-tete', () => {
    expect(csvToObjects('nom;prix')).toEqual([])
  })
})

describe('noms de fichiers', () => {
  it('horodate le nom', () => {
    expect(stampedFilename('produits', 'csv')).toMatch(/^produits_\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
