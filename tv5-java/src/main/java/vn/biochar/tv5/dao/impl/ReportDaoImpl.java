package vn.biochar.tv5.dao.impl;

import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Repository;
import vn.biochar.tv5.dao.IReportDao;
import vn.biochar.tv5.dao.jdbc.JdbcDatabase;

@Repository
public class ReportDaoImpl implements IReportDao {
    private final JdbcDatabase jdbc;
    public ReportDaoImpl(JdbcDatabase jdbc) { this.jdbc = jdbc; }

    @Override
    public int markGenerating(UUID reportId) {
        return jdbc.update("UPDATE reporting.reports SET status='GENERATING' WHERE report_id=$1", reportId);
    }

    @Override
    public int markReady(UUID reportId, String uri) {
        return jdbc.update("""
                UPDATE reporting.reports SET status='READY',file_uri=$2,generated_at=now() WHERE report_id=$1
                """, reportId, uri);
    }

    @Override
    public int failedReport(UUID reportId) {
        return jdbc.update(Sql.FAILED_REPORT, reportId);
    }

    @Override
    public Map<String, Object> reportScope(UUID experimentId, UUID treatmentId, UUID seasonId) {
        return jdbc.one(Sql.REPORT_SCOPE, experimentId, treatmentId, seasonId);
    }

    @Override
    public List<Map<String, Object>> technical(UUID experimentId, UUID treatmentId, UUID seasonId, LocalDate from, LocalDate to) {
        return jdbc.rows(Sql.TECHNICAL, experimentId, treatmentId, seasonId, from, to);
    }

    @Override
    public List<Map<String, Object>> economic(UUID experimentId, UUID treatmentId, UUID seasonId) {
        return jdbc.rows(Sql.ECONOMIC, experimentId, treatmentId, seasonId);
    }

    @Override
    public Map<String, Object> insertReport(String type, String title, UUID experimentId, UUID seasonId, LocalDate from, LocalDate to, String parameters, String format, UUID userId) {
        return jdbc.one(Sql.INSERT_REPORT.replace("$7", "$7::jsonb"), type, title, experimentId, seasonId, from, to, parameters, format, userId);
    }

    @Override
    public Map<String, Object> download(UUID reportId) {
        return jdbc.one(Sql.DOWNLOAD, reportId);
    }

    @Override
    public Map<String, Object> reports(List<Object> values, int page, int limit) {
        return jdbc.page(Sql.REPORTS, values, page, limit);
    }

    @Override
    public Map<String, Object> reportOptions() {
        return jdbc.one(Sql.REPORT_OPTIONS);
    }

    @Override
    public List<Map<String, Object>> acceptanceKpis() {
        return jdbc.rows("""
            SELECT s.*, latest.measured_value FROM reporting.v_acceptance_summary s
            JOIN reporting.kpis k USING(kpi_code)
            LEFT JOIN LATERAL (SELECT m.measured_value FROM reporting.kpi_measurements m
                WHERE m.kpi_id=k.kpi_id AND m.scope_type='SYSTEM'
                ORDER BY m.measured_at DESC,m.measurement_id DESC LIMIT 1) latest ON true
            ORDER BY k.domain,s.kpi_code
            """);
    }

    @Override
    public Map<String,Object> filteredReports(String type, int page, int limit) {
        return jdbc.page(Sql.REPORTS.replace("ORDER BY", "WHERE report_type=$1 ORDER BY"), List.of(type), page, limit);
    }

}
