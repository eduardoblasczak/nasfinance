package br.com.ebls.nasfinance.pluggy;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;

import br.com.ebls.nasfinance.domain.Flow;

/**
 * Traduz uma transacao da Pluggy para os termos do nasFinance.
 * <p>
 * Separado do servico de sincronizacao de proposito: aqui nao ha banco, nem
 * CDI, nem rede — so regras. E sao justamente estas regras que erram em
 * silencio se estiverem invertidas, porque o resultado continua parecendo um
 * lancamento plausivel na tela. Isoladas assim, podem ser testadas com os
 * valores reais observados na conta.
 */
public final class PluggyTranslator {

    private PluggyTranslator() {
    }

    /**
     * Direcao do dinheiro.
     * <p>
     * <b>Vem de {@code type}, nunca do sinal de {@code amount}.</b> O sinal
     * significa coisas opostas conforme o tipo de conta — medido na conta real:
     *
     * <pre>
     * Corrente:    -5,00   DEBIT    PIX ENVIADO         negativo = saida
     *              33,00   CREDIT   PIX recebido        positivo = entrada
     * Cartao:      51,85   DEBIT    Compra              positivo = despesa
     *            -169,89   CREDIT   PAGAMENTO FATURA    negativo = pagamento
     * </pre>
     *
     * Ler o sinal arquivaria metade dos lancamentos invertidos, e a tela nao
     * teria como denunciar: R$ 51,85 de receita parece tao plausivel quanto de
     * despesa.
     */
    public static Flow flowOf(PluggyModels.Transaction tx) {
        return tx.isDebit() ? Flow.EXPENSE : Flow.INCOME;
    }

    /** Valor sempre positivo: o sentido fica em {@link Flow}, como no resto do modelo. */
    public static BigDecimal amountOf(PluggyModels.Transaction tx) {
        return tx.amount() == null ? BigDecimal.ZERO : tx.amount().abs();
    }

    /**
     * Data do lancamento no fuso local.
     * <p>
     * A Pluggy devolve UTC. Uma compra das 22h em Brasilia chega com a data do
     * dia seguinte; sem converter, ela cai no dia errado — e, na virada do mes,
     * no mes errado, deslocando o fechamento inteiro.
     */
    public static LocalDate occurredOn(PluggyModels.Transaction tx, ZoneId zone) {
        return tx.date().atZoneSameInstant(zone).toLocalDate();
    }

    /** Abaixo do minimo configurado (o cofrinho de centavos do PicPay). */
    public static boolean isBelowMinimum(BigDecimal amount, BigDecimal minimum) {
        return amount.compareTo(minimum) < 0;
    }

    /**
     * Chave natural, espelhando a que a Pluggy usa internamente.
     * <p>
     * Sem conector Open Finance nao existe {@code providerId}, e o {@code id}
     * da Pluggy muda quando a fatura fecha. A documentacao dela descreve o
     * criterio usado nesse caso: descricao, valor, data, e a posicao entre
     * transacoes identicas do mesmo dia. Herdar essa chave faz a nossa ser
     * estavel exatamente quando a Pluggy considera que e a mesma transacao.
     * <p>
     * <b>Usa a data como a Pluggy devolve (UTC)</b>, nao a convertida. A
     * convertida vai para o que o usuario ve; a chave precisa ser identica a
     * referencia da Pluggy, senao uma mudanca de fuso ou de horario de verao a
     * reescreveria e o historico inteiro reentraria como novo.
     * <p>
     * O {@code order} nao e opcional: na conta real, {@code (data, valor,
     * descricao)} se repetiu em 4 grupos — dois "Troco Guardado" de R$ 0,01 no
     * mesmo dia sao duas transacoes legitimas.
     */
    public static String naturalKey(String pluggyAccountId, PluggyModels.Transaction tx) {
        String canonical = canonicalForm(pluggyAccountId, tx);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponivel nesta JVM", e);
        }
    }

    /** A string que vira hash. Exposta para log de diagnostico e para teste. */
    public static String canonicalForm(String pluggyAccountId, PluggyModels.Transaction tx) {
        return String.join("|",
                pluggyAccountId,
                tx.date().toLocalDate().toString(),
                tx.amount() == null ? "0" : tx.amount().stripTrailingZeros().toPlainString(),
                tx.description() == null ? "" : tx.description(),
                tx.order() == null ? "0" : tx.order().toString());
    }

    /**
     * Rastro de auditoria para {@code notes}.
     * <p>
     * Guarda o id da Pluggy mesmo ele sendo instavel: nao serve como chave, mas
     * serve para investigar um lancamento especifico junto ao suporte deles.
     * Guarda tambem a categoria sugerida, que e o que a fila de revisao oferece
     * — a classificacao da Pluggy nunca e aplicada direto, porque o vocabulario
     * dela nao e o seu.
     */
    public static String auditTrail(PluggyModels.Transaction tx) {
        StringBuilder notes = new StringBuilder("Pluggy id=").append(tx.id());
        if (tx.category() != null) {
            notes.append(" | categoria sugerida: ").append(tx.category());
        }
        if (tx.operationType() != null) {
            notes.append(" | operacao: ").append(tx.operationType());
        }
        if (tx.status() != null) {
            notes.append(" | ").append(tx.status());
        }
        if (tx.creditCardMetadata() != null
                && tx.creditCardMetadata().installmentNumber() != null) {
            notes.append(" | parcela ")
                    .append(tx.creditCardMetadata().installmentNumber())
                    .append('/')
                    .append(tx.creditCardMetadata().totalInstallments());
        }
        return notes.toString();
    }
}
