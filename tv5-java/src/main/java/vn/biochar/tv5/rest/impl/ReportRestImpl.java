package vn.biochar.tv5.rest.impl;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.dto.response.ReportDownload;
import vn.biochar.tv5.rest.IReportRest;
import vn.biochar.tv5.service.IReportService;

@RestController
@RequestMapping("/api/v1/tv5")
public class ReportRestImpl extends RestSupport implements IReportRest {
    private final IReportService reports;
    public ReportRestImpl(IReportService reports) { this.reports = reports; }
    @GetMapping("/reports")
    public Object reportList(@RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int limit,
                      @RequestParam(required=false) String type) {
        return reports.list(page, limit, type);
    }
    @GetMapping("/reports/options")
    public Object options() { return data(reports.options()); }
    @GetMapping("/reports/kpis")
    public Object kpis() {
        return data(reports.kpis());
    }
    @PostMapping("/reports")
    public Object report(HttpServletRequest request, @RequestBody JsonNode body) { return data(reports.create(user(request), body)); }
    @GetMapping("/reports/{id}/file")
    public ResponseEntity<byte[]> download(@PathVariable String id) {
        ReportDownload file = reports.download(Values.id(id));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.type()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename()).build().toString())
                .body(file.bytes());
    }
}
