package vn.biochar.tv5.dao.impl;

import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Repository;
import vn.biochar.tv5.dao.ISqiDao;
import vn.biochar.tv5.dao.jdbc.JdbcDatabase;

@Repository
public class SqiDaoImpl implements ISqiDao {
    private final JdbcDatabase jdbc;
    public SqiDaoImpl(JdbcDatabase jdbc) { this.jdbc = jdbc; }

    @Override
    public Map<String, Object> createDefinition(String code, String name, double coverage) {
        return jdbc.one(Sql.CREATE_DEFINITION, code, name, coverage);
    }

    @Override
    public Map<String, Object> createIndicator(UUID definitionId, String parameter, String source, String function, double lowerLimit, double upperLimit, Double optimumLow, Double optimumHigh) {
        return jdbc.one(Sql.CREATE_INDICATOR, definitionId, parameter, source, function, lowerLimit, upperLimit, optimumLow, optimumHigh);
    }

    @Override
    public int insertWeight(UUID definitionId, UUID indicatorId, double weight) {
        return jdbc.update("INSERT INTO sqi.sqi_weights(definition_id,indicator_id,weight) VALUES($1,$2,$3)", definitionId, indicatorId, weight);
    }

    @Override
    public int createClass(UUID definitionId, String classCode, double minimum, double maximum) {
        return jdbc.update(Sql.CREATE_CLASS, definitionId, classCode, minimum, maximum);
    }

    @Override
    public Map<String, Object> lockForUpdate() {
        return jdbc.one("SELECT pg_advisory_xact_lock(42005,4)");
    }

    @Override
    public List<Map<String, Object>> canActivate(UUID definitionId) {
        return jdbc.rows(Sql.CAN_ACTIVATE, definitionId);
    }

    @Override
    public int retireActive() {
        return jdbc.update("UPDATE sqi.sqi_definitions SET status='RETIRED' WHERE status='ACTIVE'");
    }

    @Override
    public int activate(UUID definitionId, UUID userId) {
        return jdbc.update(Sql.ACTIVATE, definitionId, userId);
    }

    @Override
    public Map<String, Object> calculationVersion(UUID datasetId, UUID definitionId) {
        return jdbc.one(Sql.CALCULATION_VERSION, datasetId, definitionId);
    }

    @Override
    public Map<String, Object> calculateDaily(UUID definitionId, UUID datasetId) {
        return jdbc.one("SELECT sqi.calculate_daily($1,$2) AS scores", definitionId, datasetId);
    }

    @Override
    public Map<String, Object> assignLabels(UUID definitionId, UUID datasetId) {
        return jdbc.one("SELECT sqi.assign_labels($1,$2) AS labels", definitionId, datasetId);
    }

    @Override
    public List<Map<String, Object>> plots() {
        return jdbc.rows(Sql.PLOTS);
    }

    @Override
    public Map<String, Object> configuration() {
        return jdbc.one(Sql.CONFIGURATION);
    }

    @Override
    public List<Map<String, Object>> comparison(UUID definitionId) {
        return jdbc.rows(Sql.COMPARISON, definitionId);
    }

    @Override
    public Map<String, Object> scoreDetail(UUID scoreId) {
        return jdbc.one(Sql.SCORE_DETAIL, scoreId);
    }

    @Override
    public List<Map<String, Object>> scores(UUID plotId, UUID definitionId, LocalDate from, LocalDate to) {
        return jdbc.rows(Sql.SCORES, plotId, definitionId, from, to);
    }
}
