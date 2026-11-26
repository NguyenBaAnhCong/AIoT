package vn.biochar.tv5.dao;

import java.time.OffsetDateTime;
import java.util.*;
import vn.biochar.tv5.entity.AlertRuleDefinition;

public interface IAlertDao {
    Map<String, Object> alerts(List<Object> values, int page, int limit);
    int ack(UUID alertId, UUID userId);
    int resolve(UUID alertId, UUID userId, String note);
    int done(UUID recommendationId);
    int decide(UUID recommendationId, String status, UUID userId);
    Map<String, Object> lockForUpdate();
    Map<String, Object> evaluateRules(OffsetDateTime at);
    List<Map<String, Object>> newAlerts();
    Map<String, Object> alertSummary();
    List<Map<String, Object>> rules();

    Map<String,Object> saveRule(UUID userId, AlertRuleDefinition rule);
}
