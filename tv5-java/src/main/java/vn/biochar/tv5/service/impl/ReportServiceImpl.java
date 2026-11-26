package vn.biochar.tv5.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.common.transaction.ITransactionRunner;
import vn.biochar.tv5.common.util.Values;
import vn.biochar.tv5.config.Settings;
import vn.biochar.tv5.dao.IReportDao;
import vn.biochar.tv5.dto.response.ReportDownload;
import vn.biochar.tv5.service.IReportService;

@Service
public class ReportServiceImpl implements IReportService {
    private final IReportDao dao;
    private final ITransactionRunner transactions;
    private final ObjectMapper json;
    private final Path directory;
    private final Path fontFile;
    private static final Map<String, String> TITLES = Map.of(
        "TECHNICAL", "Báo cáo kỹ thuật", "ECONOMIC", "Báo cáo kinh tế", "ENVIRONMENTAL", "Báo cáo môi trường");
    private record Content(UUID id, String title, String scope, String format, List<String> headers,
                           List<List<Object>> rows) {}

    public ReportServiceImpl(IReportDao dao, ITransactionRunner transactions, ObjectMapper json, Settings settings) {
        this.dao = dao;
        this.transactions = transactions;
        this.json = json;
        directory = Path.of(settings.get("TV5_REPORT_DIR", "../tv5/.reports")).toAbsolutePath().normalize();
        String font = System.getProperty("os.name").startsWith("Windows")
                ? System.getenv().getOrDefault("WINDIR", "C:/Windows") + "/Fonts/arial.ttf"
                : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
        fontFile = Path.of(settings.get("TV5_PDF_FONT", font));
    }

    @Override
    public Map<String, Object> create(UUID user, JsonNode body) {
        Content content = transactions.tx(user, () -> prepare(user, body));
        Path target = directory.resolve(content.id + "." + content.format.toLowerCase(Locale.ROOT));
        Path temporary = null;
        try {
            dao.markGenerating(content.id);
            byte[] bytes = "PDF".equals(content.format) ? pdf(content) : excel(content);
            Files.createDirectories(directory);
            temporary = Files.createTempFile(directory, content.id.toString(), ".tmp");
            Files.write(temporary, bytes);
            try { Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException error) { Files.move(temporary, target); }
            transactions.tx(user, () -> dao.markReady(content.id, "/api/v1/tv5/reports/" + content.id + "/file"));
            return Map.of("report_id", content.id, "status", "READY");
        } catch (Exception error) {
            org.slf4j.LoggerFactory.getLogger(getClass()).error("Report {} failed", content.id, error);
            try { Files.deleteIfExists(target); if (temporary != null) Files.deleteIfExists(temporary); }
            catch (IOException cleanup) { error.addSuppressed(cleanup); }
            transactions.tx(user, () -> dao.failedReport(content.id));
            return Map.of("report_id", content.id, "status", "FAILED");
        }
    }

    private Content prepare(UUID user, JsonNode body) {
        String type = Values.text(body, "type", 16), format = Values.text(body, "format", 8);
        Values.choice(type, "TECHNICAL", "ECONOMIC", "ENVIRONMENTAL");
        Values.choice(format, "PDF", "XLSX");
        UUID experiment = Values.id(body.path("experiment").asText());
        UUID treatment = Values.optionalId(body.path("treatment").asText(null));
        UUID season = Values.optionalId(body.path("season").asText(null));
        LocalDate from = optionalDate(body, "from"), to = optionalDate(body, "to");
        if (from != null && to != null && from.isAfter(to) || !"TECHNICAL".equals(type) && (from != null || to != null)) {
            throw new ApiException(400, "Khoảng ngày chỉ áp dụng cho báo cáo kỹ thuật và phải hợp lệ.");
        }
        Map<String, Object> names;
        try { names = dao.reportScope(experiment, treatment, season); }
        catch (ApiException error) { throw new ApiException(400, "Thí nghiệm không tồn tại."); }
        if (treatment != null && names.get("treatment_code") == null || season != null && names.get("season_code") == null) {
            throw new ApiException(400, "Nghiệm thức hoặc mùa vụ không thuộc thí nghiệm đã chọn.");
        }
        List<Map<String, Object>> records = "TECHNICAL".equals(type)
            ? dao.technical(experiment, treatment, season, from, to)
            : dao.economic(experiment, treatment, season);
        if (records.isEmpty()) throw new ApiException(422, season != null
            ? "Không có dữ liệu cho mùa vụ này. Thử chọn Mùa vụ thành Tất cả."
            : "Không có dữ liệu cho bộ lọc đã chọn.");
        List<String> keys;
        List<String> headers;
        if ("TECHNICAL".equals(type)) {
            keys = List.of("treatment_code", "plot_code", "version_code", "days", "mean_sqi", "coverage");
            headers = List.of("Nghiệm thức", "Ô đất", "Phiên bản SQI", "Số ô-ngày", "SQI trung bình", "Độ phủ TB (%)");
        } else if ("ECONOMIC".equals(type)) {
            keys = List.of("treatment_code", "plot_code", "yield_t_ha", "revenue_vnd_ha", "total_cost_vnd_ha", "profit_vnd_ha", "bcr");
            headers = List.of("Nghiệm thức", "Ô đất", "Năng suất (t/ha)", "Doanh thu (đ/ha)", "Chi phí (đ/ha)", "Lợi nhuận (đ/ha)", "BCR");
        } else {
            keys = List.of("treatment_code", "plot_code", "carbon_sequestered_kg_ha");
            headers = List.of("Nghiệm thức", "Ô đất", "Carbon lưu giữ (kg/ha)");
        }
        List<List<Object>> rows = new ArrayList<>();
        for (Map<String, Object> row : records) {
            List<Object> cells = new ArrayList<>();
            for (String key : keys) cells.add(row.get(key));
            rows.add(cells);
        }
        Map<String, Object> scope = new LinkedHashMap<>();
        scope.put("experiment", experiment); scope.put("treatment", treatment); scope.put("season", season);
        scope.put("from", from == null ? null : from.toString()); scope.put("to", to == null ? null : to.toString());
        String parameters;
        try { parameters = json.writeValueAsString(scope); }
        catch (IOException error) { throw new IllegalStateException(error); }
        UUID id = Values.id(dao.insertReport(type, TITLES.get(type), experiment, season, from, to, parameters, format, user).get("report_id").toString());
        List<String> description = new ArrayList<>();
        description.add("Thí nghiệm " + names.get("experiment_code"));
        if (treatment != null) description.add("Nghiệm thức " + names.get("treatment_code"));
        if (season != null) description.add("Mùa vụ " + names.get("season_code"));
        if (from != null) description.add("Từ " + from);
        if (to != null) description.add("Đến " + to);
        return new Content(id, TITLES.get(type), String.join(" · ", description), format, headers, rows);
    }

    private LocalDate optionalDate(JsonNode body, String key) {
        String value = body.path(key).asText(null);
        return value == null || value.isBlank() ? null : Values.date(value);
    }

    private byte[] excel(Content content) throws IOException {
        try (XSSFWorkbook book = new XSSFWorkbook(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            var sheet = book.createSheet("Báo cáo");
            sheet.createRow(0).createCell(0).setCellValue(content.title);
            sheet.createRow(1).createCell(0).setCellValue(content.scope);
            sheet.createFreezePane(0, 4);
            var bold = book.createFont(); bold.setBold(true);
            var headerStyle = book.createCellStyle(); headerStyle.setFont(bold);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            var titleStyle = book.createCellStyle(); titleStyle.setFont(bold);
            sheet.getRow(0).getCell(0).setCellStyle(titleStyle);
            var header = sheet.createRow(3);
            for (int index = 0; index < content.headers.size(); index++) {
                var cell = header.createCell(index);
                cell.setCellValue(content.headers.get(index)); cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(index, Math.min(50, Math.max(20, content.headers.get(index).length() + 3)) * 256);
            }
            for (int index = 0; index < content.rows.size(); index++) {
                var row = sheet.createRow(index + 4);
                for (int column = 0; column < content.rows.get(index).size(); column++) {
                    Object value = content.rows.get(index).get(column);
                    var cell = row.createCell(column);
                    if (value instanceof Number number) cell.setCellValue(number.doubleValue());
                    else if (value != null) cell.setCellValue(value.toString());
                }
            }
            book.write(bytes);
            return bytes.toByteArray();
        }
    }

    private byte[] pdf(Content content) throws IOException {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream bytes = new ByteArrayOutputStream();
             InputStream fontStream = Files.newInputStream(fontFile)) {
            PDType0Font font = PDType0Font.load(document, fontStream);
            float width = PDRectangle.A4.getHeight(), height = PDRectangle.A4.getWidth();
            float columnWidth = (width - 80) / content.headers.size();
            PDPageContentStream stream = null;
            try {
                List<List<Object>> all = new ArrayList<>(); all.add(new ArrayList<>(content.headers)); all.addAll(content.rows);
                float y = 0;
                for (List<Object> row : all) {
                    List<List<String>> lines = new ArrayList<>();
                    for (Object value : row) lines.add(wrap(value == null ? "—" : value.toString(), font, 9, columnWidth - 12));
                    float rowHeight = lines.stream().mapToInt(List::size).max().orElse(1) * 13 + 12;
                    if (stream == null || y - rowHeight < 40) {
                        if (stream != null) stream.close();
                        PDPage page = new PDPage(new PDRectangle(width, height)); document.addPage(page);
                        stream = new PDPageContentStream(document, page);
                        text(stream, font, 18, 40, height - 45, content.title);
                        y = height - 67;
                        for (String line : wrap(content.scope, font, 9, width - 80)) {
                            text(stream, font, 9, 40, y, line); y -= 13;
                        }
                        y -= 12;
                    }
                    for (int column = 0; column < lines.size(); column++) {
                        float lineY = y - 13;
                        for (String line : lines.get(column)) {
                            text(stream, font, 9, 46 + columnWidth * column, lineY, line); lineY -= 13;
                        }
                    }
                    y -= rowHeight;
                    stream.setStrokingColor(225f / 255f, 230f / 255f, 233f / 255f);
                    stream.moveTo(40, y); stream.lineTo(width - 40, y); stream.stroke();
                }
            } finally { if (stream != null) stream.close(); }
            document.save(bytes);
            return bytes.toByteArray();
        }
    }

    private List<String> wrap(String value, PDType0Font font, int size, float width) throws IOException {
        List<String> lines = new ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (char character : value.replaceAll("[\\r\\n\\t]", " ").toCharArray()) {
            if (font.getStringWidth(line.toString() + character) / 1000 * size > width && !line.isEmpty()) {
                lines.add(line.toString()); line.setLength(0);
            }
            line.append(character);
        }
        if (!line.isEmpty() || lines.isEmpty()) lines.add(line.toString());
        return lines;
    }

    private void text(PDPageContentStream stream, PDType0Font font, int size, float x, float y, String text) throws IOException {
        stream.beginText(); stream.setFont(font, size); stream.newLineAtOffset(x, y);
        stream.showText(text); stream.endText();
    }

    @Override
    public ReportDownload download(UUID id) {
        String format = dao.download(id).get("file_format").toString();
        Values.choice(format, "PDF", "XLSX");
        String filename = id + "." + format.toLowerCase(Locale.ROOT);
        try {
            return new ReportDownload(Files.readAllBytes(directory.resolve(filename)), filename,
                "PDF".equals(format) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        } catch (IOException error) { throw new ApiException(404, "Tệp báo cáo không còn trên máy chủ này."); }
    }

    @Override
    public Map<String,Object> list(int page, int limit, String type) {
        if (type == null || type.isBlank()) return dao.reports(List.of(), page, limit);
        Values.choice(type, "TECHNICAL", "ECONOMIC", "ENVIRONMENTAL");
        return dao.filteredReports(type, page, limit);
    }
    @Override
    public Map<String,Object> options() { return dao.reportOptions(); }
    @Override
    public List<Map<String,Object>> kpis() { return dao.acceptanceKpis(); }
}
