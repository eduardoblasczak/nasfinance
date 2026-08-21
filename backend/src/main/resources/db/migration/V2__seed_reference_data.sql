-- =============================================================
-- Dados de referencia iniciais
-- =============================================================
-- Contas e categorias basicas para o app ja abrir util, sem tela vazia.
-- Tudo editavel pela interface depois.
--
-- SOBRE AS CORES
-- Nao sao escolhidas por gosto. Sao os 8 tons de uma paleta categorica
-- validada para fundo escuro, verificada nos criterios de:
--   - banda de luminosidade (OKLCH L entre 0.48 e 0.67)
--   - piso de croma
--   - separacao entre cores adjacentes sob daltonismo (protan/deutan/tritan)
--   - contraste minimo 3:1 contra a superficie do grafico
--
-- Cores escolhidas "no olho" costumam falhar exatamente onde importa: dois
-- tons que parecem distintos para quem enxerga todas as cores viram o mesmo
-- tom para ~8% dos homens. A ordem dos tons faz parte da garantia.
--
-- As categorias alem da oitava repetem tons. Isso e aceitavel porque o
-- grafico de categorias e de BARRAS com rotulo em cada barra: a identidade
-- vem do texto, e a cor apenas reforca. Num grafico de pizza a repeticao
-- seria inaceitavel.
--
-- Os INSERTs sao idempotentes para que rodar a migration num banco que ja
-- tenha esses registros nao quebre o deploy.
-- =============================================================

INSERT INTO accounts (name, kind, color, opening_balance) VALUES
    ('Conta Corrente',    'CHECKING',     '#3987E5', 0),
    ('Vale Refeicao',     'MEAL_VOUCHER', '#199E70', 0),
    ('Cartao de Credito', 'CREDIT_CARD',  '#E66767', 0),
    ('Dinheiro',          'CASH',         '#C98500', 0),
    ('Poupanca',          'SAVINGS',      '#9085E9', 0)
ON CONFLICT (name) DO NOTHING;

-- ---------- Categorias de despesa ----------
-- Os oito primeiros tons seguem a ordem validada da paleta.
INSERT INTO categories (name, flow, color, icon) VALUES
    ('Mercado',           'EXPENSE', '#3987E5', 'shopping-cart'),
    ('Alimentacao',       'EXPENSE', '#D95926', 'utensils'),
    ('Transporte',        'EXPENSE', '#199E70', 'car'),
    ('Moradia',           'EXPENSE', '#C98500', 'house'),
    ('Contas e Servicos', 'EXPENSE', '#D55181', 'file-text'),
    ('Saude',             'EXPENSE', '#008300', 'heart-pulse'),
    ('Lazer',             'EXPENSE', '#9085E9', 'gamepad-2'),
    ('Compras',           'EXPENSE', '#E66767', 'shopping-bag'),
    ('Educacao',          'EXPENSE', '#3987E5', 'graduation-cap'),
    ('Assinaturas',       'EXPENSE', '#199E70', 'repeat'),
    ('Pets',              'EXPENSE', '#C98500', 'paw-print'),
    ('Outros',            'EXPENSE', '#898781', 'circle-ellipsis')
ON CONFLICT (name, flow) DO NOTHING;

-- ---------- Categorias de receita ----------
INSERT INTO categories (name, flow, color, icon) VALUES
    ('Salario',     'INCOME', '#008300', 'wallet'),
    ('Freelance',   'INCOME', '#199E70', 'laptop'),
    ('Reembolso',   'INCOME', '#3987E5', 'undo-2'),
    ('Rendimentos', 'INCOME', '#C98500', 'trending-up'),
    ('Outros',      'INCOME', '#898781', 'circle-ellipsis')
ON CONFLICT (name, flow) DO NOTHING;
