package vn.biochar.tv5.common.util;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.*;
import java.util.UUID;
import vn.biochar.tv5.common.exception.ApiException;

public final class Values {
    private Values() {}
    public static UUID id(String value) {
        try {
            if (value == null || !value.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw new IllegalArgumentException();
            return UUID.fromString(value);
        } catch (IllegalArgumentException error) { throw new ApiException(400, "Mã định danh không hợp lệ."); }
    }
    public static UUID optionalId(String value) { return value == null || value.isBlank() ? null : id(value); }
    public static String text(JsonNode node, String field, int max) {
        JsonNode value = node.path(field);
        if (!value.isTextual() || value.asText().isBlank() || value.asText().length() > max) {
            throw new ApiException(400, "Kiểm tra trường " + field + ".");
        }
        return value.asText().trim();
    }
    public static double number(JsonNode node, String field) {
        if (!node.path(field).isNumber() || !Double.isFinite(node.path(field).asDouble())) {
            throw new ApiException(400, "Trường " + field + " phải là số hợp lệ.");
        }
        return node.path(field).asDouble();
    }
    public static void choice(String value, String... choices) {
        if (!java.util.Arrays.asList(choices).contains(value)) throw new ApiException(400, "Giá trị lựa chọn không hợp lệ.");
    }
    public static LocalDate date(String value) {
        try {
            if (value == null || !value.matches("(?!0000)\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException();
            return LocalDate.parse(value);
        } catch (RuntimeException error) { throw new ApiException(400, "Ngày phải có dạng YYYY-MM-DD và hợp lệ."); }
    }
}

