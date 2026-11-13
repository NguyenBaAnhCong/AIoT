import { query, withUserTx } from '../../config/db.js';
import { AppError } from '../../utils/AppError.js';
import * as q from './data-quality.queries.js';

const nullable = (v) => v === undefined || v === '' ? null : v;
const validDate = (v, name) => { const d = new Date(v); if (!v || Number.isNaN(d.valueOf())) throw AppError.badRequest(`${name} không hợp lệ`); return d.toISOString(); };
export async function rules(){ return (await query(q.rulesSql)).rows; }
export async function createRule(b){
  if(!b.rule_code||!b.name||!b.rule_type) throw AppError.badRequest('Cần rule_code, name và rule_type');
  const {rows}=await query(q.createRuleSql,[b.rule_code,b.name,b.target||'SENSOR_READING',b.rule_type,nullable(b.parameter_code),nullable(b.min_value),nullable(b.max_value),nullable(b.max_delta),nullable(b.window_minutes),b.severity||'ERROR',b.is_active,b.description||null]); return rows[0];
}
export async function updateRule(id,b){ const {rows}=await query(q.updateRuleSql,[id,b.name??null,b.min_value??null,b.max_value??null,b.max_delta??null,b.window_minutes??null,b.severity??null,b.is_active??null,b.description??null]); if(!rows[0]) throw AppError.notFound('Không tìm thấy QC rule'); return rows[0]; }
export async function run(from,to,userId,maxDelay='7 days'){
  const a=validDate(from,'from'), b=validDate(to,'to'); if(new Date(b)<=new Date(a)) throw AppError.badRequest('to phải sau from');
  const {rows}=await withUserTx(userId, c=>c.query(q.runChecksSql,[a,b,maxDelay,userId||null]),{reason:'Chạy QC sensor'}); return rows[0];
}
export async function issues(filters){const args=[nullable(filters.type),nullable(filters.status),nullable(filters.sensor_id),nullable(filters.plot_id),nullable(filters.from),nullable(filters.to)]; const [list,count]=await Promise.all([query(q.issuesSql,[...args,filters.limit,filters.offset]),query(q.issueCountSql,args)]);return {rows:list.rows,total:count.rows[0].total};}
export async function issueAction(id,action,body,userId){
 const allowed={confirm:'CONFIRMED',ignore:'IGNORED',correct:'CORRECTED'}; if(!allowed[action]) throw AppError.badRequest('Thao tác issue không hợp lệ');
 return withUserTx(userId,async c=>{
  const {rows}=await c.query(q.issueSql,[id]); const issue=rows[0]; if(!issue) throw AppError.notFound('Không tìm thấy issue');
  if(issue.status!=='OPEN') throw AppError.conflict('Issue đã được xử lý');
  if(action==='correct'){
   if(issue.source_table!=='iot.sensor_readings'||!issue.source_record_id||!issue.observed_at) throw AppError.badRequest('Issue này không tham chiếu sensor reading có thể sửa');
   const fields=['ph','ec','soil_moisture','soil_temperature','n','p','k']; const values=fields.map(k=>body.values?.[k]===undefined?null:Number(body.values[k]));
   if(!values.some(v=>v!==null)||values.some(v=>v!==null&&!Number.isFinite(v))) throw AppError.badRequest('Cần ít nhất một giá trị sửa hợp lệ');
   const reading=await c.query(q.correctionSql,[Number(issue.source_record_id),issue.observed_at,...values]); if(!reading.rows[0]) throw AppError.notFound('Sensor reading không còn tồn tại');
  }
  const updated=await c.query(q.updateIssueSql,[id,allowed[action],userId||null]);
  await c.query(`INSERT INTO data_quality.data_audit(source_table,record_id,action,reason,old_value,new_value,actor_id,actor_type) VALUES ('data_quality.data_issues',$1,'UPDATE',$2,$3::jsonb,$4::jsonb,$5,$6)`,[String(id),body.reason||`Issue ${action}`,JSON.stringify({status:issue.status}),JSON.stringify({status:allowed[action]}),userId||null,userId?'USER':'SYSTEM']);
  return updated.rows[0];
 },{reason:body.reason||`Issue ${action}`});
}
export async function audit(filters){const args=[nullable(filters.source_table),nullable(filters.record_id)];const [list,count]=await Promise.all([query(q.auditSql,[...args,filters.limit,filters.offset]),query(q.auditCountSql,args)]);return {rows:list.rows,total:count.rows[0].total};}
export async function stats(from,to){let start=from,end=to;if(!start&&!end){const {rows}=await query(q.rangeSql);start=rows[0]?.from_at;end=rows[0]?.to_at;}const a=validDate(start,'from'),b=validDate(end,'to');if(new Date(b)<=new Date(a))throw AppError.badRequest('to phải sau from');const [s,d]=await Promise.all([query(q.qcStatsSql,[a,b]),query(q.dailySql,[a,b])]);return {from:a,to:b,summary:s.rows[0],daily:d.rows};}
export async function checks(){return (await query(`SELECT * FROM data_quality.quality_checks ORDER BY started_at DESC LIMIT 100`)).rows;}
export async function kpis(){return (await query(q.kpisSql)).rows;}
