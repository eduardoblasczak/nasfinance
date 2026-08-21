package br.com.ebls.nasfinance.service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import br.com.ebls.nasfinance.api.dto.PageResponse;
import br.com.ebls.nasfinance.api.dto.QuickEntryRequest;
import br.com.ebls.nasfinance.api.dto.TransactionDto;
import br.com.ebls.nasfinance.api.dto.TransactionRequest;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.Category;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import br.com.ebls.nasfinance.domain.TransactionSource;
import br.com.ebls.nasfinance.realtime.TransactionEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Event;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

/**
 * Regras de negocio das transacoes.
 * <p>
 * Concentrar isso aqui, e nao no resource, mantem os endpoints como uma casca
 * fina de HTTP: o mesmo {@code criar()} serve a interface web e ao Atalho do
 * iPhone, sem duplicar validacao.
 */
@ApplicationScoped
public class TransactionService {

    @Inject
    Event<TransactionEvent> events;

    @ConfigProperty(name = "nasfinance.timezone")
    String timezone;

    // ---------------------------------------------------------------
    // Consulta
    // ---------------------------------------------------------------

    /**
     * Listagem paginada com filtros.
     * <p>
     * {@code @Transactional} tambem na leitura: converter para DTO acessa
     * {@code transaction.account.name}, que dispara carregamento LAZY. Fora de
     * uma transacao ativa isso lancaria {@code LazyInitializationException}.
     */
    @Transactional
    public PageResponse<TransactionDto> search(LocalDate from,
                                               LocalDate to,
                                               Long accountId,
                                               Long categoryId,
                                               Flow flow,
                                               int page,
                                               int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.clamp(size, 1, 200);

        List<TransactionDto> items = Transaction
                .search(from, to, accountId, categoryId, flow, safePage, safeSize)
                .stream()
                .map(TransactionDto::from)
                .toList();

        long total = Transaction.countMatching(from, to, accountId, categoryId, flow);

        return PageResponse.of(items, safePage, safeSize, total);
    }

    @Transactional
    public TransactionDto findById(Long id) {
        Transaction transaction = Transaction.<Transaction>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Transacao " + id + " nao encontrada"));
        return TransactionDto.from(transaction);
    }

    // ---------------------------------------------------------------
    // Escrita
    // ---------------------------------------------------------------

    /** Cria uma transacao a partir do formulario da interface web. */
    @Transactional
    public TransactionDto create(TransactionRequest request) {
        Transaction transaction = new Transaction();

        transaction.account = requireAccount(request.accountId());
        transaction.category = resolveCategory(request.categoryId(), request.flow());
        transaction.flow = request.flow();
        transaction.amount = request.amount();
        transaction.description = trimToNull(request.description());
        transaction.occurredOn = request.occurredOn() == null ? today() : request.occurredOn();
        transaction.notes = trimToNull(request.notes());
        transaction.source = TransactionSource.MANUAL;

        transaction.persist();

        TransactionDto dto = TransactionDto.from(transaction);
        events.fire(TransactionEvent.created(dto));
        return dto;
    }

    /**
     * Cria uma transacao a partir do Atalho do iPhone.
     * <p>
     * Aqui conta e categoria chegam por <b>nome</b>. Quando o nome nao casa com
     * nada cadastrado, a resposta 422 lista as opcoes validas — sem isso, seria
     * praticamente impossivel depurar um Atalho quebrado a partir do iPhone,
     * onde nao ha console nem log.
     */
    @Transactional
    public TransactionDto quickEntry(QuickEntryRequest request) {
        Flow flow = request.flowOrDefault();

        Transaction transaction = new Transaction();
        transaction.account = resolveAccountByName(request.account());
        transaction.category = resolveCategoryByName(request.category(), flow);
        transaction.flow = flow;
        transaction.amount = request.amount();
        transaction.description = trimToNull(request.description());
        transaction.occurredOn = request.occurredOn() == null ? today() : request.occurredOn();
        transaction.source = TransactionSource.SHORTCUT;

        transaction.persist();

        TransactionDto dto = TransactionDto.from(transaction);
        events.fire(TransactionEvent.created(dto));
        return dto;
    }

    @Transactional
    public TransactionDto update(Long id, TransactionRequest request) {
        Transaction transaction = Transaction.<Transaction>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Transacao " + id + " nao encontrada"));

        transaction.account = requireAccount(request.accountId());
        transaction.category = resolveCategory(request.categoryId(), request.flow());
        transaction.flow = request.flow();
        transaction.amount = request.amount();
        transaction.description = trimToNull(request.description());
        transaction.occurredOn = request.occurredOn() == null ? transaction.occurredOn : request.occurredOn();
        transaction.notes = trimToNull(request.notes());

        // Sem persist(): a entidade esta "managed" dentro da transacao, entao o
        // Hibernate detecta as mudancas e emite o UPDATE no commit (dirty checking).

        TransactionDto dto = TransactionDto.from(transaction);
        events.fire(TransactionEvent.updated(dto));
        return dto;
    }

    @Transactional
    public void delete(Long id) {
        boolean deleted = Transaction.deleteById(id);
        if (!deleted) {
            throw BusinessException.notFound("Transacao " + id + " nao encontrada");
        }
        events.fire(TransactionEvent.deleted(id));
    }

    // ---------------------------------------------------------------
    // Resolucao de referencias
    // ---------------------------------------------------------------

    private Account requireAccount(Long accountId) {
        return Account.<Account>findByIdOptional(accountId)
                .orElseThrow(() -> BusinessException.notFound("Conta " + accountId + " nao encontrada"));
    }

    /**
     * Resolve a categoria por id, garantindo coerencia com a direcao do dinheiro.
     * <p>
     * Sem essa checagem seria possivel classificar uma despesa como "Salario",
     * e os graficos de receita passariam a somar gastos.
     */
    private Category resolveCategory(Long categoryId, Flow flow) {
        if (categoryId == null) {
            return null;
        }
        Category category = Category.<Category>findByIdOptional(categoryId)
                .orElseThrow(() -> BusinessException.notFound("Categoria " + categoryId + " nao encontrada"));

        if (category.flow != flow) {
            throw BusinessException.unprocessable(
                    "A categoria nao corresponde ao tipo do lancamento",
                    List.of("A categoria '" + category.name + "' e de " + category.flow
                            + ", mas o lancamento e de " + flow));
        }
        return category;
    }

    private Account resolveAccountByName(String name) {
        if (name == null || name.isBlank()) {
            throw BusinessException.unprocessable(
                    "Informe a conta de origem",
                    List.of("Contas disponiveis: " + availableAccountNames()));
        }
        Account account = Account.findByName(name.trim());
        if (account == null) {
            throw BusinessException.unprocessable(
                    "Conta '" + name + "' nao encontrada",
                    List.of("Contas disponiveis: " + availableAccountNames()));
        }
        return account;
    }

    /** Categoria e opcional no lancamento rapido: da para categorizar depois. */
    private Category resolveCategoryByName(String name, Flow flow) {
        if (name == null || name.isBlank()) {
            return null;
        }
        Category category = Category.findByName(name.trim(), flow);
        if (category == null) {
            throw BusinessException.unprocessable(
                    "Categoria '" + name + "' nao encontrada para " + flow,
                    List.of("Categorias disponiveis: " + availableCategoryNames(flow)));
        }
        return category;
    }

    private String availableAccountNames() {
        return String.join(", ", Account.listActive().stream().map(a -> a.name).toList());
    }

    private String availableCategoryNames(Flow flow) {
        return String.join(", ", Category.listActive(flow).stream().map(c -> c.name).toList());
    }

    // ---------------------------------------------------------------
    // Utilitarios
    // ---------------------------------------------------------------

    /**
     * "Hoje" no fuso configurado, nao no fuso do servidor.
     * <p>
     * O container roda em UTC. Sem isso, uma compra registrada as 22h de
     * Sao Paulo cairia no dia seguinte.
     */
    private LocalDate today() {
        return LocalDate.now(ZoneId.of(timezone));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
