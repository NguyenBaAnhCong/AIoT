package vn.biochar.tv5.rest.impl;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.dto.request.SqiScoreQuery;
import vn.biochar.tv5.dto.request.SqiCalculationRequest;
import vn.biochar.tv5.rest.ISqiRest;
import vn.biochar.tv5.service.ISqiService;

@RestController
@RequestMapping("/api/v1/tv5")
public class SqiRestImpl extends RestSupport implements ISqiRest {
    private final ISqiService sqi;
    public SqiRestImpl(ISqiService sqi) { this.sqi = sqi; }
    @GetMapping("/sqi/plots")
    public Object plots() { return data(sqi.plots()); }
    @GetMapping("/sqi/configuration")
    public Object configuration() { return data(sqi.configuration()); }
    @GetMapping("/sqi/comparison")
    public Object comparison(@RequestParam String definitionId) { return data(sqi.comparison(Values.id(definitionId))); }
    @GetMapping("/sqi/scores")
    public Object scores(@RequestParam String plotId, @RequestParam String definitionId, @RequestParam String from, @RequestParam String to) {
        return data(sqi.scores(SqiScoreQuery.parse(plotId, definitionId, from, to)));
    }
    @GetMapping("/sqi/scores/{id}")
    public Object detail(@PathVariable String id) { return data(sqi.detail(Values.id(id))); }
    @PostMapping("/sqi/definitions")
    public Object create(HttpServletRequest request, @RequestBody JsonNode body) { return data(sqi.create(user(request), body)); }
    @PostMapping("/sqi/definitions/{id}/activate")
    public Object activate(HttpServletRequest request, @PathVariable String id) { return data(sqi.activate(user(request), Values.id(id))); }
    @PostMapping("/sqi/calculate")
    public Object calculate(HttpServletRequest request, @RequestBody JsonNode body) {
        SqiCalculationRequest command = SqiCalculationRequest.parse(body);
        if (command.assignLabels() && !((List<?>) request.getAttribute("permissions")).contains("dataset.write")) {
            throw new ApiException(403, "Thiếu quyền dataset.write.");
        }
        return data(sqi.calculate(user(request), command.definitionId(), command.datasetVersionId(), command.assignLabels()));
    }
}
