package vn.biochar.tv5;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/** Prevent persistence and HTTP transport from leaking back into page/business code. */
class Tv5ArchitectureTest {
    @Test
    void businessAndRestLayersDoNotQueryDatabaseDirectly() throws Exception {
        Path root = Path.of("src/main/java/vn/biochar/tv5");
        for (String layer : new String[]{"rest", "service", "job", "security"}) {
            try (var files = Files.walk(root.resolve(layer))) {
                for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                    String source = Files.readString(file);
                    assertFalse(source.contains("JdbcDatabase") || source.contains("jdbc.core")
                        || source.contains("Sql."), file + " must use a service/DAO contract");
                }
            }
        }
    }

    @Test
    void frontendPagesDoNotOwnHttpTransportOrApiUrls() throws Exception {
        Path root = Path.of("src/main/resources/static/tv5/assets/js");
        for (String layer : new String[]{"pages", "components", "core", "views", "theme"}) {
            try (var files = Files.walk(root.resolve(layer))) {
                for (Path file : files.filter(path -> path.toString().endsWith(".js")).toList()) {
                    String source = Files.readString(file);
                    assertFalse(source.contains("fetch(") || source.contains("/api/v1/"),
                        file + " must call the domain api module");
                }
            }
        }
    }
}
