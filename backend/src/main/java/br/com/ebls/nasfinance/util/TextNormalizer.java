package br.com.ebls.nasfinance.util;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * Normaliza texto para comparacao tolerante a acento e caixa.
 * <p>
 * Existe por causa de uma inconsistencia real: as migrations do banco
 * semeiam nomes sem diacriticos ("Vale Refeicao"), mas tanto a documentacao
 * do Atalho quanto o portugues natural que qualquer pessoa digita usam
 * acento ("Vale Refeição"). Em vez de forcar o usuario a digitar sem acento
 * (fragil — quebra de novo a cada categoria nova cadastrada com acento pela
 * interface web), a comparacao de nomes fica tolerante a isso.
 */
public final class TextNormalizer {

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

    private TextNormalizer() {
    }

    /**
     * Remove acentos e diferenca de caixa. "Vale Refeição" e "vale refeicao"
     * normalizam para o mesmo valor.
     */
    public static String normalize(String value) {
        if (value == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(value.trim(), Normalizer.Form.NFD);
        return DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase();
    }
}
