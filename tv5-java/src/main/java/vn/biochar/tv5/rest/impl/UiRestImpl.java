package vn.biochar.tv5.rest.impl;

import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class UiRestImpl {
    @GetMapping({"/tv5/sqi", "/tv5/alerts", "/tv5/reports"})
    ResponseEntity<String> page() {
        return ResponseEntity.ok().header("Content-Type", "text/html; charset=utf-8")
            .header("Cache-Control", "no-store")
            .body("""
                <!doctype html><html lang="vi"><meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>TV5 · Edge-AIoT</title>
                <body><noscript>Cần bật JavaScript để sử dụng TV5.</noscript>
                <script type="module" src="/tv5/assets/js/core/app.js"></script></body></html>
                """);
    }
}
