/// <reference types="vite/client" />

// Traz as declaracoes de tipo do Vite para importacoes que nao sao TypeScript:
// arquivos .css, .svg, imagens e as variaveis de import.meta.env.
// Sem isto, `import './index.css'` falha na checagem de tipos.
