package vn.biochar.tv5.rest.impl;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import vn.biochar.tv5.wrapper.ApiResponse;

abstract class RestSupport {
    protected UUID user(HttpServletRequest request) { return (UUID)request.getAttribute("userId"); }
    protected ApiResponse<?> data(Object value) { return ApiResponse.of(value); }
}
