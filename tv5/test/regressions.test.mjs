import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { db } from '../db.mjs';
import { saveRule } from '../alerts.mjs';
import { listAlerts } from '../alerts.mjs';
import { listReports } from '../reports.mjs';

test.after(() => db.end());

test('DATABASE_URL selects the shared database ahead of legacy PG settings', () => {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { db } from './db.mjs';
    const client = new db.Client(db.options);
    assert.equal(client.connectionParameters.host, 'shared.test');
    assert.equal(client.connectionParameters.port, 5433);
    assert.equal(client.connectionParameters.database, 'team_db');
    assert.equal(client.connectionParameters.user, 'team_user');
    await db.end();
  `], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, DATABASE_URL: 'postgres://team_user:test@shared.test:5433/team_db',
      PGHOST: 'old.test', PGPORT: '5432', PGDATABASE: 'old_db', PGUSER: 'old_user' },
    stdio: 'pipe',
  });
});

test('legacy standalone PG settings still work without DATABASE_URL', () => {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { db } from './db.mjs';
    const client = new db.Client(db.options);
    assert.equal(client.connectionParameters.host, 'legacy.test');
    assert.equal(client.connectionParameters.database, 'demo_db');
    await db.end();
  `], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, DATABASE_URL: '', PGHOST: 'legacy.test', PGDATABASE: 'demo_db' },
    stdio: 'pipe',
  });
});

const id = '00000000-0000-4000-8000-000000000001';
const rule = {
  code: 'AI_TEST', name: 'Phát hiện bất thường', source: 'ML', condition: 'ANOMALY',
  severity: 'HIGH', high: 0.83, windowMinutes: 60, cooldownMinutes: 360,
};

test('saving an AI rule persists its custom anomaly threshold', async () => {
  let saved;
  const client = {
    async query(sql, values) {
      assert.match(sql, /UPDATE alert.alert_rules/);
      saved = values;
      return { rows: [{ rule_id: id }] };
    },
  };
  const options = { userId: id, runTransaction: run => run(client) };
  await saveRule(null, id, { ...rule, name: 'Tên đã đổi' }, options);
  assert.equal(saved[6], 0.83);
  for (const high of [0, 1, null]) {
    await saveRule(null, id, { ...rule, high }, options);
    assert.equal(saved[6], high);
  }
});

test('out-of-range anomaly thresholds are rejected before writing', async () => {
  for (const high of [-0.01, 1.01]) {
    await assert.rejects(saveRule(null, id, { ...rule, high }), { status: 400 });
  }
});

test('alert pages retain filters, total count and bound limit/offset', async () => {
  const client = {
    async query(sql, values) {
      assert.match(sql, /count\(\*\) OVER \(\)/);
      assert.match(sql, /ORDER BY created_at DESC, alert_id/);
      assert.deepEqual(values, ['ACK', 'HIGH', null, 20, 100]);
      return { rows: [{ alert_id: id, __total: '125' }] };
    },
  };
  const result = await listAlerts(client, new URLSearchParams({status:'ACK',severity:'HIGH'}),
    {page:6,limit:20,offset:100});
  assert.deepEqual(result, {data:[{alert_id:id}],meta:{page:6,limit:20,total:125}});
});

test('an empty report page still returns its total for navigation', async () => {
  let calls = 0;
  const client = {
    async query(sql, values) {
      calls++;
      if (calls === 1) {
        assert.deepEqual(values,[20,140]);
        return {rows:[]};
      }
      assert.match(sql,/SELECT count\(\*\) AS total/);
      return {rows:[{total:'125'}]};
    },
  };
  assert.deepEqual(await listReports(client,{page:8,limit:20,offset:140}),
    {data:[],meta:{page:8,limit:20,total:125}});
});

test('standalone report callers keep the array response', async () => {
  const rows = [{report_id:id}];
  const client = { async query(sql) {
    assert.match(sql,/LIMIT 100$/);
    return {rows};
  }};
  assert.deepEqual(await listReports(client),rows);
});
