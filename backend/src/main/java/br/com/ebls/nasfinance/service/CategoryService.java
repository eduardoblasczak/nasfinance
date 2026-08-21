package br.com.ebls.nasfinance.service;

import java.util.List;

import br.com.ebls.nasfinance.api.dto.CategoryDto;
import br.com.ebls.nasfinance.api.dto.CategoryRequest;
import br.com.ebls.nasfinance.api.error.BusinessException;
import br.com.ebls.nasfinance.domain.Category;
import br.com.ebls.nasfinance.domain.Flow;
import br.com.ebls.nasfinance.domain.Transaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

/** Cadastro de categorias. */
@ApplicationScoped
public class CategoryService {

    @Transactional
    public List<CategoryDto> list(Flow flow, boolean includeArchived) {
        List<Category> categories;
        if (includeArchived) {
            categories = flow == null
                    ? Category.<Category>find("ORDER BY archived, flow, name").list()
                    : Category.<Category>find("flow = ?1 ORDER BY archived, name", flow).list();
        } else {
            categories = Category.listActive(flow);
        }
        return categories.stream().map(CategoryDto::from).toList();
    }

    @Transactional
    public CategoryDto create(CategoryRequest request) {
        if (Category.findByName(request.name(), request.flow()) != null) {
            throw BusinessException.conflict(
                    "Ja existe a categoria '" + request.name() + "' para " + request.flow());
        }

        Category category = new Category();
        category.name = request.name().trim();
        category.flow = request.flow();
        category.color = request.colorOrDefault();
        category.icon = request.icon();
        category.monthlyBudget = request.monthlyBudget();
        category.persist();

        return CategoryDto.from(category);
    }

    @Transactional
    public CategoryDto update(Long id, CategoryRequest request) {
        Category category = Category.<Category>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Categoria " + id + " nao encontrada"));

        Category sameName = Category.findByName(request.name(), request.flow());
        if (sameName != null && !sameName.id.equals(id)) {
            throw BusinessException.conflict(
                    "Ja existe a categoria '" + request.name() + "' para " + request.flow());
        }

        // A direcao (flow) so pode mudar enquanto a categoria nao tiver uso:
        // trocar de EXPENSE para INCOME com lancamentos vinculados inverteria
        // o sinal de transacoes historicas e corromperia todos os relatorios.
        if (category.flow != request.flow()) {
            long used = Transaction.count("category.id = ?1", id);
            if (used > 0) {
                throw BusinessException.conflict(
                        "A categoria '" + category.name + "' ja tem " + used
                                + " lancamento(s); nao e possivel trocar entre despesa e receita.");
            }
            category.flow = request.flow();
        }

        category.name = request.name().trim();
        category.color = request.colorOrDefault();
        category.icon = request.icon();
        category.monthlyBudget = request.monthlyBudget();

        return CategoryDto.from(category);
    }

    @Transactional
    public void archive(Long id) {
        Category category = Category.<Category>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Categoria " + id + " nao encontrada"));
        category.archived = true;
    }

    @Transactional
    public void unarchive(Long id) {
        Category category = Category.<Category>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Categoria " + id + " nao encontrada"));
        category.archived = false;
    }

    /**
     * Exclui a categoria. Lancamentos vinculados <b>nao</b> sao apagados: a FK
     * usa {@code ON DELETE SET NULL}, entao eles passam a contar como
     * "Sem categoria" e continuam somando no total de despesas.
     */
    @Transactional
    public void delete(Long id) {
        Category category = Category.<Category>findByIdOptional(id)
                .orElseThrow(() -> BusinessException.notFound("Categoria " + id + " nao encontrada"));
        category.delete();
    }
}
