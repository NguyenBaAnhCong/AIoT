package vn.biochar.tv5.rest;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.ResponseEntity;

public interface IReportRest {
    Object reportList(int page, int limit,
                      String type);
    Object options();
    Object kpis();
    Object report(HttpServletRequest request, JsonNode body);
    ResponseEntity<byte[]> download(String id);
}
