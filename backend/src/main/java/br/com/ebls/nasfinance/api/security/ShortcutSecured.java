package br.com.ebls.nasfinance.api.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.ws.rs.NameBinding;

/**
 * Marca um endpoint como protegido pelo token estatico do Atalho do iPhone.
 * <p>
 * {@link NameBinding} e o mecanismo do JAX-RS para aplicar um filtro apenas
 * aos metodos anotados, em vez de a toda a API. Assim o
 * {@link ShortcutTokenFilter} nao interfere nos endpoints da interface web.
 */
@NameBinding
@Retention(RetentionPolicy.RUNTIME)
@Target({ ElementType.TYPE, ElementType.METHOD })
public @interface ShortcutSecured {
}
