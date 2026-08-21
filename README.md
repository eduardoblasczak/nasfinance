# nasFinance

Controle de financas pessoais self-hosted, com dashboard em tempo real e
lancamento rapido pelo Atalho do iPhone.

---

## Stack

| Camada | Escolha | Por que |
|---|---|---|
| Backend | Java 21 + Quarkus 3.38 | Consumo de memoria baixo para um servidor de 3,2 GB; ecossistema Java moderno |
| Persistencia | PostgreSQL 17 + Hibernate/Panache | Suporte oficial de primeira classe no Quarkus |
| Schema | Flyway | Migrations versionadas; o Hibernate nunca altera schema |
| Frontend | React 19 + TypeScript + Vite 7 | — |
| Estilo | Tailwind CSS v4 | Configuracao via CSS, sem arquivo de config |
| Graficos | Recharts | — |
| Tempo real | Server-Sent Events | Fluxo unidirecional; atravessa o Cloudflare Tunnel sem upgrade de protocolo |

O backend serve a interface compilada como arquivo estatico: **um unico
container** atende API e site, sem Nginx separado.

---

## Rodando localmente (Windows)

Pre-requisitos ja instalados nesta maquina: JDK 25, Node 22, PostgreSQL 17
na porta 5432. **Maven nao e necessario** — o projeto traz o wrapper.

### 1. Criar o banco (uma vez so)

```bash
psql -U postgres -h localhost -p 5432 -f scripts/create-database.sql
```

As tabelas nao sao criadas aqui: o Flyway cuida disso na primeira subida.

### 2. Backend (terminal 1)

```bash
cd backend && ./mvnw quarkus:dev
```

Sobe em <http://localhost:8080>. O modo `dev` recarrega ao salvar um `.java`,
sem reiniciar nada.

- Swagger UI: <http://localhost:8080/q/swagger-ui>
- Dev UI: <http://localhost:8080/q/dev>

### 3. Frontend (terminal 2)

```bash
cd frontend && npm run dev
```

Abre em <http://localhost:5173> e encaminha `/api` para o backend.

---

## Estrutura

```
nasFinance/
├── backend/                    Quarkus
│   └── src/main/
│       ├── java/br/com/ebls/nasfinance/
│       │   ├── domain/         Entidades e enums
│       │   ├── api/            Endpoints REST, DTOs, erros, seguranca
│       │   ├── service/        Regras de negocio
│       │   └── realtime/       Barramento de eventos SSE
│       └── resources/
│           ├── application.properties
│           └── db/migration/   Migrations Flyway
├── frontend/                   React + Vite
│   └── src/
│       ├── components/         Componentes e graficos
│       ├── pages/              Telas
│       ├── hooks/              Estado e SSE
│       └── lib/                Cliente HTTP e formatacao
├── Dockerfile                  Build em 3 estagios
├── docker-compose.yml          Validacao local da imagem
└── docker-compose.prod.yml     Producao no nas-server
```

---

## API

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/api/v1/dashboard?from&to` | Resumo consolidado (padrao: mes corrente) |
| `GET` | `/api/v1/transactions` | Listagem paginada com filtros |
| `POST` | `/api/v1/transactions` | Cria lancamento |
| `PUT` | `/api/v1/transactions/{id}` | Edita |
| `DELETE` | `/api/v1/transactions/{id}` | Exclui |
| `GET` | `/api/v1/accounts` | Contas com saldo calculado |
| `GET` | `/api/v1/categories?flow` | Categorias |
| `GET` | `/api/v1/events/stream` | Canal SSE de tempo real |
| `POST` | `/api/v1/quick-entry` | **Atalho do iPhone** (Bearer token) |
| `GET` | `/api/v1/quick-entry/options` | Nomes validos para os menus do Atalho |
| `GET` | `/q/health` · `/q/metrics` | Health check e metricas Prometheus |

### Lancamento rapido pelo iPhone

O endpoint recebe **nomes**, nao ids — para que o Atalho continue funcionando
mesmo se uma categoria for recadastrada.

```http
POST /api/v1/quick-entry
Authorization: Bearer <SHORTCUT_TOKEN>
Content-Type: application/json

{ "amount": 45.90, "category": "Mercado", "account": "Vale Refeicao" }
```

Nome invalido devolve `422` **listando as opcoes validas** — sem isso, depurar
um Atalho quebrado pelo iPhone, sem console nem log, seria quase impossivel.

---

## Decisoes de projeto

**Valores em `BigDecimal`/`NUMERIC(14,2)`, nunca `double`.** Ponto flutuante
binario nao representa `0.10` exatamente e o erro se acumula em somatorios.

**`amount` sempre positivo; o sinal vem de `flow`.** Elimina a ambiguidade de
"despesa negativa" e torna as agregacoes explicitas.

**Data como `DATE`, nao `TIMESTAMP`.** Controle financeiro se importa com o dia.
Usar `DATE` remove toda a classe de bugs de fuso em relatorios mensais.

**Evento SSE so dispara apos o commit** (`TransactionPhase.AFTER_SUCCESS`).
Publicar dentro da transacao faria o dashboard recarregar e ler um estado que
ainda nao inclui o lancamento novo.

**Cores dos graficos vem de paleta validada,** verificada por script quanto a
banda de luminosidade, croma, separacao sob daltonismo e contraste minimo 3:1.
Cores escolhidas no olho falham justamente onde importa.

**Tema escuro por decisao, nao por omissao.** As cores das series foram
validadas contra a superficie escura; um tema claro exigiria outro conjunto
validado, nao uma inversao.

---

## Producao

Veja [DEPLOY.md](DEPLOY.md).
