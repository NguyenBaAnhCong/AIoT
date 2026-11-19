// Kiểm thử quy tắc ghi nhật ký truy cập (không cần database).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { shouldLog, resetSampler } = await import('../src/middleware/accessLog.js');

const T0 = 1_000_000_000_000;
const user = { userId: 'u1', apiKeyId: null };
const key = { userId: null, apiKeyId: 'k1' };
beforeEach(() => resetSampler());

test('người dùng: ghi thao tác ghi và request bị từ chối, bỏ qua GET thành công', () => {
  assert.equal(shouldLog({ method: 'POST', status: 201, ...user }, T0), true);
  assert.equal(shouldLog({ method: 'PATCH', status: 200, ...user }, T0), true);
  assert.equal(shouldLog({ method: 'GET', status: 403, ...user }, T0), true);
  assert.equal(shouldLog({ method: 'GET', status: 200, ...user }, T0), false);
  // người dùng KHÔNG bị lấy mẫu: hai lần liên tiếp đều được ghi
  assert.equal(shouldLog({ method: 'POST', status: 201, ...user }, T0), true);
  assert.equal(shouldLog({ method: 'POST', status: 201, ...user }, T0 + 1), true);
});

test('chưa biết danh tính thì không ghi', () => {
  assert.equal(shouldLog({ method: 'POST', status: 401, userId: null, apiKeyId: null }, T0), false);
});

test('API key: thành công chỉ ghi 1 lần mỗi 5 phút, đến hạn thì ghi lại', () => {
  assert.equal(shouldLog({ method: 'POST', status: 200, ...key }, T0), true);
  for (let i = 1; i <= 99; i++) {
    assert.equal(shouldLog({ method: 'POST', status: 200, ...key }, T0 + i * 3_000), false, `lần ${i} trong 5 phút phải bị bỏ`);
  }
  assert.equal(shouldLog({ method: 'POST', status: 200, ...key }, T0 + 5 * 60_000 + 1), true);
});

test('API key: mỗi key được lấy mẫu riêng', () => {
  assert.equal(shouldLog({ method: 'POST', status: 200, userId: null, apiKeyId: 'k1' }, T0), true);
  assert.equal(shouldLog({ method: 'POST', status: 200, userId: null, apiKeyId: 'k2' }, T0 + 1), true);
  assert.equal(shouldLog({ method: 'POST', status: 200, userId: null, apiKeyId: 'k1' }, T0 + 2), false);
});

test('API key: lỗi luôn được ghi (không bị bỏ hẳn), mỗi mã lỗi tối đa 1 lần / phút', () => {
  assert.equal(shouldLog({ method: 'POST', status: 400, ...key }, T0), true);
  assert.equal(shouldLog({ method: 'POST', status: 400, ...key }, T0 + 15_000), false);
  assert.equal(shouldLog({ method: 'POST', status: 500, ...key }, T0 + 15_000), true, 'mã lỗi khác vẫn được ghi');
  assert.equal(shouldLog({ method: 'POST', status: 400, ...key }, T0 + 61_000), true);
});

test('API key: lỗi không làm mất mẫu thành công và ngược lại', () => {
  assert.equal(shouldLog({ method: 'POST', status: 200, ...key }, T0), true);
  assert.equal(shouldLog({ method: 'POST', status: 403, ...key }, T0 + 1_000), true);
  assert.equal(shouldLog({ method: 'POST', status: 200, ...key }, T0 + 2_000), false);
});
