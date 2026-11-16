import { describe, expect, it } from 'vitest'
import { buildAnswerPrompt } from '@/lib/ai/gemini'

describe('buildAnswerPrompt', () => {
  it('inclui pergunta, titulo e descricao do produto', () => {
    const prompt = buildAnswerPrompt('Faz em azul?', {
      title: 'Vaso Deadpool 3D',
      description: 'Impresso em PLA, 20cm.',
      customFields: [{ key: 'Material', value: 'PLA' }],
    })
    expect(prompt).toContain('Faz em azul?')
    expect(prompt).toContain('Vaso Deadpool 3D')
    expect(prompt).toContain('Impresso em PLA')
    expect(prompt).toContain('Material: PLA')
  })

  it('sem descricao/custom fields — prompt segue coeso', () => {
    const prompt = buildAnswerPrompt('Tem garantia?', { title: 'Porta celular', description: '', customFields: [] })
    expect(prompt).toContain('Porta celular')
    expect(prompt).toContain('Tem garantia?')
    expect(prompt).not.toContain('Caracteristicas informadas')
  })
})
