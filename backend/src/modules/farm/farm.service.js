// Khai báo tài nguyên + quy tắc nghiệp vụ của module farm (TV3).
import { z, zUuid, zCode, zText, zDate, zNum, nullable, ordered, AppError } from '../tv3-common/crud.js';
import * as Q from './farm.queries.js';

const lat = nullable(zNum(-90, 90));
const lng = nullable(zNum(-180, 180));

export const sites = {
  name: 'Khu thí nghiệm', table: 'farm.sites', pk: 'site_id', select: Q.SITES, orderBy: 't.site_code',
  schema: z.object({
    site_code: zCode,
    name: zText().min(1, 'Không được để trống'),
    organization_id: nullable(zUuid),
    province: nullable(zText(128)),
    district: nullable(zText(128)),
    latitude: lat,
    longitude: lng,
    elevation_m: nullable(zNum()),
    climate_zone: nullable(zText(64)),
  }),
  refs: { organization_id: ['iam.organizations', 'organization_id', 'Tổ chức'] },
  filters: {
    province: { sql: 't.province = $?' },
    q: { sql: "(t.site_code ILIKE '%' || $? || '%' OR t.name ILIKE '%' || $? || '%')" },
  },
};

export const PLOT_STATUS = ['ACTIVE', 'FALLOW', 'INACTIVE', 'RETIRED'];

export const plots = {
  name: 'Ô thí nghiệm', table: 'farm.plots', pk: 'plot_id', select: Q.PLOTS, orderBy: 't.site_code, t.plot_code',
  schema: z.object({
    site_id: zUuid,
    plot_code: zCode,
    area_m2: zNum().positive('Diện tích phải > 0'),
    soil_type: zText(64).min(1, 'Không được để trống'),
    soil_texture: nullable(zText(64)),
    latitude: lat,
    longitude: lng,
    boundary_geojson: nullable(z.object({ type: z.string() }).passthrough()),
    block_no: nullable(z.coerce.number().int().min(1)),
    status: z.enum(PLOT_STATUS).optional(),
  }),
  refs: { site_id: ['farm.sites', 'site_id', 'Khu thí nghiệm'] },
  filters: {
    site_id: { sql: 't.site_id = $?', type: 'uuid' },
    site_code: { sql: 't.site_code = $?' },
    plot_code: { sql: 't.plot_code = $?' },
    status: { sql: 't.status = $?', values: PLOT_STATUS },
    q: { sql: "t.plot_code ILIKE '%' || $? || '%'" },
  },
  // Ô đang có nghiệm thức hiệu lực thì không cho ngừng sử dụng (RETIRED/INACTIVE)
  async check(row, { existing }) {
    if (existing && ['RETIRED', 'INACTIVE'].includes(row.status) && row.status !== existing.status
        && existing.current_treatment_id) {
      throw AppError.conflict(`Ô ${existing.plot_code} đang áp dụng nghiệm thức ${existing.current_treatment_code}, `
        + 'hãy kết thúc nghiệm thức (effective_to) trước khi ngừng sử dụng ô');
    }
  },
};

export const crops = {
  name: 'Cây trồng', table: 'farm.crops', pk: 'crop_id', select: Q.CROPS, orderBy: 't.crop_code',
  schema: z.object({
    crop_code: zCode,
    name_vi: zText(128).min(1, 'Không được để trống'),
    scientific_name: nullable(zText(128)),
    variety: nullable(zText(128)),
  }),
  filters: { q: { sql: "(t.crop_code ILIKE '%' || $? || '%' OR t.name_vi ILIKE '%' || $? || '%')" } },
};

export const cropSeasons = {
  name: 'Mùa vụ', table: 'farm.crop_seasons', pk: 'crop_season_id', select: Q.CROP_SEASONS,
  orderBy: 't.planted_on DESC, t.plot_code',
  schema: z.object({
    plot_id: zUuid,
    crop_id: zUuid,
    season_code: zCode,
    planted_on: zDate,
    harvested_on: nullable(zDate),
    planting_density: nullable(zNum(0)),
    notes: nullable(zText(2000)),
  }),
  refs: {
    plot_id: ['farm.plots', 'plot_id', 'Ô thí nghiệm'],
    crop_id: ['farm.crops', 'crop_id', 'Cây trồng'],
  },
  filters: {
    plot_id: { sql: 't.plot_id = $?', type: 'uuid' },
    plot_code: { sql: 't.plot_code = $?' },
    crop_id: { sql: 't.crop_id = $?', type: 'uuid' },
  },
  // Ngày thu hoạch sau ngày trồng; một ô không có 2 mùa vụ chồng thời gian
  async check(row, { client, existing }) {
    ordered(row, 'planted_on', 'harvested_on');
    const { rows } = await client.query(
      `SELECT season_code FROM farm.crop_seasons
       WHERE plot_id = $1 AND crop_season_id IS DISTINCT FROM $2
         AND daterange(planted_on, COALESCE(harvested_on, 'infinity'::date), '[]')
          && daterange($3::date, COALESCE($4::date, 'infinity'::date), '[]')`,
      [row.plot_id, existing?.crop_season_id ?? null, row.planted_on, row.harvested_on ?? null],
    );
    if (rows[0]) throw AppError.conflict(`Thời gian trùng với mùa vụ ${rows[0].season_code} của cùng ô`);
  },
};
