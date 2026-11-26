package vn.biochar.tv5.rest.impl;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.rest.IAlertRest;
import vn.biochar.tv5.service.IAlertService;

@RestController
@RequestMapping("/api/v1/tv5")
public class AlertRestImpl extends RestSupport implements IAlertRest {
    private final IAlertService alerts;
    public AlertRestImpl(IAlertService alerts) { this.alerts = alerts; }
    @GetMapping("/alerts")
    public Object list(@RequestParam(required=false) String status, @RequestParam(required=false) String severity,
                @RequestParam(required=false) String source, @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int limit) {
        return alerts.list(status, severity, source, page, limit);
    }
    @GetMapping("/alerts/summary")
    public Object summary() { return data(alerts.summary()); }
    @PatchMapping("/alerts/{id}")
    public Object change(HttpServletRequest request, @PathVariable String id, @RequestBody JsonNode body) { return data(alerts.change(user(request), Values.id(id), body)); }
    @PatchMapping("/recommendations/{id}")
    public Object decide(HttpServletRequest request, @PathVariable String id, @RequestBody JsonNode body) { return data(alerts.decide(user(request), Values.id(id), body)); }
    @GetMapping("/alert-rules")
    public Object rules() { return data(alerts.rules()); }
    @PostMapping("/alert-rules")
    public Object newRule(HttpServletRequest request, @RequestBody JsonNode body) { return data(alerts.save(user(request), null, body)); }
    @PutMapping("/alert-rules/{id}")
    public Object updateRule(HttpServletRequest request, @PathVariable String id, @RequestBody JsonNode body) { return data(alerts.save(user(request), Values.id(id), body)); }
    @PostMapping("/alerts/evaluate")
    public Object evaluate(HttpServletRequest request, @RequestBody JsonNode body) { return data(alerts.evaluate(user(request), body.path("at").isTextual() ? body.path("at").asText() : null)); }
}
