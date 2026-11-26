package vn.biochar.tv5.rest;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

public interface IAlertRest {
    Object list(String status, String severity,
                String source, int page, int limit);
    Object summary();
    Object change(HttpServletRequest request, String id, JsonNode body);
    Object decide(HttpServletRequest request, String id, JsonNode body);
    Object rules();
    Object newRule(HttpServletRequest request, JsonNode body);
    Object updateRule(HttpServletRequest request, String id, JsonNode body);
    Object evaluate(HttpServletRequest request, JsonNode body);
}
