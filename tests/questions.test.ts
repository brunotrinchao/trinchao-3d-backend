import { describe, expect, it } from 'vitest'
import { mapQuestion } from '@/lib/marketplace/questions'

describe('mapQuestion', () => {
  it('mapeia shape completo da Questions API', () => {
    const q = mapQuestion({
      id: 555,
      text: 'Faz em azul?',
      date_created: '2026-11-16T10:00:00.000-04:00',
      status: 'UNANSWERED',
      from: { nickname: 'COMPRADOR123' },
      item_id: 'MLB111222',
    })
    expect(q).toEqual({
      id: '555',
      texto: 'Faz em azul?',
      data: '2026-11-16T10:00:00.000-04:00',
      comprador: 'COMPRADOR123',
      itemId: 'MLB111222',
    })
  })

  it('campos ausentes viram defaults, sem quebrar', () => {
    const q = mapQuestion({ id: 1 })
    expect(q.texto).toBe('')
    expect(q.comprador).toBe('')
    expect(q.itemId).toBe('')
  })
})
