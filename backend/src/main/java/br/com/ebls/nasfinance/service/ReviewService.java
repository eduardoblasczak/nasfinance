package br.com.ebls.nasfinance.service;

import java.util.List;

import org.jboss.logging.Logger;

import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.domain.Category;
import br.com.ebls.nasfinance.domain.ReviewReason;
import br.com.ebls.nasfinance.domain.ReviewStatus;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.domain.TransactionSource;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/**
 * Fila de revisao: o que a sincronizacao trouxe mas nao pode decidir sozinha.
 * <p>
 * Dois motivos colocam um lancamento aqui. O primeiro e suspeita de duplicata
 * do Atalho — e a maquina nao resolve isso, porque dois cafes de R$ 12 no mesmo
 * dia no mesmo cartao sao duas compras. O segundo e falta de categoria: a
 * Pluggy classifica tudo, mas com um vocabulario que nao e o seu, entao a
 * classificacao dela entra como sugestao no {@code notes} e nunca e aplicada
 * direto.
 */
@ApplicationScoped
public class ReviewService {

    private static final Logger LOG = Logger.getLogger(ReviewService.class);

    /**
     * O que aguarda decisao.
     * <p>
     * Junta duas condicoes diferentes de proposito: o que foi marcado como
     * suspeito, e o que chegou sem categoria. "Sem categoria" nao tem coluna
     * propria — ja e derivavel —, e manter as duas coisas numa fila so evita
     * que o usuario precise lembrar de olhar em dois lugares.
     */
    // @Transactional tambem na leitura, seguindo a convencao do
    // TransactionService: a conversao para DTO acessa `account`, `category` e
    // `duplicateOf`, todas LAZY. Sem a transacao aberta, a primeira linha da
    // fila estoura com LazyInitializationException.
    @Transactional
    public List<TransactionDto> pending() {
        return Transaction.<Transaction>find(
                // IGNORED fica de fora: ele ja foi decidido. Sem esta
                // exclusao, um lancamento ignorado continuaria pedindo
                // categoria para sempre -- e categoria nao faz sentido para
                // algo que nao entra em nenhum total.
                "reviewStatus <> ?3 "
                        + "and (reviewStatus = ?1 or (category is null and source = ?2)) "
                        + "ORDER BY occurredOn DESC, id DESC",
                ReviewStatus.PENDING, TransactionSource.AGGREGATOR, ReviewStatus.IGNORED)
                .list()
                .stream()
                .map(TransactionDto::from)
                .toList();
    }

    public long pendingCount() {
        return Transaction.count(
                "reviewStatus <> ?3 "
                        + "and (reviewStatus = ?1 or (category is null and source = ?2))",
                ReviewStatus.PENDING, TransactionSource.AGGREGATOR, ReviewStatus.IGNORED);
    }

    /**
     * Classifica e, com isso, tira da fila.
     * <p>
     * Se o unico motivo de estar aqui era a falta de categoria, preencher
     * resolve. Se havia tambem suspeita de duplicata, a suspeita continua — e
     * por isso o {@code reviewStatus} so volta para {@code NONE} quando nao ha
     * nada pendente alem da categoria.
     */
    @Transactional
    public TransactionDto categorize(Long id, Long categoryId) {
        Transaction tx = load(id);

        Category category = Category.<Category>findByIdOptional(categoryId)
                .orElseThrow(() -> BusinessException.notFound(
                        "Categoria " + categoryId + " nao encontrada"));

        if (category.flow != tx.flow) {
            throw BusinessException.conflict(
                    "A categoria '" + category.name + "' e de "
                            + (category.flow.name().equals("EXPENSE") ? "despesa" : "receita")
                            + " e este lancamento e o oposto");
        }

        tx.category = category;
        return TransactionDto.from(tx);
    }

    /**
     * "Olhei e esta certo assim."
     * <p>
     * {@code DISMISSED} e distinto de {@code NONE} de proposito: "ninguem
     * precisou olhar" e "alguem olhou e aprovou" sao fatos diferentes, e so o
     * segundo impede que a proxima sincronizacao levante a mesma suspeita.
     */
    @Transactional
    public TransactionDto dismiss(Long id) {
        Transaction tx = load(id);
        tx.reviewStatus = ReviewStatus.DISMISSED;
        tx.duplicateOf = null;
        return TransactionDto.from(tx);
    }

    /**
     * "Isto nao e um gasto meu — nao conte."
     * <p>
     * O lancamento <b>permanece</b> no banco, e isso e o ponto. Apagar nao
     * funcionaria: a chave natural que impede a reimportacao vive nele, e a
     * sincronizacao da noite seguinte — que relê 90 dias — traria o mesmo
     * registro de volta. A exclusao duraria 24 horas.
     * <p>
     * Marcado assim, ele sai de todos os totais (ver
     * {@code Transaction.NOT_IGNORED}) e continua segurando a chave.
     * <p>
     * O caso que motivou isto: o pagamento da fatura do cartao visto na conta
     * corrente. Nao e despesa, porque as compras ja entraram uma a uma — mas
     * tambem nao pode sumir.
     * <p>
     * <b>Numa suspeita de duplicata, o vinculo fica.</b> "Nao contar" ai quer
     * dizer "o do banco e a mesma compra que eu ja lancei; fica o meu". O
     * {@code duplicateOf} guarda essa confirmacao: a analise de portas de
     * entrada ({@code AnalyticsService.sources}) conta o manual como
     * confirmado pelo banco, e a deteccao de duplicata
     * ({@code PluggySyncService.findPossibleDuplicate}) para de oferecer o
     * mesmo manual para outra compra de mesmo valor. Antes o vinculo era
     * apagado e as duas coisas se perdiam. Nos outros motivos ele ja e nulo.
     */
    @Transactional
    public TransactionDto ignore(Long id) {
        Transaction tx = load(id);
        tx.reviewStatus = ReviewStatus.IGNORED;
        if (tx.reviewReason != ReviewReason.POSSIBLE_DUPLICATE) {
            tx.duplicateOf = null;
        }
        LOG.infof("Lancamento #%d marcado como ignorado; permanece no banco para segurar a chave", id);
        return TransactionDto.from(tx);
    }

    /**
     * Confirma que e duplicata e consolida em um unico lancamento.
     * <p>
     * <b>Quem sobrevive e o importado, nao o original.</b> Parece
     * contraintuitivo, mas e obrigatorio: a chave natural que impede a
     * reimportacao vive no registro vindo da Pluggy. Apagando-o, a proxima
     * sincronizacao traria o mesmo gasto de volta na noite seguinte, e a
     * "fusao" duraria 24 horas.
     * <p>
     * O que o original tinha de melhor — a categoria que voce escolheu na hora
     * da compra — e copiado antes. O importado tem o que ele tem de melhor:
     * descricao e data vindas do banco.
     */
    @Transactional
    public TransactionDto merge(Long id) {
        Transaction imported = load(id);

        Transaction original = imported.duplicateOf;
        if (original == null) {
            throw BusinessException.conflict(
                    "Este lancamento nao tem duplicata apontada");
        }

        if (imported.category == null) {
            imported.category = original.category;
        }
        if (imported.description == null || imported.description.isBlank()) {
            imported.description = original.description;
        }

        imported.notes = (imported.notes == null ? "" : imported.notes)
                + " | consolidado com lancamento #" + original.id
                + " (" + original.source + ")";

        imported.reviewStatus = ReviewStatus.NONE;
        imported.reviewReason = null;
        imported.duplicateOf = null;

        LOG.infof("Lancamento #%d (%s) consolidado em #%d (importado)",
                original.id, original.source, imported.id);

        original.delete();
        return TransactionDto.from(imported);
    }

    private Transaction load(Long id) {
        return Transaction.<Transaction>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound(
                        "Lancamento " + id + " nao encontrado"));
    }
}
