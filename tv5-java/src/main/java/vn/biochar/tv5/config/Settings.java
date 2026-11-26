package vn.biochar.tv5.config;

import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.HashMap;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class Settings {
    private final Map<String, String> values = new HashMap<>();

    public Settings() throws IOException {
        Path file = Path.of(System.getenv().getOrDefault("TV5_ENV_FILE", "../.env"));
        if (Files.exists(file)) {
            for (String line : Files.readAllLines(file)) {
                String[] parts = line.trim().split("=", 2);
                if (parts.length != 2 || parts[0].startsWith("#")) continue;
                String value = parts[1].trim();
                if (value.length() >= 2 && (value.startsWith("\"") || value.startsWith("'"))) {
                    char quote = value.charAt(0);
                    int end = value.lastIndexOf(quote);
                    if (end > 0) value = value.substring(1, end);
                } else {
                    value = value.split("\\s+#", 2)[0].trim();
                }
                values.put(parts[0].trim(), value);
            }
        }
        values.putAll(System.getenv());
    }

    public String get(String key, String fallback) {
        return values.getOrDefault(key, fallback);
    }

    @Bean
    DataSource dataSource() {
        String url = get("DATABASE_URL", "");
        if (url.isBlank()) throw new IllegalStateException("Cần DATABASE_URL trong .env gốc của nhóm.");
        URI uri = URI.create(url);
        if (!java.util.Set.of("postgres", "postgresql").contains(uri.getScheme()) || uri.getHost() == null) {
            throw new IllegalStateException("DATABASE_URL phải là địa chỉ PostgreSQL hợp lệ.");
        }
        String[] credentials = uri.getRawUserInfo() == null ? new String[0] : uri.getRawUserInfo().split(":", 2);
        HikariDataSource source = new HikariDataSource();
        String host = uri.getHost().contains(":") ? "[" + uri.getHost() + "]" : uri.getHost();
        source.setJdbcUrl("jdbc:postgresql://" + host + ":" + (uri.getPort() < 0 ? 5432 : uri.getPort())
                + uri.getRawPath() + (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery()));
        if (credentials.length > 0) source.setUsername(decode(credentials[0]));
        if (credentials.length > 1) source.setPassword(decode(credentials[1]));
        source.setConnectionTimeout(5000);
        source.setMaximumPoolSize(10);
        source.setConnectionInitSql("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
        return source;
    }

    private static String decode(String value) {
        return URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8);
    }
}
