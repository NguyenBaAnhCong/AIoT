package vn.biochar.tv5.entity;

import java.util.List;
import java.util.UUID;

/** Validated domain data; persistence details and PostgreSQL array syntax stay in the DAO. */
public record AlertRuleDefinition(UUID id, String code, String name, String source,
        String parameter, String condition, Double low, Double high, List<String> classes,
        int windowMinutes, int cooldownMinutes, String severity, String recommendation, boolean active) {
    public AlertRuleDefinition {
        classes = classes == null ? null : List.copyOf(classes);
    }
}
