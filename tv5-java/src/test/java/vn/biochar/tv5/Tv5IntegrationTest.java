package vn.biochar.tv5;
import vn.biochar.tv5.dao.jdbc.JdbcDatabase;
import vn.biochar.tv5.config.Settings;
import vn.biochar.tv5.common.util.Values;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import java.io.ByteArrayInputStream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@EnabledIfEnvironmentVariable(named="TV5_INTEGRATION_TESTS", matches="true")
class Tv5IntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcDatabase db;
    @Autowired Settings settings;
    private String token;
    private UUID user;
    private final List<Path> files = new ArrayList<>();
    private static final String BASE = "/api/v1/tv5";

    @BeforeEach
    void login() throws Exception {
        user = Values.id(db.one("SELECT user_id FROM iam.users WHERE username='researcher01'").get("user_id").toString());
        token = token(user, "access", Instant.now().getEpochSecond() + 600);
    }
    @AfterEach
    void cleanup() throws Exception { for (Path file : files) Files.deleteIfExists(file); }

    private String token(UUID id, String type, long exp) throws Exception {
        var encoder = Base64.getUrlEncoder().withoutPadding();
        String header = encoder.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String payload = encoder.encodeToString(json.writeValueAsBytes(Map.of("sub",id.toString(),"typ",type,"exp",exp)));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(settings.get("JWT_SECRET","").getBytes(StandardCharsets.UTF_8),"HmacSHA256"));
        return header + "." + payload + "." + encoder.encodeToString(mac.doFinal((header+"."+payload).getBytes(StandardCharsets.US_ASCII)));
    }
    private ResultActions getApi(String path) throws Exception {
        return mvc.perform(get(BASE+path).header("Authorization","Bearer "+token));
    }
    private ResultActions postApi(String path, Object body) throws Exception {
        return mvc.perform(post(BASE+path).header("Authorization","Bearer "+token)
            .contentType("application/json").content(json.writeValueAsBytes(body)));
    }
    private JsonNode data(ResultActions action) throws Exception {
        return json.readTree(action.andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray()).path("data");
    }
    private Map<String,Object> definition() {
        return db.one("SELECT definition_id FROM sqi.sqi_definitions WHERE status='ACTIVE' LIMIT 1");
    }
    private String dataset() {
        return db.one("SELECT dataset_version_id FROM dataset.dataset_versions WHERE status='FROZEN' LIMIT 1")
                .get("dataset_version_id").toString();
    }

    @Test
    void authenticatesTv1TokenAndEnforcesPermissions() throws Exception {
        mvc.perform(get(BASE+"/sqi/plots")).andExpect(status().isUnauthorized());
        String valid = token;
        token = token(user, "refresh", Instant.now().getEpochSecond()+600);
        getApi("/sqi/plots").andExpect(status().isUnauthorized());
        token = token(user, "access", Instant.now().getEpochSecond()-1);
        getApi("/sqi/plots").andExpect(status().isUnauthorized());
        UUID denied = UUID.randomUUID();
        db.update("INSERT INTO iam.users(user_id,username,email,full_name) VALUES($1,$2,$3,$4)",
            denied, "test-"+denied, denied+"@test.invalid", "Kiểm thử");
        token = token(denied, "access", Instant.now().getEpochSecond()+600);
        getApi("/sqi/plots").andExpect(status().isForbidden());
        token = valid;
        assertFalse(data(getApi("/sqi/plots")).isEmpty());
    }

    @Test
    void readsSqiAndValidatesDatesAndPagination() throws Exception {
        JsonNode plot = data(getApi("/sqi/plots")).get(0);
        String filters = "?plotId="+plot.path("plot_id").asText()+"&definitionId="+plot.path("definition_id").asText();
        JsonNode scores = data(getApi("/sqi/scores"+filters+"&from="+plot.path("first_day").asText()+"&to="+plot.path("last_day").asText()));
        assertEquals(45,scores.size());
        assertTrue(data(getApi("/sqi/scores/"+scores.get(0).path("sqi_score_id").asText())).path("indicators").size()>0);
        getApi("/sqi/scores"+filters+"&from=2026-02-30&to=2026-03-02").andExpect(status().isBadRequest());
        getApi("/alerts?page=0").andExpect(status().isBadRequest());
        assertEquals(3,data(getApi("/sqi/comparison?definitionId="+plot.path("definition_id").asText())).size());
        assertTrue(data(getApi("/sqi/configuration")).path("parameters").size()>0);
        assertEquals(12,data(getApi("/reports/kpis")).size());
    }

    @Test
    void calculatesAndLabelsBuiltDatasetPreservingExpertLabels() throws Exception {
        UUID def = Values.id(definition().get("definition_id").toString());
        UUID version = Values.id(dataset());
        postApi("/sqi/calculate",Map.of("definition",def,"dataset",version,"label",true)).andExpect(status().isConflict());
        Map<String,Object> record=db.one("SELECT record_id,observed_at,label_id FROM dataset.dataset_records WHERE dataset_version_id=$1 AND valid_flag AND label_id IS NOT NULL LIMIT 1",version);
        db.update("UPDATE dataset.dataset_versions SET status='BUILT' WHERE dataset_version_id=$1",version);
        db.update("UPDATE dataset.dataset_records SET label_source='EXPERT' WHERE record_id=$1",Values.id(record.get("record_id").toString()));
        JsonNode result=data(postApi("/sqi/calculate",Map.of("definition",def,"dataset",version,"label",true)));
        assertEquals(135,result.path("scores").asInt());
        assertTrue(result.path("labels").asInt()>=10000);
        assertEquals("EXPERT",db.one("SELECT label_source FROM dataset.dataset_records WHERE record_id=$1",Values.id(record.get("record_id").toString())).get("label_source"));
    }

    @Test
    void createsAndActivatesNewDefinition() throws Exception {
        JsonNode original=data(getApi("/sqi/configuration")).path("definitions").get(0);
        Map<String,Object> body=new HashMap<>();
        body.put("code","JAVA-"+UUID.randomUUID().toString().substring(0,8));
        body.put("name","Phiên bản Java");
        body.put("coverage",70);
        body.put("indicators",original.path("indicators"));
        body.put("classes",original.path("classes"));
        String id=data(postApi("/sqi/definitions",body)).path("definition_id").asText();
        postApi("/sqi/definitions/"+id+"/activate",Map.of()).andExpect(status().isConflict());
        assertEquals(135,data(postApi("/sqi/calculate",Map.of("definition",id,"dataset",dataset()))).path("scores").asInt());
        assertEquals("ACTIVE",data(postApi("/sqi/definitions/"+id+"/activate",Map.of())).path("status").asText());
    }

    @Test
    void persistsAiThresholdAndRunsCooldown() throws Exception {
        Map<String,Object> rule=new HashMap<>(Map.of("code","JAVA_AI","name","Luật AI Java","source","ML","condition","ANOMALY",
            "severity","HIGH","high",.83,"windowMinutes",60,"cooldownMinutes",360,"recommendation","Kiểm tra số đo"));
        String id=data(postApi("/alert-rules",rule)).path("rule_id").asText();
        rule.put("name","Đổi tên vẫn giữ ngưỡng");
        mvc.perform(put(BASE+"/alert-rules/"+id).header("Authorization","Bearer "+token)
            .contentType("application/json").content(json.writeValueAsBytes(rule))).andExpect(status().isOk());
        assertEquals(.83,((Number)db.one("SELECT threshold_high FROM alert.alert_rules WHERE rule_id=$1",Values.id(id)).get("threshold_high")).doubleValue());
        rule.put("high",1.1);
        postApi("/alert-rules",rule).andExpect(status().isBadRequest());
        db.update("UPDATE alert.alert_rules SET is_active=(rule_id=$1)",Values.id(id));
        String at=db.one("SELECT inferred_at FROM ml.inference_results WHERE anomaly_score>=0.83 ORDER BY anomaly_score DESC LIMIT 1").get("inferred_at").toString();
        assertTrue(data(postApi("/alerts/evaluate",Map.of("at",at))).path("created").asInt()>0);
        assertEquals(0,data(postApi("/alerts/evaluate",Map.of("at",at))).path("created").asInt());
        String alert=db.one("SELECT alert_id FROM alert.alerts WHERE rule_id=$1 LIMIT 1",Values.id(id)).get("alert_id").toString();
        mvc.perform(patch(BASE+"/alerts/"+alert).header("Authorization","Bearer "+token).contentType("application/json").content("{\"status\":\"ACK\"}")).andExpect(status().isOk());
        mvc.perform(patch(BASE+"/alerts/"+alert).header("Authorization","Bearer "+token).contentType("application/json").content("{\"status\":\"RESOLVED\",\"note\":\"Đã xử lý\"}")).andExpect(status().isOk());
        String reco=db.one("SELECT recommendation_id FROM alert.recommendations WHERE alert_id=$1 LIMIT 1",Values.id(alert)).get("recommendation_id").toString();
        for(String status:List.of("ACCEPTED","DONE")) {
            mvc.perform(patch(BASE+"/recommendations/"+reco).header("Authorization","Bearer "+token).contentType("application/json")
                .content(json.writeValueAsBytes(Map.of("status",status)))).andExpect(status().isOk());
        }
        assertEquals(user.toString(),db.one("SELECT resolved_by FROM alert.alerts WHERE alert_id=$1",Values.id(alert)).get("resolved_by"));
    }

    @Test
    void paginatesBeyondOneHundredRecords() throws Exception {
        db.update("INSERT INTO alert.alerts(severity,source,message) SELECT 'HIGH','SENSOR','Java pagination '||i FROM generate_series(1,125) i");
        db.update("INSERT INTO reporting.reports(report_type,title,status) SELECT 'TECHNICAL','Java report '||i,'QUEUED' FROM generate_series(1,125) i");
        for(String path:List.of("/alerts","/reports")) {
            var response=getApi(path+"?page=6&limit=20").andExpect(status().isOk()).andReturn().getResponse();
            JsonNode result=json.readTree(response.getContentAsByteArray());
            assertEquals(20,result.path("data").size());
            assertTrue(result.path("meta").path("total").asInt()>=125);
            assertEquals(0,data(getApi(path+"?page=1000&limit=20")).size());
        }
    }

    @Test
    void exportsVietnameseReportsWithCorrectData() throws Exception {
        Map<String,Object> scope=db.one("""
            SELECT t.experiment_id,t.treatment_id,a.crop_season_id FROM experiment.treatments t
            JOIN experiment.treatment_applications a USING(treatment_id) WHERE t.treatment_code='T0' LIMIT 1
            """);
        for(String type:List.of("TECHNICAL","ECONOMIC","ENVIRONMENTAL")) {
            for(String format:List.of("XLSX","PDF")) {
                Map<String,Object> body=new HashMap<>(Map.of("experiment",scope.get("experiment_id"),"treatment",scope.get("treatment_id"),"type",type,"format",format));
                if("TECHNICAL".equals(type)) body.put("season",scope.get("crop_season_id"));
                JsonNode report=data(postApi("/reports",body));
                assertEquals("READY",report.path("status").asText());
                String id=report.path("report_id").asText();
                Path directory=Path.of(settings.get("TV5_REPORT_DIR","../tv5/.reports"));
                files.add(directory.resolve(id+"."+format.toLowerCase(Locale.ROOT)));
                byte[] content=getApi("/reports/"+id+"/file").andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
                if("XLSX".equals(format)) {
                    try(var book=new XSSFWorkbook(new ByteArrayInputStream(content))) {
                        assertEquals("T0",book.getSheetAt(0).getRow(4).getCell(0).getStringCellValue());
                        if("ECONOMIC".equals(type)) {
                            double profit=((Number)db.one("SELECT profit_vnd_ha FROM reporting.economic_results WHERE treatment_id=$1",Values.id(scope.get("treatment_id").toString())).get("profit_vnd_ha")).doubleValue();
                            assertEquals(profit,book.getSheetAt(0).getRow(4).getCell(5).getNumericCellValue());
                        }
                    }
                } else {
                    try(var document=Loader.loadPDF(content)) {
                        String text=new PDFTextStripper().getText(document);
                        assertTrue(text.contains("Báo cáo"));
                        assertTrue(text.contains("T0"));
                    }
                }
            }
        }
        postApi("/reports",Map.of("experiment",scope.get("experiment_id"),"season",scope.get("crop_season_id"),
            "type","ECONOMIC","format","XLSX")).andExpect(status().isUnprocessableEntity());
    }
}
