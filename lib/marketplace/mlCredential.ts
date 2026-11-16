import { prisma } from '@/lib/prisma'
import { mlRefreshToken } from './mercadolivre'
import { MarketplaceError } from './types'

/** Margem antes do expiresAt pra considerar o token renovavel (60s). */
const REFRESH_MARGIN_MS = 60_000

/** Credencial expirada (ou expirando dentro da margem)? */
export function isCredentialExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && expiresAt.getTime() <= Date.now() + REFRESH_MARGIN_MS
}

/**
 * Credencial ML pronta pra uso: renova o access token silenciosamente via refresh_token
 * quando expirou (ou esta prestes). Se o refresh for recusado (ex: refresh token revogado),
 * apaga a credencial — o status volta "desconectado" e o botao de reconectar aparece na sidebar.
 */
export async function getFreshMlCredential() {
  const credential = await prisma.marketplaceCredential.findUnique({
    where: { marketplace: 'mercadolivre' },
  })
  if (!credential) {
    throw new MarketplaceError('conecte sua conta via /api/auth/mercadolivre primeiro', 400)
  }
  if (!isCredentialExpired(credential.expiresAt)) return credential
  return refreshMlCredential(credential.refreshToken)
}

/** Igual a `getFreshMlCredential`, mas devolve null quando a conta nao esta conectada
 * (pra rotas onde o token e opcional, ex: busca de categorias). */
export async function getFreshMlCredentialOrNull() {
  const credential = await prisma.marketplaceCredential.findUnique({
    where: { marketplace: 'mercadolivre' },
  })
  if (!credential) return null
  if (!isCredentialExpired(credential.expiresAt)) return credential
  try {
    return await refreshMlCredential(credential.refreshToken)
  } catch {
    // Refresh falhou com token opcional: segue sem Bearer (endpoints publicos continuam funcionando).
    return null
  }
}

async function refreshMlCredential(refreshToken: string | null) {
  if (!refreshToken) {
    await prisma.marketplaceCredential.delete({ where: { marketplace: 'mercadolivre' } })
    throw new MarketplaceError(
      'sessao do Mercado Livre expirada sem refresh token — conecte sua conta via /api/auth/mercadolivre',
      400,
    )
  }

  try {
    const token = await mlRefreshToken(refreshToken)
    const data = {
      accessToken: token.access_token,
      // ML pode (raramente) nao devolver refresh_token novo — mantem o anterior nesse caso.
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    }
    return await prisma.marketplaceCredential.update({ where: { marketplace: 'mercadolivre' }, data })
  } catch (err) {
    // Recusa do servidor de auth (4xx — refresh token invalido/revogado): credencial nao
    // serve mais, apaga pra status virar "desconectado". Falha de rede/5xx: mantem a
    // credencial pra tentar de novo na proxima chamada.
    const refused = err instanceof MarketplaceError && err.status >= 400 && err.status < 500
    if (refused) {
      await prisma.marketplaceCredential
        .delete({ where: { marketplace: 'mercadolivre' } })
        .catch(() => null)
      throw new MarketplaceError(
        `sessao do Mercado Livre expirada e o refresh falhou — conecte sua conta via /api/auth/mercadolivre (${err.message})`,
        400,
      )
    }
    throw err
  }
}
