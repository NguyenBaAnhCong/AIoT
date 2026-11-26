package vn.biochar.tv5.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.OffsetDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.common.transaction.ITransactionRunner;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.dao.IAlertDao;
import vn.biochar.tv5.service.IAlertService;
import vn.biochar.tv5.entity.AlertRuleDefinition;

@Service
public class AlertServiceImpl implements IAlertService {
    private final IAlertDao dao;
    private final ITransactionRunner transactions;
    public AlertServiceImpl(IAlertDao dao, ITransactionRunner transactions) { this.dao = dao; this.transactions = transactions; }

    @Override
    public Map<String, Object> list(String status, String severity, String source, int page, int limit) {
        status = blank(status); severity = blank(severity); source = blank(source);
        if (status != null) Values.choice(status, "OPEN", "ACK", "RESOLVED");
        if (severity != null) Values.choice(severity, "LOW", "MEDIUM", "HIGH", "CRITICAL");
        if (source != null) Values.choice(source, "SENSOR", "SQI", "ML", "DEVICE", "DATA_QUALITY");
        return dao.alerts(Arrays.asList(status, severity, source), page, limit);
    }

    private static String blank(String value) { return value == null || value.isBlank() ? null : value; }

    @Override
    public Map<String, Object> change(UUID user, UUID id, JsonNode body) {
        String status = Values.text(body, "status", 16);
        Values.choice(status, "ACK", "RESOLVED");
        String note = "RESOLVED".equals(status) ? Values.text(body, "note", 2000) : null;
        return transactions.tx(user, () -> {
            int count = "ACK".equals(status) ? dao.ack(id, user) : dao.resolve(id, user, note);
            if (count != 1) throw new ApiException(409, "Cảnh báo đã đổi trạng thái hoặc không tồn tại. Hãy tải lại.");
            return Map.of("status", status);
        });
    }

    @Override
    public Map<String, Object> decide(UUID user, UUID id, JsonNode body) {
        String status = Values.text(body, "status", 16);
        Values.choice(status, "ACCEPTED", "REJECTED", "DONE");
        return transactions.tx(user, () -> {
            int count = "DONE".equals(status) ? dao.done(id) : dao.decide(id, status, user);
            if (count != 1) throw new ApiException(409, "Khuyến nghị đã đổi trạng thái hoặc không tồn tại.");
            return Map.of("status", status);
        });
    }

    @Override
    public Map<String, Object> save(UUID user, UUID id, JsonNode body) {
        String code = Values.text(body, "code", 32);
        String name = Values.text(body, "name", 255);
        String source = Values.text(body, "source", 16);
        String condition = Values.text(body, "condition", 16);
        String severity = Values.text(body, "severity", 8);
        if (!code.matches("[A-Za-z0-9_-]+")) throw new ApiException(400, "Mã luật không hợp lệ.");
        Values.choice(source, "SENSOR", "SQI", "ML", "DEVICE");
        Values.choice(severity, "LOW", "MEDIUM", "HIGH", "CRITICAL");
        Set<String> allowed = switch (source) {
            case "SENSOR" -> Set.of("LT", "GT", "OUTSIDE");
            case "SQI" -> Set.of("LT", "GT", "OUTSIDE", "CLASS_IN");
            case "ML" -> Set.of("ANOMALY");
            default -> Set.of("OFFLINE");
        };
        if (!allowed.contains(condition)) throw new ApiException(400, "Điều kiện không phù hợp nguồn dữ liệu.");
        String parameter = null;
        if ("SENSOR".equals(source)) {
            parameter = Values.text(body, "parameter", 32);
            Values.choice(parameter, "PH", "EC", "MOISTURE", "N", "P", "K", "SOIL_TEMP");
        }
        Double low = body.path("low").isNull() || body.path("low").isMissingNode() ? null : Values.number(body, "low");
        Double high = body.path("high").isNull() || body.path("high").isMissingNode() ? null : Values.number(body, "high");
        if (Set.of("LT", "OUTSIDE").contains(condition) && low == null
                || Set.of("GT", "OUTSIDE").contains(condition) && high == null
                || "OUTSIDE".equals(condition) && low >= high
                || "ANOMALY".equals(condition) && high != null && (high < 0 || high > 1)) {
            throw new ApiException(400, "Kiểm tra ngưỡng cảnh báo.");
        }
        List<String> classes = null;
        if ("CLASS_IN".equals(condition)) {
            JsonNode values = body.path("classes");
            if (!values.isArray() || values.isEmpty()) throw new ApiException(400, "Cần chọn lớp sức khỏe đất.");
            List<String> codes = new ArrayList<>();
            for (JsonNode value : values) {
                if (!value.isTextual() || !value.asText().matches("[A-Z_]{1,32}")) throw new ApiException(400, "Lớp không hợp lệ.");
                codes.add(value.asText());
            }
            classes = codes;
        }
        int window = integer(body, "windowMinutes", 1);
        int cooldown = integer(body, "cooldownMinutes", 0);
        String recommendation = null;
        if (!body.path("recommendation").isMissingNode() && !body.path("recommendation").isNull()) {
            if (!body.path("recommendation").isTextual() || body.path("recommendation").asText().length() > 2000) {
                throw new ApiException(400, "Khuyến nghị quá dài hoặc không hợp lệ.");
            }
            recommendation = blank(body.path("recommendation").asText().trim());
        }
        if (body.has("active") && !body.path("active").isBoolean()) throw new ApiException(400, "Trạng thái không hợp lệ.");
        AlertRuleDefinition rule = new AlertRuleDefinition(id, code, name, source, parameter, condition,
            low, high, classes, window, cooldown, severity, recommendation, body.path("active").asBoolean(true));
        return transactions.tx(user, () -> dao.saveRule(user, rule));
    }

    private int integer(JsonNode body, String field, int min) {
        double value = Values.number(body, field);
        if (value != Math.rint(value) || value < min || value > Integer.MAX_VALUE) throw new ApiException(400, "Thời gian không hợp lệ.");
        return (int) value;
    }

    @Override
    public Map<String, Object> evaluate(UUID user, String at) {
        OffsetDateTime time = null;
        if (at != null && !at.isBlank()) {
            try { time = OffsetDateTime.parse(at); }
            catch (RuntimeException error) { throw new ApiException(400, "Thời điểm phải có múi giờ hợp lệ."); }
        }
        OffsetDateTime finalTime = time;
        return transactions.tx(user, () -> {
            dao.lockForUpdate();
            Map<String, Object> result = new LinkedHashMap<>(dao.evaluateRules(finalTime));
            result.put("alerts", dao.newAlerts());
            return result;
        });
    }

    @Override
    public Map<String,Object> summary() { return dao.alertSummary(); }
    @Override
    public List<Map<String,Object>> rules() { return dao.rules(); }
}
