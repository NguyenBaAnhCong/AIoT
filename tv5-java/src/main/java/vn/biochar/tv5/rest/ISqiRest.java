package vn.biochar.tv5.rest;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;

public interface ISqiRest {
    Object plots();
    Object configuration();
    Object comparison(String definitionId);
    Object scores(String plotId, String definitionId, String from, String to);
    Object detail(String id);
    Object create(HttpServletRequest request, JsonNode body);
    Object activate(HttpServletRequest request, String id);
    Object calculate(HttpServletRequest request, JsonNode body);
}
