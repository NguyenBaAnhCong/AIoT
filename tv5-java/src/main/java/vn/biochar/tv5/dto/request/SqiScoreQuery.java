package vn.biochar.tv5.dto.request;

import java.time.LocalDate;
import java.util.UUID;
import vn.biochar.tv5.common.exception.ApiException;
import vn.biochar.tv5.common.util.Values;

public record SqiScoreQuery(UUID plotId, UUID definitionId, LocalDate from, LocalDate to) {
    public static SqiScoreQuery parse(String plot, String definition, String from, String to) {
        LocalDate first = Values.date(from), last = Values.date(to);
        if (first.isAfter(last)) throw new ApiException(400, "Ngày bắt đầu phải trước ngày kết thúc.");
        return new SqiScoreQuery(Values.id(plot), Values.id(definition), first, last);
    }
}
