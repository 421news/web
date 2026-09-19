#!/usr/bin/env node
// Test del período pagado (fecha de MP → expiry_at del comp). Corre sin red ni credenciales:
// extrae las funciones de server.js y las evalúa aisladas.
//   node scripts/mercadopago-ghost/test-expiry-anual.js
const fs=require('fs');
const src=fs.readFileSync(process.argv[2] || require("path").join(__dirname, "server.js"),'utf8');
function grabFn(name){                     // extrae una función completa contando llaves
  const i=src.indexOf(name); if(i<0) throw new Error('no encontrada: '+name);
  let j=src.indexOf('{',i), d=0, k=j;
  for(;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(d===0){k++;break;}} }
  return src.slice(i,k);
}
const consts = [/const isYearlyPlan = [^\n]+/, /const DIAS_GRACIA = [^\n]+/, /const DIA_MS = [^\n]+/].map(r => src.match(r)[0]).join('\n');
const code=[consts,grabFn('function sumarPeriodo'),grabFn('function pagadoHastaDeFacturas'),grabFn('function expiryAlActivar'),grabFn('function periodoPagoVigente')].join('\n');
const f=new Function(code+'; return {pagadoHastaDeFacturas,expiryAlActivar,periodoPagoVigente,DIAS_GRACIA};')();
const dia=86400000, hoy=Date.now(), G=f.DIAS_GRACIA;
const dias = iso => Math.round((new Date(iso)-hoy)/dia);
// facturas con la forma real de /authorized_payments/search
const fac = (debit, estado) => ({ debit_date: debit, payment: { status: estado } });
const MES = { frequency: 1, frequency_type: 'months' }, ANIO = { frequency: 12, frequency_type: 'months' };
const casos=[
 // fecha de MP: último cobro aprobado + frecuencia
 ['3 cobros aprobados (summarized decía 1) → último + 1 mes', f.pagadoHastaDeFacturas([fac('2026-04-23T14:10:32.000-04:00','approved'),fac('2026-03-23T14:00:10.000-04:00','approved'),fac('2026-02-23T13:54:10.000-04:00','approved')], MES).startsWith('2026-05-23')],
 ['cobro rechazado después NO extiende', f.pagadoHastaDeFacturas([fac('2026-06-01T10:00:00Z','approved'),fac('2026-07-01T10:00:00Z','rejected')], MES).startsWith('2026-07-01')],
 ['anual cobrado el 2025-10-02 → 2026-10-02', f.pagadoHastaDeFacturas([fac('2025-10-02T05:11:53.000-04:00','approved')], ANIO).startsWith('2026-10-02')],
 ['sin cobros aprobados → null', f.pagadoHastaDeFacturas([fac('2026-07-01T10:00:00Z','rejected')], MES)===null && f.pagadoHastaDeFacturas([], MES)===null],
 // al activar
 ['activar mensual NO lleva expiry', f.expiryAlActivar('wizard-monthly', new Date(hoy+30*dia).toISOString())===null],
 ['activar promo mensual NO lleva', f.expiryAlActivar('promo5-monthly', null)===null],
 ['activar anual con fecha de MP → esa fecha + gracia', dias(f.expiryAlActivar('wizard-yearly', new Date(hoy+200*dia).toISOString()))===200+G],
 ['activar anual sin dato de MP → 1 año + gracia', dias(f.expiryAlActivar('wizard-yearly', null))===365+G],
 ['activar mecenas anual también', typeof f.expiryAlActivar('mecenas-yearly', null)==='string'],
 ['activar anual con fecha de MP vencida → nunca en el pasado', dias(f.expiryAlActivar('wizard-yearly', new Date(hoy-50*dia).toISOString()))===G],
 // guarda al cancelar
 ['sin tiers -> null', f.periodoPagoVigente({})===null],
 ['tier sin expiry -> null', f.periodoPagoVigente({tiers:[{id:'x'}]})===null],
 ['expiry futuro -> lo devuelve', !!f.periodoPagoVigente({tiers:[{expiry_at:new Date(hoy+90*dia).toISOString()}]})],
 ['expiry vencido -> null (se puede dar de baja)', f.periodoPagoVigente({tiers:[{expiry_at:new Date(hoy-dia).toISOString()}]})===null],
 ['vencido + vigente -> gana el vigente', !!f.periodoPagoVigente({tiers:[{expiry_at:new Date(hoy-dia).toISOString()},{expiry_at:new Date(hoy+dia).toISOString()}]})],
];
let ok=0; for(const [n,r] of casos){ console.log((r?'✔':'✗')+' '+n); if(r)ok++; }
console.log(`\n${ok}/${casos.length}`);
process.exit(ok===casos.length?0:1);
