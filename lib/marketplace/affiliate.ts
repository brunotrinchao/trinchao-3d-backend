/** Gerador de link de afiliado do Mercado Livre — base no padrão do programa
 * de afiliados ML (tag simples ou matt_word/matt_tool). Port do projeto
 * mercadolivre-afiliados; shape puro, testável sem rede. */

export type AffiliateTagFormat = 'tag' | 'matt' | null

/** Formato 1: `SEUNOME-20` (tag simples). Formato 2: `matt:usuario:toolid`.
 * Vazio = sem tag configurada. Qualquer outra coisa = inválido. */
export function validateAffiliateTag(tag: string): { formato: AffiliateTagFormat } {
  const t = tag.trim()
  if (!t) return { formato: null }
  if (/^matt:[\w-]+:[\w-]+$/.test(t)) return { formato: 'matt' }
  if (/^[\w-]+$/.test(t)) return { formato: 'tag' }
  return { formato: null }
}

/** Insere a tag de afiliado num permalink do ML. Formato `matt:w:t` vira os
 * params `matt_word`/`matt_tool`; tag simples vira `tag`. URL inválida ou
 * tag vazia → link original intocado (nunca quebra o chamador). */
export function buildAffiliateLink(productUrl: string, tag: string): string {
  if (!tag) return productUrl
  try {
    const url = new URL(productUrl)
    const { formato } = validateAffiliateTag(tag)
    if (formato === 'matt') {
      const [, mattWord, mattTool] = tag.trim().split(':')
      url.searchParams.set('matt_word', mattWord)
      url.searchParams.set('matt_tool', mattTool)
    } else if (formato === 'tag') {
      url.searchParams.set('tag', tag.trim())
    }
    return url.toString()
  } catch {
    return productUrl
  }
}
