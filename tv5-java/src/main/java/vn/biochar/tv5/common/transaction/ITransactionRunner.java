package vn.biochar.tv5.common.transaction;

import java.util.UUID;
import java.util.function.Supplier;

public interface ITransactionRunner {
    <T> T tx(UUID user, Supplier<T> action);
}
