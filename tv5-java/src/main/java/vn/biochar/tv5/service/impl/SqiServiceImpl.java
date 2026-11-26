package vn.biochar.tv5.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.stereotype.Service;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.common.transaction.ITransactionRunner;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.dao.ISqiDao;
import vn.biochar.tv5.service.ISqiService;

@Service
public class SqiServiceImpl implements ISqiService {
    private final ISqiDao dao;
    private final ITransactionRunner transactions;
    public SqiServiceImpl(ISqiDao dao, ITransactionRunner transactions) { this.dao = dao; this.transactions = transactions; }

    @Override
    public Map<String, Object> create(UUID user, JsonNode body) {
        String code = Values.text(body, "code", 32);
        if (!code.matches("[A-Za-z0-9._-]+")) throw new ApiException(400, "Mã phiên bản không hợp lệ.");
        String name = Values.text(body, "name", 255);
        double coverage = Values.number(body, "coverage");
        JsonNode indicators = body.path("indicators");
        JsonNode classes = body.path("classes");
        if (coverage < 0 || coverage > 100 || !indicators.isArray() || indicators.isEmpty()
                || indicators.size() > 50 || !classes.isArray() || classes.isEmpty() || classes.size() > 20) {
            throw new ApiException(400, "Kiểm tra độ phủ, chỉ tiêu và các mức phân loại.");
        }
        List<JsonNode> ordered = new ArrayList<>();
        classes.forEach(ordered::add);
        ordered.sort(Comparator.comparingDouble(item -> Values.number(item, "min_value")));
        double previous = 0;
        Set<String> classCodes = new HashSet<>();
        for (JsonNode item : ordered) {
            double low = Values.number(item, "min_value");
            double high = Values.number(item, "max_value");
            if (low != previous || high <= low || high > 1.0001 || !classCodes.add(Values.text(item, "class_code", 32))) {
                throw new ApiException(400, "Các mức phân loại phải khác nhau và nối tiếp từ 0 đến 1.0001.");
            }
            previous = high;
        }
        if (previous != 1.0001) throw new ApiException(400, "Mức cuối phải có cận trên 1.0001.");
        return transactions.tx(user, () -> {
            UUID definition = Values.id(dao.createDefinition(code, name, coverage).get("definition_id").toString());
            for (JsonNode item : indicators) {
                String parameter = Values.text(item, "parameter_code", 32);
                String source = Values.text(item, "source", 8);
                String function = Values.text(item, "scoring_function", 16);
                Values.choice(source, "SENSOR", "LAB");
                Values.choice(function, "MORE_IS_BETTER", "LESS_IS_BETTER", "OPTIMUM");
                double low = Values.number(item, "lower_limit");
                double high = Values.number(item, "upper_limit");
                double weight = Values.number(item, "weight");
                Double optimumLow = null;
                Double optimumHigh = null;
                if ("OPTIMUM".equals(function)) {
                    optimumLow = Values.number(item, "optimum_low");
                    optimumHigh = Values.number(item, "optimum_high");
                    if (optimumLow < low || optimumHigh > high || optimumLow > optimumHigh) {
                        throw new ApiException(400, "Khoảng tối ưu phải nằm trong giới hạn chỉ tiêu.");
                    }
                }
                if (low >= high || weight < .0001 || weight > 1) throw new ApiException(400, "Giới hạn hoặc trọng số không hợp lệ.");
                UUID indicator = Values.id(dao.createIndicator(definition, parameter, source, function, low, high, optimumLow, optimumHigh).get("indicator_id").toString());
                dao.insertWeight(definition, indicator, weight);
            }
            for (JsonNode item : ordered) {
                int count = dao.createClass(definition, item.path("class_code").asText(), Values.number(item, "min_value"), Values.number(item, "max_value"));
                if (count != 1) throw new ApiException(400, "Lớp sức khỏe đất chưa có trong danh mục.");
            }
            return Map.of("definition_id", definition);
        });
    }

    @Override
    public Map<String, Object> activate(UUID user, UUID definition) {
        return transactions.tx(user, () -> {
            dao.lockForUpdate();
            if (dao.canActivate(definition).isEmpty()) throw new ApiException(409, "Chỉ kích hoạt bản nháp đã có điểm SQI.");
            dao.retireActive();
            dao.activate(definition, user);
            return Map.of("status", "ACTIVE");
        });
    }

    @Override
    public Map<String, Object> calculate(UUID user, UUID definition, UUID dataset, boolean label) {
        return transactions.tx(user, () -> {
            dao.lockForUpdate();
            Map<String, Object> version = dao.calculationVersion(dataset, definition);
            if (!Set.of("BUILT", "FROZEN").contains(version.get("status")) || "RETIRED".equals(version.get("definition_status"))) {
                throw new ApiException(409, "Cần dataset đã build và cấu hình SQI đang dùng hoặc nháp.");
            }
            if (label && (!"BUILT".equals(version.get("status")) || !"ACTIVE".equals(version.get("definition_status")))) {
                throw new ApiException(409, "Gán nhãn cần dataset BUILT và cấu hình ACTIVE.");
            }
            Map<String, Object> result = new LinkedHashMap<>(dao.calculateDaily(definition, dataset));
            if (label) result.putAll(dao.assignLabels(definition, dataset));
            return result;
        });
    }

    @Override
    public List<Map<String,Object>> plots() { return dao.plots(); }
    @Override
    public Map<String,Object> configuration() { return dao.configuration(); }
    @Override
    public List<Map<String,Object>> comparison(UUID id) { return dao.comparison(id); }
    @Override
    public Map<String,Object> detail(UUID id) { return dao.scoreDetail(id); }
    @Override
    public List<Map<String,Object>> scores(vn.biochar.tv5.dto.request.SqiScoreQuery query) {
        return dao.scores(query.plotId(), query.definitionId(), query.from(), query.to());
    }
}
