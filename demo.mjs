import {simulate} from './harness.mjs';
console.log('SIMULACIÓN LOCAL: no ejecuta n8n, no consulta APIs y no envía emails.\n');
for(const [name,options] of [['Aprobada',{}],['Rechazada',{approval:'rejected'}],['Sin respuesta',{approval:'pending'}],['API IA caída',{failNode:'Generar propuesta IA'}],['Gmail ambiguo',{failNode:'Enviar propuesta aprobada'}]]){
 const r=simulate(options);console.log(JSON.stringify({caso:name,respuesta_http:r.responses[0].status,estado:r.records[0]?.fields.State,correos_al_cliente:r.mails.filter(m=>m.node==='Enviar propuesta aprobada').length,consultas_de_aprobacion:r.polls},null,2));
}
