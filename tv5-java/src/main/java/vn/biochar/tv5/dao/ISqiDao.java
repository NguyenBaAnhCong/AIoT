package vn.biochar.tv5.dao;

import java.time.LocalDate;
import java.util.*;

public interface ISqiDao {
    Map<String, Object> createDefinition(String code, String name, double coverage);
    Map<String, Object> createIndicator(UUID definitionId, String parameter, String source, String function, double lowerLimit, double upperLimit, Double optimumLow, Double optimumHigh);
    int insertWeight(UUID definitionId, UUID indicatorId, double weight);
    int createClass(UUID definitionId, String classCode, double minimum, double maximum);
    Map<String, Object> lockForUpdate();
    List<Map<String, Object>> canActivate(UUID definitionId);
    int retireActive();
    int activate(UUID definitionId, UUID userId);
    Map<String, Object> calculationVersion(UUID datasetId, UUID definitionId);
    Map<String, Object> calculateDaily(UUID definitionId, UUID datasetId);
    Map<String, Object> assignLabels(UUID definitionId, UUID datasetId);
    List<Map<String, Object>> plots();
    Map<String, Object> configuration();
    List<Map<String, Object>> comparison(UUID definitionId);
    Map<String, Object> scoreDetail(UUID scoreId);
    List<Map<String, Object>> scores(UUID plotId, UUID definitionId, LocalDate from, LocalDate to);
}
