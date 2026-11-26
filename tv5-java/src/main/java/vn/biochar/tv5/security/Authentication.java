package vn.biochar.tv5.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.config.Settings;
import vn.biochar.tv5.service.ISystemService;

@Component
public class Authentication implements HandlerInterceptor, WebMvcConfigurer {
    private final Settings settings;
    private final ObjectMapper json;
    private final ISystemService system;

    public Authentication(Settings settings, ObjectMapper json, ISystemService system) {
        this.settings = settings;
        this.json = json;
        this.system = system;
        if (settings.get("JWT_SECRET", "").isBlank()) throw new IllegalStateException("Cần JWT_SECRET giống backend TV1.");
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/v1/tv5/**").excludePathPatterns("/api/v1/tv5/health");
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) throw new ApiException(401, "Cần đăng nhập.");
        UUID id = verify(header.substring(7));
        Map<String, Object> user;
        try {
            user = system.access(id);
        } catch (ApiException error) { throw new ApiException(401, "Tài khoản không tồn tại."); }
        if (!Boolean.TRUE.equals(user.get("is_active"))) throw new ApiException(401, "Tài khoản đã bị khóa.");
        String path = request.getRequestURI();
        String domain = path.contains("/sqi") ? "sqi" : path.contains("/reports") ? "reporting" : "alert";
        String permission = domain + ("GET".equals(request.getMethod()) ? ".read" : ".write");
        List<?> permissions = (List<?>) user.get("permissions");
        if (!permissions.contains(permission)) throw new ApiException(403, "Thiếu quyền " + permission);
        request.setAttribute("userId", id);
        request.setAttribute("permissions", permissions);
        response.setHeader("Cache-Control", "no-store");
        return true;
    }

    UUID verify(String token) {
        try {
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3) throw new IllegalArgumentException();
            Base64.Decoder decoder = Base64.getUrlDecoder();
            JsonNode header = json.readTree(decoder.decode(parts[0]));
            if (!"HS256".equals(header.path("alg").asText())) throw new IllegalArgumentException();
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(settings.get("JWT_SECRET", "").getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            if (!MessageDigest.isEqual(signature, decoder.decode(parts[2]))) throw new IllegalArgumentException();
            JsonNode payload = json.readTree(decoder.decode(parts[1]));
            long now = Instant.now().getEpochSecond();
            if (!"access".equals(payload.path("typ").asText()) || !payload.path("exp").isNumber()
                    || payload.path("exp").asLong() <= now
                    || payload.has("nbf") && payload.path("nbf").asLong() > now) throw new IllegalArgumentException();
            return UUID.fromString(payload.path("sub").asText());
        } catch (Exception error) { throw new ApiException(401, "Token không hợp lệ hoặc đã hết hạn."); }
    }
}
