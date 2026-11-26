package vn.biochar.tv5.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

public interface IAlertService {
    Map<String, Object> list(String status, String severity, String source, int page, int limit);
    Map<String, Object> change(UUID user, UUID id, JsonNode body);
    Map<String, Object> decide(UUID user, UUID id, JsonNode body);
    Map<String, Object> save(UUID user, UUID id, JsonNode body);
    Map<String, Object> evaluate(UUID user, String at);
    Map<String,Object> summary();
    List<Map<String,Object>> rules();
}
