package br.com.ebls.nasfinance.service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import br.com.ebls.nasfinance.api.dto.AccountDto;
import br.com.ebls.nasfinance.api.dto.AccountRequest;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.domain.Account;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

/** Cadastro de contas e calculo de saldo. */
@ApplicationScoped
public class AccountService {

    @Inject
    EntityManager em;

    /**
     * Lista as contas com o saldo atual de cada uma.
     * <p>
     * O saldo sai de <b>uma</b> consulta agregada para todas as contas, e nao de
     * uma consulta por conta dentro do laco. Esse e o classico problema N+1:
     * com 5 contas seriam 6 consultas, e o custo cresceria junto com o cadastro.
     */
    @Transactional
    public List<AccountDto> listAll(boolean includeArchived) {
        List<Account> accounts = includeArchived
                ? Account.<Account>find("ORDER BY archived, name").list()
                : Account.listActive();

        Map<Long, BigDecimal> movement = movementByAccount();

        List<AccountDto> result = new ArrayList<>(accounts.size());
        for (Account account : accounts) {
            BigDecimal balance = account.openingBalance
                    .add(movement.getOrDefault(account.id, BigDecimal.ZERO));
            result.add(AccountDto.from(account, balance));
        }
        return result;
    }

    /** Movimento liquido (receitas menos despesas) de cada conta, desde sempre. */
    private Map<Long, BigDecimal> movementByAccount() {
        List<Object[]> rows = em.createQuery("""
                        SELECT t.account.id, t.flow, SUM(t.amount)
                        FROM Transaction t
                        GROUP BY t.account.id, t.flow
                        """, Object[].class)
                .getResultList();

        Map<Long, BigDecimal> movement = new HashMap<>();
        for (Object[] row : rows) {
            Long accountId = (Long) row[0];
            Flow flow = (Flow) row[1];
            BigDecimal sum = (BigDecimal) row[2];

            BigDecimal signed = flow == Flow.INCOME ? sum : sum.negate();
            movement.merge(accountId, signed, BigDecimal::add);
        }
        return movement;
    }

    @Transactional
    public AccountDto create(AccountRequest request) {
        if (Account.findByName(request.name()) != null) {
            throw BusinessException.conflict("Ja existe uma conta chamada '" + request.name() + "'");
        }

        Account account = new Account();
        account.name = request.name().trim();
        account.kind = request.kind();
        account.color = request.colorOrDefault();
        account.openingBalance = request.openingBalanceOrZero();
        account.persist();

        return AccountDto.from(account, account.openingBalance);
    }

    @Transactional
    public AccountDto update(Long id, AccountRequest request) {
        Account account = Account.<Account>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Conta " + id + " nao encontrada"));

        Account sameName = Account.findByName(request.name());
        if (sameName != null && !sameName.id.equals(id)) {
            throw BusinessException.conflict("Ja existe uma conta chamada '" + request.name() + "'");
        }

        account.name = request.name().trim();
        account.kind = request.kind();
        account.color = request.colorOrDefault();
        account.openingBalance = request.openingBalanceOrZero();

        BigDecimal balance = account.openingBalance
                .add(movementByAccount().getOrDefault(account.id, BigDecimal.ZERO));
        return AccountDto.from(account, balance);
    }

    /**
     * Arquiva a conta em vez de excluir.
     * <p>
     * Excluir apagaria o historico junto (ou seria bloqueado pela FK). Arquivar
     * tira a conta dos formularios e preserva os lancamentos passados, que ainda
     * precisam aparecer nos relatorios dos meses em que ocorreram.
     */
    @Transactional
    public void archive(Long id) {
        Account account = Account.<Account>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Conta " + id + " nao encontrada"));
        account.archived = true;
    }

    @Transactional
    public void unarchive(Long id) {
        Account account = Account.<Account>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Conta " + id + " nao encontrada"));
        account.archived = false;
    }

    /**
     * Exclui definitivamente, mas apenas se nao houver lancamento vinculado.
     * <p>
     * Sem essa checagem, o banco recusaria por causa da FK
     * ({@code ON DELETE RESTRICT}) e o usuario receberia um 500 opaco.
     */
    @Transactional
    public void delete(Long id) {
        Account account = Account.<Account>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Conta " + id + " nao encontrada"));

        long used = Transaction.count("account.id = ?1", id);
        if (used > 0) {
            throw BusinessException.conflict(
                    "A conta '" + account.name + "' tem " + used
                            + " lancamento(s) e nao pode ser excluida. Arquive-a.");
        }
        account.delete();
    }
}
