package vn.biochar.tv5.common.exception;

import java.util.*;

public class ApiException extends RuntimeException {
    final int status;
    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }
}
