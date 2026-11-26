package vn.biochar.tv5.dao.impl;

import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Repository;
import vn.biochar.tv5.dao.IAlertDao;
import vn.biochar.tv5.dao.jdbc.JdbcDatabase;
import vn.biochar.tv5.entity.AlertRuleDefinition;

@Repository
public class AlertDaoImpl implements IAlertDao {
    private final JdbcDatabase jdbc;
    public AlertDaoImpl(JdbcDatabase jdbc) { this.jdbc = jdbc; }

    @Override
    public Map<String, Object> alerts(List<Object> values, int page, int limit) {
        return jdbc.page(Sql.ALERTS, values, page, limit);
    }

    @Override
    public int ack(UUID alertId, UUID userId) {
        return jdbc.update(Sql.ACK, alertId, userId);
    }

    @Override
    public int resolve(UUID alertId, UUID userId, String note) {
        return jdbc.update(Sql.RESOLVE, alertId, userId, note);
    }

    @Override
    public int done(UUID recommendationId) {
        return jdbc.update(Sql.DONE, recommendationId);
    }

    @Override
    public int decide(UUID recommendationId, String status, UUID userId) {
        return jdbc.update(Sql.DECIDE, recommendationId, status, userId);
    }

    @Override
    public Map<String, Object> lockForUpdate() {
        return jdbc.one("SELECT pg_advisory_xact_lock(42005,12)");
    }

    @Override
    public Map<String, Object> evaluateRules(OffsetDateTime at) {
        return jdbc.one("SELECT alert.evaluate_rules(COALESCE($1::timestamptz,now())) AS created", at);
    }

    @Override
    public List<Map<String, Object>> newAlerts() {
        return jdbc.rows(Sql.NEW_ALERTS);
    }

    @Override
    public Map<String, Object> alertSummary() {
        return jdbc.one(Sql.ALERT_SUMMARY);
    }

    @Override
    public List<Map<String, Object>> rules() {
        return jdbc.rows("SELECT * FROM alert.alert_rules ORDER BY rule_code");
    }

    @Override
    public Map<String,Object> saveRule(UUID userId, AlertRuleDefinition rule) {
        String classes = rule.classes() == null ? null : "{" + String.join(",", rule.classes()) + "}";
        return jdbc.one(rule.id() == null ? Sql.INSERT_RULE : Sql.UPDATE_RULE,
            rule.code(), rule.name(), rule.source(), rule.parameter(), rule.condition(), rule.low(), rule.high(),
            classes, rule.windowMinutes(), rule.cooldownMinutes(), rule.severity(), rule.recommendation(),
            rule.active(), rule.id() == null ? userId : rule.id());
    }

}
