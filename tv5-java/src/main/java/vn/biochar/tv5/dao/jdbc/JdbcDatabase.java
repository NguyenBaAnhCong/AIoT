package vn.biochar.tv5.dao.jdbc;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.SQLException;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import vn.biochar.tv5.common.exception.ApiException;

@Component
public class JdbcDatabase implements vn.biochar.tv5.common.transaction.ITransactionRunner {
    private final NamedParameterJdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    public JdbcDatabase(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager manager, ObjectMapper json) {
        this.jdbc = jdbc;
        transactions = new TransactionTemplate(manager);
        this.json = json;
    }

    private String sql(String value) {
        return value.replaceAll("\\$(\\d+)", ":p$1");
    }

    private Map<String, Object> parameters(Object[] values) {
        Map<String, Object> parameters = new HashMap<>();
        for (int index = 0; index < values.length; index++) parameters.put("p" + (index + 1), values[index]);
        return parameters;
    }

    public List<Map<String, Object>> rows(String sql, Object... values) {
        return jdbc.query(this.sql(sql), parameters(values), (result, index) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int column = 1; column <= result.getMetaData().getColumnCount(); column++) {
                Object value = result.getObject(column);
                String type = result.getMetaData().getColumnTypeName(column);
                if (value != null && ("json".equals(type) || "jsonb".equals(type))) {
                    try { value = json.readValue(value.toString(), Object.class); }
                    catch (JsonProcessingException error) { throw new SQLException("Invalid database JSON", error); }
                } else if (value instanceof java.sql.Array array) {
                    value = Arrays.asList((Object[]) array.getArray());
                } else if (value instanceof java.sql.Timestamp timestamp) {
                    value = timestamp.toInstant().toString();
                } else if (value instanceof UUID || value instanceof java.sql.Date) {
                    value = value.toString();
                }
                row.put(result.getMetaData().getColumnLabel(column), value);
            }
            return row;
        });
    }

    public Map<String, Object> one(String sql, Object... values) {
        List<Map<String, Object>> rows = rows(sql, values);
        if (rows.isEmpty()) throw new ApiException(404, "Không tìm thấy dữ liệu.");
        return rows.get(0);
    }

    public int update(String sql, Object... values) {
        return jdbc.update(this.sql(sql), parameters(values));
    }

    public <T> T tx(UUID user, Supplier<T> action) {
        return transactions.execute(status -> {
            if (user != null) one("SELECT set_config('app.user_id',$1,true)", user.toString());
            return action.get();
        });
    }

    public Map<String, Object> page(String query, List<Object> values, int page, int limit) {
        if (page < 1 || limit < 1 || limit > 200) throw new ApiException(400, "Trang và số dòng không hợp lệ.");
        return transactions.execute(status -> {
            long total = ((Number) one("SELECT count(*) AS total FROM (" + query + ") entries",
                    values.toArray()).get("total")).longValue();
            List<Object> args = new ArrayList<>(values);
            args.add(limit);
            args.add((long) (page - 1) * limit);
            List<Map<String, Object>> rows = rows(query + " LIMIT $" + (args.size() - 1) + " OFFSET $" + args.size(),
                    args.toArray());
            return Map.of("data", rows, "meta", Map.of("page", page, "limit", limit, "total", total));
        });
    }
}
