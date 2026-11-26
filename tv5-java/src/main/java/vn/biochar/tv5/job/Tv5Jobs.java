package vn.biochar.tv5.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.config.Settings;
import vn.biochar.tv5.service.IAlertService;
import vn.biochar.tv5.service.ISqiService;
import vn.biochar.tv5.service.ISystemService;

@Component
public class Tv5Jobs {
    private final Settings settings;
    private final ISystemService system;
    private final ISqiService sqi;
    private final IAlertService alerts;
    private final ObjectMapper json;
    private final Logger log = LoggerFactory.getLogger(Tv5Jobs.class);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private long nextSqi;
    private long nextAlert;
    private final long alertDelay;
    private final long sqiDelay;

    public Tv5Jobs(Settings settings, ISystemService system, ISqiService sqi, IAlertService alerts, ObjectMapper json) {
        this.settings = settings; this.system = system; this.sqi = sqi; this.alerts = alerts; this.json = json;
        alertDelay = minutes("TV5_ALERT_MINUTES", "15");
        sqiDelay = minutes("TV5_SQI_MINUTES", "1440");
        if (settings.get("TV5_TELEGRAM_TOKEN", "").isBlank() != settings.get("TV5_TELEGRAM_CHAT", "").isBlank()) {
            throw new IllegalStateException("Telegram cần cả token và chat ID.");
        }
    }

    private long minutes(String name, String fallback) {
        try {
            long value = Long.parseLong(settings.get(name, fallback));
            if (value < 1 || value > 10080) throw new NumberFormatException();
            return value * 60000;
        } catch (NumberFormatException error) { throw new IllegalStateException(name + " phải từ 1 đến 10080."); }
    }

    @Scheduled(fixedDelay = 15000, initialDelay = 5000)
    public synchronized void tick() {
        if (!"true".equals(settings.get("TV5_JOBS_ENABLED", "false"))) return;
        long now = System.currentTimeMillis();
        if (now >= nextSqi) {
            nextSqi = now + sqiDelay;
            try { calculate(); } catch (Exception error) { log.error("Job SQI failed", error); }
        }
        if (now >= nextAlert) {
            nextAlert = now + alertDelay;
            try { evaluate(); } catch (Exception error) { log.error("Job cảnh báo failed", error); }
        }
    }

    private UUID actor() {
        return Values.id(system.activeActor(settings.get("TV5_USERNAME", "researcher01")).get("user_id").toString());
    }

    private void calculate() {
        String dataset = settings.get("TV5_DATASET_ID", "");
        if (dataset.isBlank()) { log.info("Job SQI cần TV5_DATASET_ID của dataset BUILT."); return; }
        UUID id = Values.id(dataset);
        if (!"BUILT".equals(system.datasetStatus(id).get("status"))) {
            log.info("Dataset đã đóng băng hoặc chưa build; bỏ qua job gán nhãn."); return;
        }
        List<Map<String, Object>> definitions = system.activeDefinitions();
        if (definitions.isEmpty()) return;
        log.info("Job SQI {}", sqi.calculate(actor(), Values.id(definitions.get(0).get("definition_id").toString()), id, true));
    }

    private void evaluate() throws Exception {
        Map<String, Object> result = alerts.evaluate(actor(), null);
        log.info("Job cảnh báo: {} cảnh báo mới", result.get("created"));
        String token = settings.get("TV5_TELEGRAM_TOKEN", "");
        if (token.isBlank()) return;
        for (Object item : (List<?>) result.get("alerts")) {
            Map<?, ?> alert = (Map<?, ?>) item;
            try {
                String body = json.writeValueAsString(Map.of("chat_id", settings.get("TV5_TELEGRAM_CHAT", ""),
                        "text", "[" + alert.get("severity") + "] " + alert.get("message")));
                HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                        .timeout(Duration.ofSeconds(10)).header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body)).build();
                var response = http.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() != 200 || !json.readTree(response.body()).path("ok").asBoolean()) {
                    log.warn("Telegram gửi thất bại cho cảnh báo {}", alert.get("alert_id"));
                }
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception error) { log.warn("Telegram chưa gửi được cảnh báo {}", alert.get("alert_id")); }
        }
    }
}
