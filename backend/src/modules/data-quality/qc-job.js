import{query}from'../../config/db.js';
const minutes=Math.max(1,Number(process.env.QC_INTERVAL_MINUTES||60));let timer;let active=false;
async function run(){if(active)return;active=true;try{const end=new Date(),start=new Date(end.getTime()-minutes*60_000);await query('SELECT data_quality.run_sensor_checks($1,$2)',[start.toISOString(),end.toISOString()]);console.log('QC hoàn tất',start.toISOString(),end.toISOString());}catch(e){console.error('QC thất bại:',e.message);}finally{active=false;}}
export function startQcJob(){if(process.env.QC_JOB_ENABLED==='false')return;timer=setInterval(run,minutes*60_000);timer.unref();void run();}export function stopQcJob(){if(timer)clearInterval(timer);}
