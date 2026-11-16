// Projeto API-only: nenhuma pagina e renderizada.
// Este root layout existe apenas para satisfazer o App Router do Next.js.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
