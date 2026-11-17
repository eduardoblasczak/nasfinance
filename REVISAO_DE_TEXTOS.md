# Revisão de conteúdo e microcopy — novembro de 2026

Revisão dos textos visíveis da página pública (`demo/landing/`) e do app (`frontend/src/`). Nenhum
endpoint, payload, enum, rota, evento ou identificador mudou. O backend (`backend/`) e a API da demonstração
(`demo/src/`) não foram alterados; ver "Fora do escopo" no fim.

## Decisões de terminologia

| Antes | Depois | Por quê |
|---|---|---|
| gasto (em rótulos e títulos), "Entrou" / "Saiu", entradas e saídas | despesa(s), receita(s) | Os dois tipos de lançamento têm nome no app ("Despesa" e "Receita" nos formulários). O verbo "gastar" continua em frases. |
| feed, "Chegando agora" | Lançamentos recentes | Público geral não usa "feed". O id `feed` no HTML continua, porque o código depende dele. |
| porta(s) de entrada, "a própria tela", "Tela", "à mão", "Na tela" | origem; Painel; "registrado por você" | "Porta" não explicava o papel de cada caminho. "Painel" é como a página chama a interface do app. |
| sincronização das 6h, "o extrato chega às 6h" | consulta diária ao Open Finance, às 6h | O app **consulta** a Pluggy às 6h; o dado só é tão novo quanto a última coleta da Pluggy (ver validações). |
| Lançar, Enviar | Registrar, Registrar lançamento | Ação principal padronizada. |
| Não deu para… | Não foi possível… | Tom profissional sem ficar formal. |
| Teste ao vivo | Demonstração | Termo pedido para o ambiente público. |
| Gastos fixos | Despesas fixas | Mesmo motivo de "gasto". |

## Inventário — página pública (`demo/landing/`)

### `index.html`

| Local | Original | Novo | Motivo |
|---|---|---|---|
| `<title>`, `og:title` | nasFinance · controle de gastos no seu servidor | nasFinance · finanças pessoais no seu próprio servidor | Despesas e receitas, não só gastos. |
| `meta description` | App de controle de gastos de código aberto… Lance um gasto pelo Atalho… | Projeto pessoal de código aberto para registrar despesas e receitas e acompanhar tudo num painel… | Não reduzir o produto ao iPhone. |
| `og:description` | Três toques no iPhone e o gasto já está no painel… | Registre despesas e receitas pelo celular ou pelo computador… | Idem. |
| Link de pular | Pular para o teste | Pular para a demonstração | Terminologia. |
| Navegação | Teste ao vivo · Engenharia | Demonstração · Decisões técnicas | Terminologia; título da seção mudou. |
| Botão do topo | Abrir o app | Abrir o nasFinance | Texto de referência. |
| Sobretítulo | Finanças pessoais · código aberto | Projeto pessoal · código aberto | Deixa claro que é projeto pessoal. |
| H1 | Três toques no iPhone e o gasto já está no painel. | Suas finanças em um só lugar, no seu próprio servidor. | Texto de referência; o iPhone deixa de ser a única forma de uso. |
| Apoio | Controle de gastos no seu próprio servidor. O Atalho lança na hora; às 6h, o Open Finance confere com o extrato. | Registre despesas e receitas pelo celular ou pelo computador… Com o Open Finance conectado (o compartilhamento de dados bancários regulado pelo Banco Central, feito com a sua autorização), o sistema também consulta seus extratos uma vez por dia… | Texto de referência + explicação do Open Finance na primeira menção. |
| Botões | Abrir o app · Ler o código | Abrir o nasFinance · Ver o código no GitHub | Texto de referência. |
| Nota nova | — | O botão abre a demonstração: o app de verdade, com dados fictícios. | Diferenciar demonstração de instância pessoal. |
| Celular (título) | Novo gasto | Nova despesa | Terminologia. |
| Celular (botão) | Lançar | Registrar | Terminologia. |
| Celular (nota) | Isto manda um POST de verdade para a demonstração. | Registra uma despesa fictícia na demonstração. | Sem jargão; dados fictícios junto ao campo. |
| Celular (sem JS) | O celular precisa de JavaScript. O curl mais abaixo… | Este exemplo precisa de JavaScript. O comando curl mais abaixo… | Clareza. |
| Lista ao vivo (título) | Chegando agora | Lançamentos recentes | Terminologia. |
| Lista (rodapé) | Cada lançamento some 10 minutos depois de criado. No máximo 30 na tela. | Lançamentos de visitantes, com dados fictícios. Cada um é apagado 10 minutos depois; aparecem até 30 por vez. | "Some" é vago; retenção conferida no código. |
| Lista (sem JS) | O feed ao vivo precisa de JavaScript… | A lista ao vivo precisa de JavaScript… | Terminologia. |
| Frase | Sem anúncio e sem venda de dados. | Sem anúncios e sem venda de dados. | Concordância. |
| Legenda | Por onde o gasto entra · Tela do app | Origem dos lançamentos · Painel | Terminologia. |
| Nota | …Na demonstração, todos os dados são fictícios. | …Nesta página e na demonstração, todos os dados são fictícios. | A página também mostra dados da demo. |
| Números | portas de entrada · o extrato chega · de memória no app | maneiras de registrar · consulta diária ao Open Finance · limite de memória do app | Precisão (512 MB é limite, não uso). |
| Motivação (título) | Por que eu fiz o nasFinance | Por que este projeto existe | Texto de referência. |
| Motivação (texto) | Um parágrafo | Três parágrafos: dados sob responsabilidade própria; aprendizado em desenvolvimento e infraestrutura; uso pessoal, uma pessoa por instalação, sem cadastro | Pedido explícito. |
| Como funciona (título) | Três portas de entrada, um painel | Três maneiras de manter seus lançamentos atualizados | Texto de referência. |
| Como funciona (apoio) | Cada porta no seu ritmo. Nada contado duas vezes. | Cada uma tem um papel e tudo chega à mesma lista. Quando um lançamento parece repetido, ele espera a sua decisão… | Explica o que "nada contado duas vezes" quer dizer. |
| Diagrama | na hora, três toques · todo dia às 6h, só leitura · A própria tela · Painel / atualiza sozinho, ao vivo | na hora, pelo celular · consulta diária, só leitura · Painel · Seus lançamentos / o painel atualiza na hora | Terminologia. |
| Texto do Atalho | três toques no iPhone (valor, categoria, conta). `POST /api/v1/quick-entry` | você informa valor, categoria e conta… É um recurso adicional, configurado em cada instância. O Atalho da demonstração ainda não foi publicado. | Status real do Atalho; o endpoint foi para a área técnica. |
| Texto do Open Finance | o extrato chega às 6h, só leitura… | uma vez por dia, às 6h, o nasFinance consulta, pela Pluggy, as contas que você autorizou no banco. A conexão só lê dados… | Precisão: consulta, não chegada garantida. |
| Texto do Painel | lançar e corrigir à mão… | registre, corrija ou exclua lançamentos… É também onde você revisa o que chegou pelo Open Finance. | Papel do painel. |
| Legenda do diagrama | Lançamento que chega ao vivo passa aqui. Toque em Lançar lá em cima. | Quando alguém registra um lançamento na demonstração, ele passa por este diagrama. | Terminologia. |
| Painel (título) | O mês inteiro num número | Resumo financeiro do mês | Texto de referência. |
| Painel (apoio) | Os números da demonstração, ao vivo. | Um pedaço da primeira tela do app, com os números da demonstração… | Clareza. |
| Painel (rótulos) | Entrou · Saiu · Ritmo de gasto · Por categoria | Receitas · Despesas · Despesas ao longo do mês · Despesas por categoria | Texto de referência. |
| Painel (botão) | Abrir o painel | Abrir o nasFinance | Consistência. |
| Painel (estado) | Os números chegam quando esta parte aparece. | Os números carregam quando você chega a esta parte da página. | Clareza. |
| Demonstração (título) | Mande um lançamento você mesmo | Experimente registrar um lançamento | Texto de referência. |
| Demonstração (apoio) | A rota do Atalho: `POST /api/v1/quick-entry`. | O formulário abaixo registra um lançamento fictício… é apagado 10 minutos depois. | O endpoint foi para a área técnica. |
| Formulário | 1. Por esta página | Novo lançamento + "Use só valores inventados. Não informe dados financeiros reais." | Aviso de dados fictícios junto aos campos. |
| Formulário (dica) | De R$ 0,01 a R$ 10.000,00. | …com até 2 casas decimais. | Mostra todas as regras conferidas na API. |
| Formulário (botão) | Enviar lançamento | Registrar lançamento | Texto de referência. |
| Requisição | A requisição | "Para desenvolvedores" + A requisição que o formulário envia | Separa a parte técnica. |
| Resposta vazia | Nada enviado ainda. | Nenhum lançamento enviado ainda. | Clareza. |
| curl | 2. Pelo terminal · Copiar curl | "Para desenvolvedores" + Pelo terminal, com curl · Copiar comando; o endpoint aparece aqui | Área técnica própria. |
| Chave do visitante | …é ela que marca "você" no feed. | …É ela que marca os seus lançamentos com "você" na lista. | Terminologia. |
| Atalho | 3. Pelo iPhone · Um Atalho de demonstração, igual ao de verdade. · em breve | Atalho do iPhone · Quem executa a própria instância configura um Atalho… A versão para testar nesta demonstração ainda não foi publicada. · Ainda não disponível | Status preciso; não promete instalação. |
| Regras (título) | Regras | Regras da demonstração | Clareza. |
| Regras (itens) | Dados fictícios… · Some em 10 minutos… · Token público… · Descrição e data são descartadas. · 10 envios por minuto e 100 por dia, por IP. | …Não informe dados financeiros reais. · Cada lançamento enviado é apagado 10 minutos depois… · O token… é público e só funciona nesta demonstração. · Descrição, data e observações enviadas são ignoradas. · Limites: 10 por minuto e 100 por dia para cada IP, e 120 por minuto somando todos os visitantes. | Faltavam observações e o limite global (conferidos em `demo/src`). |
| Segurança (título) | Feito para guardar extrato bancário | Como os dados são protegidos | Texto de referência. |
| Segurança (apoio) | Cada item aponta o arquivo que prova. | Os controles da instância pessoal. Cada item indica o arquivo… onde ele está implementado ou documentado. | O Access não "se prova" por arquivo: está documentado. |
| Segurança (Access) | Só entra quem passa pelo login | Login antes de qualquer página + o Atalho usa token de serviço do Access e token da aplicação | Precisão. |
| Segurança (Pluggy) | O Open Finance só lê · Nada move dinheiro. | Open Finance só para consulta · O código não tem chamada que pague, transfira ou movimente dinheiro. | Afirmação restrita ao que o código prova. |
| Segurança (portas) | O tráfego chega por um túnel; o container roda somente leitura e sem root. | …sistema de arquivos somente leitura, sem root e sem privilégios extras. | Inclui `cap_drop` e `no-new-privileges`. |
| Segurança (backup) | Às 3h15, para fora do servidor. O teste restaura e confere que voltou. | Todo dia, às 3h15, o banco é copiado para o armazenamento da Oracle Cloud. Um script de simulação restaura a cópia e confere que os dados voltaram. | Precisão. |
| Segurança (demo) | A demo não alcança a versão real · sem caminho até o servidor real | Demonstração separada · O código da demonstração não faz nenhuma chamada à instância pessoal. | Afirmação restrita ao verificável. |
| Segurança (privacidade) | Um usuário, nenhum anúncio | Uma pessoa, sem anúncios | Concordância e tom. |
| Serviços externos | No caminho: … | Serviços externos envolvidos: … Como a Cloudflare encerra a conexão segura, o tráfego passa por ela. | Transparência. |
| Decisões técnicas (título) | Quatro bugs que não davam erro · Nenhum apareceu num log. | Problemas reais e decisões de implementação · Quatro bugs que não geravam erro nem apareciam em log. | Texto de referência. |
| Casos 01–04 (títulos) | O sinal que inverte · O id que não é id · Cinco dias de ponto verde · O Desfazer que mentia | Compra no cartão lida como receita · Compras duplicadas no fechamento da fatura · Extrato parado com status verde · Botão Desfazer que não desfazia | Títulos que dizem o problema. |
| Casos 01–04 (texto) | Uma linha | "Problema:" primeiro, depois "Solução" (antes "Como resolvi") | Pedido explícito. Links de código e testes mantidos. |
| Código (título/apoio) | Leia o código. Rode o seu. · Tudo o que esta página afirma está no repositório. | Código aberto para consultar e executar · O código, os testes e a documentação de deploy estão no repositório… A configuração do Cloudflare Access fica no painel da Cloudflare… | A frase antiga não era verdadeira para o Access. |
| Código (requisitos) | Para rodar o seu · app 512 MB, banco 256 MB | Para executar a sua instância · em produção, os limites de memória são… | 512/256 são limites do compose. |
| Código (comando) | Sobe a imagem de produção com um Postgres local. Meu deploy: | …com um PostgreSQL local, para testar na sua máquina. O passo a passo do servidor está em DEPLOY.md | Clareza. |
| Tecnologias | Faixa animada com 15 itens soltos | Lista por camada: Backend, Banco de dados, Frontend, Infraestrutura, Integrações | Pedido explícito; versões conferidas em `pom.xml` e `package.json`. |
| Transparência | Nesta demo, a interface é o código real… | Nesta demonstração… roda em Cloudflare Workers e Durable Objects… | Terminologia. |
| Rodapé | Feito por Eduardo Blasczak · Dados fictícios. Sem cookies e sem analytics. Código aberto, MIT. · Código | Desenvolvido por Eduardo Blasczak · A demonstração usa apenas dados fictícios. Sem anúncios. Esta página não grava cookies nem carrega ferramentas de analytics. Código aberto sob licença MIT. · Código no GitHub | Afirmação limitada ao que a página faz (ver validações). |

### Scripts (`demo/landing/src/`)

| Arquivo | Original | Novo | Motivo |
|---|---|---|---|
| `main.ts` | Limite de envios atingido. Tente de novo em N s. · Pode enviar de novo. · Enviando… · Enviado. Já está no feed… | …Você pode registrar de novo em N s. · Você já pode registrar de novo. · Registrando… · Lançamento registrado. Ele já aparece na lista… | Terminologia. |
| `main.ts` | Informe o valor. · Não deu para carregar as contas… · Copiar curl · Selecionado | Informe o valor do lançamento. · Não foi possível carregar… · Copiar comando · Selecionado para copiar | Clareza. |
| `phone.ts` | Lançar · Enviando… · Libera em N s · Pronto. Fica no feed por 10 minutos, para todo mundo. | Registrar · Registrando… · Disponível em N s · Pronto. A despesa fica 10 minutos na lista, visível para todos. | Terminologia. |
| `feed.ts` | Tela · some em m:ss · Não deu para carregar o feed agora. · Nada nos últimos 10 minutos. Toque em Lançar… · Ou mande pelo curl ou pelo Postman · Pausado | Painel · apagado em m:ss · Não foi possível carregar os lançamentos recentes. · Ninguém registrou um lançamento nos últimos 10 minutos. Toque em Registrar… · Ou use o formulário da demonstração · Em pausa | Terminologia; estado vazio diz o próximo passo. |
| `panel.ts` | vs. anterior · saiu no mês · % do mês · Gasto acumulado · Saldo · mês · Buscando… · Mudam sozinhos quando chega lançamento no feed. · Não deu para buscar… | vs. mês anterior · em despesas no mês · % das despesas · Despesas acumuladas · Saldo do mês · mês · Carregando… · Eles se atualizam quando chega um lançamento novo. · Não foi possível carregar… | Terminologia. |
| `api.ts` | Volta às HH:MM. · Fora da lista. Opções válidas: Contas disponiveis: … · `${message}: ${details}` (texto cru da API) | Ela volta às HH:MM. · Esse nome não existe na demonstração. Contas válidas: … · Texto por status (400, 401, 413) dizendo o que fazer | A mensagem crua da API vem sem acento e com nome de campo; ela continua visível no quadro "A resposta". |

## Inventário — app (`frontend/src/`)

| Arquivo | Original | Novo | Motivo |
|---|---|---|---|
| `lib/api.ts` | Nao foi possivel conectar ao servidor | Sem conexão com o servidor. Confira sua internet e tente de novo. | Faltavam acentos; agora diz o que fazer. |
| `lib/api.ts` | (novo) `errorMessage()` | Texto por status: 0, 404, 400/422, 5xx; cada tela passa o texto do 409/422 que importa ali | A mensagem do backend é sem acento e às vezes mostra o enum ("para EXPENSE"). |
| `hooks/useDashboard.ts`, `hooks/useResource.ts` | Erro inesperado ao carregar | Não foi possível carregar os dados. Tente de novo. | Diz o que fazer. |
| `components/AccountForm.tsx` | Conta corrente (placeholder) · Ponto de partida. O saldo atual é este valor mais os lançamentos. · Informe o nome · Salvar · Não deu para salvar… · Excluir só funciona se ela não tiver lançamentos. | Ex.: Conta corrente · Quanto havia na conta quando você começou a usar o nasFinance… · Informe o nome da conta · Salvar alterações · Não foi possível salvar a conta… (409: Já existe uma conta com esse nome…) · Só é possível excluir uma conta sem lançamentos. | Placeholder não parece valor; botões descritivos; erro específico. |
| `components/CategoryForm.tsx` | Academia · O Atalho do iPhone encontra pelo nome, ignorando acento e maiúscula. · Com valor, a Visão geral mostra quanto do teto já foi. · Salvar · Arquivar mantém o histórico classificado… | Ex.: Academia · …sem diferenciar acentos nem maiúsculas. · Limite de despesas para o mês… a Visão geral e as Análises mostram quanto dele já foi usado. · Salvar alterações · Arquivar tira a categoria dos formulários e mantém… | Explica "teto"; o teto também aparece nas Análises. |
| `components/CategoryForm.tsx` | 409 cru: "Ja existe a categoria 'X' para EXPENSE" / "…nao e possivel trocar entre despesa e receita" | Já existe uma categoria de despesa com esse nome… / Esta categoria já tem lançamentos e não pode trocar entre despesa e receita… | Sem enum; o formulário sabe qual dos dois casos aconteceu. |
| `components/TransactionForm.tsx` | Categoria · Descrição · Opcional · Registrar R$ 42,50 / Salvar R$ 42,50 · Não deu para salvar… · Na demonstração… o feed é público. | Categoria (opcional) · Descrição (opcional) · Ex.: Mercado do bairro · Registrar lançamento / Salvar alterações · Não foi possível salvar o lançamento… (422: categoria não combina com o tipo) · …porque os lançamentos recentes ficam visíveis para todos. Use só dados fictícios. | Placeholder não substitui label; botões pedidos; aviso de dados fictícios. |
| `components/DemoBanner.tsx` | dados fictícios; só lançamento novo grava | dados fictícios. Aqui só é possível registrar lançamentos novos. | Clareza. |
| `components/PluggyFreshness.tsx` | Não deu para ler a última coleta · A Pluggy não respondeu agora. A fila continua valendo. · Última coleta há X. O normal é a cada 24 h. | Não foi possível consultar a última coleta · …O que já foi importado continua aqui. · A Pluggy coletou os dados do banco pela última vez há X. O esperado é uma coleta a cada 24 h. | Clareza. |
| `components/PluggyLinks.tsx` | Não deu para ler a Pluggy agora. · Desvinculada de X · Vínculo refeito · Para ligar · A Pluggy não devolveu nenhuma conta. · Escolha a conta daqui | Não foi possível consultar a Pluggy agora. · Conta desvinculada de X · Vínculo restaurado · Para ativar · A Pluggy não retornou nenhuma conta. · Escolha a conta no nasFinance (409: Esta conta da Pluggy já está vinculada…) | "Daqui" era ambíguo. |
| `components/SpendingTrendChart.tsx` | Gasto no dia · Entrada no dia | Despesas no dia · Receitas no dia | Terminologia. |
| `components/ui/icons.tsx` | Registrado pelo atalho do iPhone | Registrado pelo Atalho do iPhone | Nome próprio. |
| `lib/format.ts` | Manual (origem) | Painel | Mesmo nome da página pública. |
| `lib/pluggy.ts` | …Atualize no Meu Pluggy primeiro. · tudo que · para conferir · Esperando você no banco · Precisa entrar de novo no banco · Nunca rodou | …Toque em Atualizar no Meu Pluggy e sincronize de novo. · tudo o que · para revisar · Aguardando sua ação no banco · É preciso entrar de novo no banco · Nenhuma ainda | Clareza; "revisar" é o nome da fila. |
| `pages/DashboardPage.tsx` | Entrou · Saiu · Ritmo de gasto · Por categoria · vs. anterior · A visão geral não carregou · Não deu para atualizar… · Ainda não há entradas nem saídas… pelo Atalho do iPhone ou pela sincronização das 6h. | Receitas · Despesas · Despesas ao longo do período · Despesas por categoria · vs. período anterior · Não foi possível carregar a visão geral · Não foi possível atualizar agora… · Ainda não há receitas nem despesas… quando você registra pelo painel ou pelo Atalho do iPhone, ou quando chegam pela consulta diária ao Open Finance. | Terminologia; o painel também registra. |
| `pages/TransactionsPage.tsx` | Tudo · Não deu para atualizar a lista. · Os lançamentos não carregaram · Nada com esses filtros · Tente outro tipo, conta ou categoria. · O que você registrar aqui, pelo Atalho do iPhone ou pelo banco… · Não deu para excluir. O lançamento voltou. | Todos · Não foi possível atualizar a lista. · Não foi possível carregar os lançamentos · Nenhum lançamento com esses filtros · Mude o tipo, a conta ou a categoria, ou limpe os filtros para ver tudo. · Os lançamentos que você registrar pelo painel ou pelo Atalho do iPhone, e os que chegarem pelo Open Finance… · Não foi possível excluir. O lançamento voltou para a lista. | Estado vazio explica o porquê e o próximo passo. |
| `pages/ReviewPage.tsx` | Consolidar · Não contar · Está certo · Classificar · Outra · Fora dos totais | Consolidar duplicata · Não contar nos totais · Manter como está · Escolher categoria · Outra categoria · Lançamento fora dos totais | Botões com ação e objeto. |
| `pages/ReviewPage.tsx` | Parece o mesmo gasto de · Bate com um pagamento visto no cartão. Se for, não é despesa nova… · Escolha onde este lançamento entra nos seus totais. · Tudo que o banco trouxe já está classificado e conferido. · A fila não carregou · Não deu para… | Parece o mesmo lançamento que · O valor bate com um pagamento registrado no cartão. Se for isso, não é uma despesa nova… · Escolha uma categoria para este lançamento. · Tudo o que chegou pelo Open Finance já foi classificado e conferido. · Não foi possível carregar a fila · Não foi possível… | Clareza. O botão de sugestão ganhou `aria-label` "Classificar como X". |
| `pages/SettingsPage.tsx` | X voltou / X arquivada · "X" sai de vez. Se ela tiver lançamentos, a exclusão é recusada — nesse caso, arquive. · Não deu para… · erro cru do 409 | Conta X desarquivada / Categoria X arquivada · A conta "X" será excluída e não poderá ser recuperada. Uma conta com lançamentos não pode ser excluída: nesse caso, arquive. · Não foi possível… · 409: Esta conta tem lançamentos e não pode ser excluída. Arquive a conta… | A concordância dependia do gênero do nome; a confirmação diz o efeito antes do toque. |
| `pages/AnalyticsPage.tsx` | Seu dinheiro contra o seu próprio normal. | Seus números comparados com o seu próprio histórico. | Clareza. |
| `analytics/CalendarSection.tsx` | Calendário de gastos · Quanto saiu em cada dia… · Nenhum gasto · …pelo Atalho do iPhone, pela sincronização ou à mão. · dias sem gasto · mais claro quanto mais saiu | Calendário de despesas · Quanto você gastou em cada dia… · Nenhuma despesa · …pelo painel, pelo Atalho do iPhone ou pelo Open Finance. · dias sem despesa · mais claro quanto maior a despesa | Terminologia. |
| `analytics/CashflowSection.tsx` | N meses: entrou × saiu · Quanto entrou e saiu… · Entrou / Saiu (legenda e quadro) · gráfico de entradas e saídas | N meses: receitas × despesas · Receitas e despesas de cada mês… · Receitas / Despesas · gráfico de receitas e despesas | Terminologia. |
| `analytics/CategoryTrendsSection.tsx` | Gasto até o dia / Gasto em · ainda não tem gastos · Acima do seu normal | Despesas até o dia / Despesas em · ainda não tem despesas · Acima da sua média | Terminologia; "normal" era vago. |
| `analytics/common.tsx` | {O calendário} não carregou · Não deu para atualizar; os números abaixo são da leitura anterior. | Não foi possível carregar {o calendário} · Não foi possível atualizar. Os números abaixo são da última atualização. | Tom. |
| `analytics/MerchantsSection.tsx` | Onde mais gasto · Gasto {período} | Onde você mais gasta · Despesas {período} | A tela fala com a pessoa em segunda pessoa. |
| `analytics/RecurringSection.tsx` | Gastos fixos | Despesas fixas | Terminologia. |
| `analytics/SourcesSection.tsx` | Por onde entra · De que porta veio cada despesa… · Na tela / digitado no app · por porta · Lançado à mão que o extrato trouxe · Nada lançado à mão · pelo Atalho ou pela tela | Origem das despesas · Por onde cada despesa chegou… · Painel / registrado por você no app · por origem · Registrado por você e confirmado pelo extrato · Nenhuma despesa registrada por você · pelo Atalho ou pelo painel | Terminologia. |
| `analytics/BudgetPaceSection.tsx` | Gasto nas categorias com teto | Despesas nas categorias com teto | Terminologia. |

## Afirmações técnicas conferidas

| Afirmação | Onde foi conferida |
|---|---|
| Consulta ao Open Finance às 6h | `application.properties`: `nasfinance.pluggy.sync-cron=0 0 6 * * ?` |
| A integração só lê | `PluggyClient.java`: um `POST` de autenticação (`/auth`), o resto é `GET` em items, contas e transações |
| Sem porta publicada; somente leitura; sem root; sem privilégios extras | `docker-compose.prod.yml` (sem `ports`, `read_only`, `cap_drop: ALL`, `no-new-privileges`) e `Dockerfile` (`USER nasfinance`) |
| Limites de 512 MB e 256 MB | `docker-compose.prod.yml` |
| Backup diário às 3h15 para o Object Storage da Oracle; simulado de restauração | `scripts/crontab-nasfinance`, `scripts/backup-database.sh`, `scripts/restore-drill.sh` |
| Demonstração: apaga em 10 min, até 30, 10/min e 100/dia por IP, 120/min no total, R$ 10.000,00, 2 casas, 1 KB | `demo/src/store.ts`, `demo/src/fence.ts`, `wrangler.jsonc` |
| A demonstração não chama a instância pessoal | `demo/src/index.ts` e `store.ts`: nenhum `fetch` externo; só os bindings `DEMO`, `ASSETS` e limitadores |
| Descrição, data e observações ignoradas | Contrato da demo repassado pela sessão de infraestrutura (`X-Demo-Ignorado`) |
| Esta página não grava cookies nem carrega analytics | Nenhum `document.cookie`/`Set-Cookie` no código; CSP em `demo/security-headers.json` só permite scripts da própria origem |
| Atalho da demonstração não publicado | `LANDING_DEMO.md` (fase 5, iCloud) e botão desabilitado na página |
| Versões da stack | `backend/pom.xml` (Java 21, Quarkus 3.38.3, Flyway), `frontend/package.json` (React 19, Vite 7, Tailwind 4) |
| Licença MIT | `LICENSE` |

## Precisam de validação

1. **Cookies da infraestrutura da Cloudflare.** A página e o Worker não criam cookies, mas recursos da zona (Bot Fight Mode, regras de WAF) podem criar `__cf_bm` ou parecidos. Por isso o texto diz "Esta página não grava cookies", e não "sem cookies". Para confirmar, abra `nasfinance.ebls.com.br` em produção e confira os cookies no navegador.
2. **Repositório público.** Os links "Ver o código no GitHub" e os links de arquivos pressupõem que `github.com/eduardoblasczak/nasFinance` está público, como indica o commit da licença MIT. Não verifiquei de fora.
3. **Coleta diária da Pluggy.** O texto diz que o app **consulta** às 6h. O dado só é tão novo quanto a última coleta da Pluggy, que no item do Meu Pluggy depende do botão Atualizar (CLAUDE.md registra 5 dias parado). A tela de Revisão já avisa quando o dado está velho.
4. **Access na frente de tudo.** A configuração fica no painel da Cloudflare, fora do repositório. A afirmação vem do CLAUDE.md e do `IPHONE_SHORTCUT.md`.
5. **Credencial do backup sem permissão de apagar.** Está no CLAUDE.md, mas não é verificável no repositório; por isso não entrou na página.

## Áreas revisadas

- Página pública inteira: metadados, navegação, todas as seções, estados de carregamento, vazio e erro, textos para leitor de tela e conteúdo sem JavaScript.
- App: navegação, Visão geral, Lançamentos (filtros, paginação, estados), Análises (todas as seções), Revisão, Ajustes (contas, categorias, Open Finance), formulários, avisos de Desfazer, confirmações e mensagens de erro.
- Como os erros do backend chegam à tela (`lib/api.ts`).

## Fora do escopo ou não alterado

- **Mensagens do backend (Java)** e da API da demonstração (`demo/src`): continuam sem acento, por convenção do projeto, e fazem parte do contrato da API (o Atalho do iPhone e a demo espelham o backend). O app não as mostra mais cruas. Elas ainda aparecem em dois lugares:
  - o quadro técnico "A resposta" da página pública, de propósito;
  - o erro bruto da última sincronização (`lastRunError`) em Ajustes › Open Finance, que é diagnóstico para quem administra a instância.
- **Variáveis de ambiente** em Ajustes (`PLUGGY_ENABLED`, `.env`): mantidas, porque são instrução para quem executa a instância.
- **Comentários de código, logs e documentação** (`*.md`): não alterados.
