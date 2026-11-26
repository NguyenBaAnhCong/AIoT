package vn.biochar.tv5.config;

import java.nio.file.*;
import java.sql.Statement;
import java.util.*;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import vn.biochar.tv5.config.Settings;
import vn.biochar.tv5.dao.jdbc.JdbcDatabase;

@Component
public class Migrations implements ApplicationRunner {
    private final JdbcDatabase db;
    private final JdbcTemplate jdbc;
    private final Settings settings;
    public Migrations(JdbcDatabase db, JdbcTemplate jdbc, Settings settings) { this.db = db; this.jdbc = jdbc; this.settings = settings; }

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        if (!"true".equals(settings.get("TV5_RUN_MIGRATIONS", "true"))) return;
        Path directory = Path.of(settings.get("TV5_MIGRATIONS_DIR", "../database/migrations"));
        List<Path> files;
        try (var paths = Files.list(directory)) {
            files = paths.filter(path -> path.getFileName().toString().matches("\\d+_tv5_.*\\.sql")).sorted().toList();
        }
        for (Path file : files) {
            String content = Files.readString(file);
            db.tx(null, () -> {
                db.one("SELECT pg_advisory_xact_lock(727001)");
                db.update("CREATE TABLE IF NOT EXISTS public.schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
                if (!db.rows("SELECT 1 FROM public.schema_migrations WHERE filename=$1", file.getFileName().toString()).isEmpty()) return null;
                jdbc.execute((Statement statement) -> { statement.execute(content); return null; });
                db.update("INSERT INTO public.schema_migrations(filename) VALUES($1)", file.getFileName().toString());
                return null;
            });
        }
    }
}
