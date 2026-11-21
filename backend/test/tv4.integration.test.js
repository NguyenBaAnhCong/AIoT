import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/config/db.js';
import * as quality from '../src/modules/data-quality/data-quality.service.js';
import * as datasets from '../src/modules/dataset/dataset.service.js';

test('TV4 reads actual QC rules, issue pages, statistics and acceptance KPIs', async () => {
  const rules = await quality.rules();
  assert.ok(rules.length > 0);
  const issues = await quality.issues({limit: 5, offset: 0});
  assert.ok(issues.total >= issues.rows.length);
  assert.ok(issues.rows.length <= 5);
  const stats = await quality.stats();
  assert.ok(stats.summary.observations >= stats.summary.valid);
  const kpis = await quality.kpis();
  assert.deepEqual(kpis.map(x => x.kpi_code).sort(), ['ERROR_DUPLICATE_PCT','MISSING_AFTER_QC_PCT','VALID_OBSERVATIONS']);
});

test('TV4 dataset readiness and CSV source enforce the frozen valid version', async () => {
  const rows = await datasets.list();
  assert.ok(rows.length > 0);
  const versions = await datasets.versions(rows[0].dataset_id);
  assert.ok(versions.length > 0);
  const version = versions[0];
  const readiness = await datasets.readiness(version.dataset_version_id);
  assert.equal(readiness.status, 'FROZEN');
  assert.equal(Number(readiness.leaking_groups), 0);
  const exported = await datasets.exportRows(version.dataset_version_id);
  assert.equal(exported.rows.length, Number(readiness.valid_records));
  const records = await datasets.records(version.dataset_version_id, {limit: 5, offset: 0, valid: 'true'});
  assert.ok(records.total >= records.rows.length);
  assert.ok(records.rows.length <= 5);
  assert.ok(records.rows.every((record) => record.valid_flag));
  await assert.rejects(datasets.build(version.dataset_version_id), {status: 409});
  await assert.rejects(datasets.label(version.dataset_version_id, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'), {status: 409});
});

test('TV4 label distribution groups all labeled records and sorts by health class', async () => {
  const rows = await datasets.list();
  const versions = await datasets.versions(rows[0].dataset_id);
  const version = versions.find(row => row.status === 'FROZEN');
  assert.ok(version);
  const distribution = await datasets.distribution(version.dataset_version_id);
  const { rows: [count] } = await pool.query(
    'SELECT count(*)::int AS total FROM dataset.dataset_records WHERE dataset_version_id=$1 AND label_id IS NOT NULL',
    [version.dataset_version_id],
  );
  assert.equal(distribution.reduce((total, group) => total + group.count, 0), count.total);
  const { rows: labels } = await pool.query('SELECT label_code,class_order FROM dataset.labels WHERE label_set=$1', ['SOIL_HEALTH']);
  const orders = new Map(labels.map(row => [row.label_code, row.class_order]));
  for (let index = 1; index < distribution.length; index++) {
    assert.ok(orders.get(distribution[index - 1].label_code) <= orders.get(distribution[index].label_code));
  }
});

test('TV4 rejects missing dataset versions and invalid QC ranges', async () => {
  await assert.rejects(datasets.readiness('00000000-0000-4000-8000-000000000000'), {status:404});
  await assert.rejects(quality.run('2026-09-01T00:00:00Z','2026-08-01T00:00:00Z',null), {status:400});
});

test.after(async () => { await pool.end(); });
