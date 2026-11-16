/** Opcao de categoria devolvida pelas rotas `/api/categories/*`. */
export type CategoryOption = {
  id: string
  /** Nome legivel / caminho completo, ex: "Eletronicos > Celulares". */
  path: string
}

export class MarketplaceError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'MarketplaceError'
    this.status = status
  }
}
