import { MarketplaceError } from '../marketplace/types'

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export type DescriptionInput = {
  title: string
  weightGrams: number
  heightCm: number
  widthCm: number
  lengthCm: number
  customFields: Array<{ key: string; value: string }>
}

function buildPrompt(input: DescriptionInput): string {
  const fieldsBlock =
    input.customFields.length > 0
      ? `\nCaracteristicas informadas pelo vendedor (fatos — use-as, nao invente outras):\n${input.customFields
          .map((field) => `- ${field.key}: ${field.value}`)
          .join('\n')}\n`
      : ''

  return `Escreva uma descricao de produto pra anuncio de marketplace (Mercado Livre/Shopee), em portugues do Brasil.

Produto: "${input.title}"
Dimensoes da embalagem: ${input.heightCm} cm (altura) x ${input.widthCm} cm (largura) x ${input.lengthCm} cm (comprimento), peso ${input.weightGrams} g.
${fieldsBlock}
Regras obrigatorias:
- Apenas texto corrido em paragrafos simples. SEM tags HTML. SEM markdown (nada de #, *, -, _, links, listas com marcador).
- Linguagem clara e direta, que qualquer cliente entenda de primeira — sem jargao tecnico.
- Nao invente material, cor, marca, garantia ou caracteristica que nao foi informada acima. Fale so do que da pra inferir do titulo, das dimensoes e das caracteristicas informadas pelo vendedor (quando houver).
- Alem de descrever o produto, PONTUE as caracteristicas dele: cada caracteristica informada pelo vendedor (quando houver) citada explicitamente com o valor dela, e o que da pra inferir do titulo e das dimensoes (capacidade/porte que o tamanho sugere, formato/modelo aparente, uso tipico pra esse tipo de item, facilidade de limpeza/transporte). Cada caracteristica ganha um paragrafo curto proprio, sempre como inferencia honesta (ex: "pelo porte compacto...") — nunca como fato que voce nao tem.
- Pode mencionar que e um produto impresso em 3D, ja que e o tipo de produto vendido nessa loja.
- Extensao fixa: entre 20 e 25 linhas (contando linhas nao vazias), em paragrafos curtos, cobrindo o que e, caracteristicas pontuadas, pra que serve, por que comprar, tamanho/peso, cuidados de uso e embalagem/entrega.
- Sem emojis.
- Devolva so o texto da descricao — sem titulo, sem aspas, sem comentario antes ou depois.`
}

/** Gera descricao de produto via Gemini. Modelo configuravel (GEMINI_MODEL) pq a Google
 * descontinua/renomeia modelos com frequencia — se der 404, trocar no .env, sem mexer em codigo. */
export async function generateProductDescription(input: DescriptionInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new MarketplaceError('GEMINI_API_KEY nao configurado no .env', 500)
  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

  const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(input) }] }],
    }),
  })

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const message =
      (data?.error as Record<string, unknown> | undefined)?.message ?? `Gemini respondeu ${response.status}`
    throw new MarketplaceError(`Falha ao gerar descricao com IA: ${message}`, response.status || 502)
  }

  const candidates = data?.candidates as Array<Record<string, unknown>> | undefined
  const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)?.parts as
    | Array<Record<string, unknown>>
    | undefined
  const text = parts?.[0]?.text

  if (typeof text !== 'string' || !text.trim()) {
    throw new MarketplaceError('Gemini nao retornou texto', 502)
  }
  return text.trim()
}
