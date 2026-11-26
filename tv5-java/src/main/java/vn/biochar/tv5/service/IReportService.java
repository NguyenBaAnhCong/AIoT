package vn.biochar.tv5.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import vn.biochar.tv5.dto.response.ReportDownload;

public interface IReportService {
    Map<String, Object> create(UUID user, JsonNode body);
    ReportDownload download(UUID id);
    Map<String,Object> list(int page, int limit, String type);
    Map<String,Object> options();
    List<Map<String,Object>> kpis();
}
