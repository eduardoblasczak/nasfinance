/**
 * Aviso fixo do modo demonstração.
 *
 * Fica no topo de toda tela, e não só na entrada: quem chega por um link
 * direto para /app/lancamentos precisa saber, antes de qualquer coisa, que os
 * números não são de ninguém. O link volta para a página do projeto, fora do
 * app — por isso `<a>` e não `<Link>`, que ficaria preso ao `basename`.
 */
export function DemoBanner() {
  return (
    <div className="px-5 pt-3 md:px-10">
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] bg-surface py-1 pr-2 pl-4 font-ui text-[0.8125rem]">
        {/* No celular, título e explicação em duas linhas; o separador só
            existe quando cabem numa linha só, senão sobrava pendurado. */}
        <p className="min-w-0 flex-1 py-1.5 text-dim">
          <span className="font-semibold text-fg">Demonstração</span>
          <span className="hidden sm:inline" aria-hidden="true">
            {' · '}
          </span>
          <span className="block sm:inline">dados fictícios; só lançamento novo grava</span>
        </p>
        <a
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 font-semibold text-accent underline-offset-4 hover:underline"
        >
          Sobre o projeto
        </a>
      </div>
    </div>
  )
}
