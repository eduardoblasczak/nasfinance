/**
 * Modo demonstração.
 *
 * O mesmo app, compilado com `VITE_DEMO=true`, é servido na página pública
 * (ver `LANDING_DEMO.md`) contra uma API espelho com dados fictícios. Lá ele é
 * somente leitura, exceto lançamento novo — que alimenta o feed ao vivo.
 *
 * Constante de build, não de execução: o `define` do Vite troca `__DEMO__` pelo
 * literal `false` no build de produção, e o minificador apaga cada ramo
 * `DEMO && ...` inteiro. Nenhum texto do modo demo chega ao bundle real — e o
 * build de produção é conferido por isso, não por suposição.
 */
export const DEMO: boolean = __DEMO__
