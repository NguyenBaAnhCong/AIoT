package vn.biochar.tv5.dao;

import java.time.LocalDate;
import java.util.*;

public interface IReportDao {
    int markGenerating(UUID reportId);
    int markReady(UUID reportId, String uri);
    int failedReport(UUID reportId);
    Map<String, Object> reportScope(UUID experimentId, UUID treatmentId, UUID seasonId);
    List<Map<String, Object>> technical(UUID experimentId, UUID treatmentId, UUID seasonId, LocalDate from, LocalDate to);
    List<Map<String, Object>> economic(UUID experimentId, UUID treatmentId, UUID seasonId);
    Map<String, Object> insertReport(String type, String title, UUID experimentId, UUID seasonId, LocalDate from, LocalDate to, String parameters, String format, UUID userId);
    Map<String, Object> download(UUID reportId);
    Map<String, Object> reports(List<Object> values, int page, int limit);
    Map<String, Object> reportOptions();
    List<Map<String, Object>> acceptanceKpis();

    Map<String,Object> filteredReports(String type, int page, int limit);
}
