package vn.biochar.tv5.common.exception;

import java.util.*;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import vn.biochar.tv5.common.exception.ApiException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<?> request(ApiException error) {
        return response(error.status, error.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    ResponseEntity<?> invalid(Exception error) {
        return response(400, "Dữ liệu gửi lên không hợp lệ.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<?> database(DataAccessException error) {
        Throwable cause = error.getMostSpecificCause();
        if (cause instanceof java.sql.SQLException sql) {
            if ("23505".equals(sql.getSQLState())) return response(409, "Mã hoặc cấu hình đã tồn tại.");
            if ("23P01".equals(sql.getSQLState())) return response(409, "Khoảng ngày đã có điểm từ dataset khác.");
            if (java.util.Set.of("23503", "23514", "22P02", "22003", "22001").contains(sql.getSQLState())) {
                return response(400, "Giá trị không phù hợp với cấu trúc database.");
            }
        }
        return unexpected(error);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<?> unexpected(Exception error) {
        LoggerFactory.getLogger(GlobalExceptionHandler.class).error("TV5 request failed", error);
        return response(500, "Không xử lý được yêu cầu. Kiểm tra log backend Java TV5.");
    }

    static ResponseEntity<?> response(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", Map.of("code", "TV5_ERROR", "message", message)));
    }
}
