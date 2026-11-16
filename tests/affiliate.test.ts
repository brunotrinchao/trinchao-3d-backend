import { describe, expect, it } from 'vitest'
import { buildAffiliateLink, validateAffiliateTag } from '@/lib/marketplace/affiliate'

const PERMALINK = 'https://www.mercadolivre.com.br/vaso-3d-20cm/p/MLB123456'

describe('buildAffiliateLink', () => {
  it('formato 1 — tag simples vai no parâmetro tag', () => {
    const link = buildAffiliateLink(PERMALINK, 'SEUNOME-20')
    expect(link).toBe(`${PERMALINK}?tag=SEUNOME-20`)
  })

  it('formato 2 — matt:word:tool vira matt_word + matt_tool', () => {
    const link = buildAffiliateLink(PERMALINK, 'matt:usuario:78793736')
    expect(link).toContain('matt_word=usuario')
    expect(link).toContain('matt_tool=78793736')
    expect(link).not.toContain('tag=')
  })

  it('sem tag → link original', () => {
    expect(buildAffiliateLink(PERMALINK, '')).toBe(PERMALINK)
  })

  it('preserva query params existentes do permalink', () => {
    const comQuery = 'https://produto.mercadolivre.com.br/MLB999?quantity=1'
    const link = buildAffiliateLink(comQuery, 'tag-10')
    expect(link).toContain('quantity=1')
    expect(link).toContain('tag=tag-10')
  })

  it('URL inválida devolve a original sem quebrar', () => {
    expect(buildAffiliateLink('não é url', 'tag')).toBe('não é url')
  })
})

describe('extractAffiliateTag', () => {
  it('extrai matt_word/matt_tool de link social do ML', async () => {
    const { extractAffiliateTag } = await import('@/lib/marketplace/affiliate')
    const link =
      'https://www.mercadolivre.com.br/social/brunotrinchao?matt_word=brunotrinchao&matt_tool=90432077&forceInApp=true&ref=token-aqui'
    expect(extractAffiliateTag(link)).toBe('matt:brunotrinchao:90432077')
  })

  it('extrai tag simples de link com tag=', async () => {
    const { extractAffiliateTag } = await import('@/lib/marketplace/affiliate')
    expect(extractAffiliateTag('https://ml.com.br/p/MLB1?tag=SEUNOME-20')).toBe('SEUNOME-20')
  })

  it('link sem dados de afiliado → null', async () => {
    const { extractAffiliateTag } = await import('@/lib/marketplace/affiliate')
    expect(extractAffiliateTag('https://ml.com.br/p/MLB1')).toBeNull()
    expect(extractAffiliateTag('lixo')).toBeNull()
  })
})

describe('validateAffiliateTag', () => {
  it('reconhece tag simples (letras, números, hífen)', () => {
    expect(validateAffiliateTag('SEUNOME-20')).toEqual({ formato: 'tag' })
  })

  it('reconhece matt:word:tool', () => {
    expect(validateAffiliateTag('matt:pamelabenachio:78793736')).toEqual({ formato: 'matt' })
  })

  it('vazio = sem tag configurada', () => {
    expect(validateAffiliateTag('')).toEqual({ formato: null })
  })

  it('rejeita formato inválido', () => {
    expect(validateAffiliateTag('matt:só-duas-partes').formato).toBeNull()
    expect(validateAffiliateTag('tem espaço').formato).toBeNull()
    expect(validateAffiliateTag('matt:word:tool:extra').formato).toBeNull()
  })
})
