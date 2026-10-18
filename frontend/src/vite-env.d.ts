/// <reference types="vite/client" />

/** Literal trocado pelo `define` do Vite no build — ver `src/lib/demo.ts`. */
declare const __DEMO__: boolean

// Traz as declaracoes de tipo do Vite para importacoes que nao sao TypeScript:
// arquivos .css, .svg, imagens e as variaveis de import.meta.env.
// Sem isto, `import './index.css'` falha na checagem de tipos.
