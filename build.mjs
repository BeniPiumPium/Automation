import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLead, validateConfig, makePrompt, parseDraft, approvalDecision } from './core.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
const configFile = arg('--config', 'config.example.json');
const config = JSON.parse(fs.readFileSync(path.resolve(root, configFile), 'utf8'));
if (args.includes('--config')) validateConfig(config);
const out = path.resolve(root, arg('--out', '.'));
fs.mkdirSync(out, { recursive: true });
let nodes = [], connections = {};
const expr = value => '={{ ' + value + ' }}';
const ref = name => `$('${name}').first().json`;
const cfg = ref('Configuracion');
const lead = ref('Validar consulta') + '.lead';
const receipt = ref('Registrar solicitud') + '.records[0]';
const draft = ref('Validar borrador');
function node(name, type, parameters, options={}) {
  const result = { parameters, id: name.toLowerCase().replace(/[^a-z0-9]+/g,'-'), name, type: 'n8n-nodes-base.'+type, typeVersion: { code:2, if:2.2, httpRequest:4.2, gmail:2.1, webhook:2, respondToWebhook:1.4, wait:1.1, stickyNote:1, stopAndError:1 }[type] || 1, position:[nodes.length*260,0], ...options };
  nodes.push(result); return result;
}
function link(from, to, output=0) {
  connections[from] ||= { main:[] };
  while (connections[from].main.length <= output) connections[from].main.push([]);
  connections[from].main[output].push({node:to,type:'main',index:0});
}
function code(name, jsCode, fail=true) { return node(name,'code',{jsCode},fail?{onError:'continueErrorOutput'}:{}); }
function iff(name, condition) { return node(name,'if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'condition',leftValue:expr(condition),rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}); }
function http(name, method, url, body, provider='airtable', retry=true) {
  return node(name,'httpRequest',{
    method, url:expr(url), authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
    ...(body?{sendBody:true,specifyBody:'json',jsonBody:expr(body)}:{}),
    options:{timeout:15000}
  },{credentials:{httpHeaderAuth:{name:provider==='airtable'?'Airtable - Bearer':'OpenAI - Bearer'}},onError:'continueErrorOutput',retryOnFail:retry,maxTries:3,waitBetweenTries:5000});
}
const table = key => `'https://api.airtable.com/v0/' + ${cfg}.airtable_base_id + '/' + encodeURIComponent(${cfg}.${key})`;
const recordUrl = `${table('leads_table')} + '/' + ${receipt}.id`;
function gmail(name,to,subject,message) {
  return node(name,'gmail',{resource:'message',operation:'send',sendTo:expr(to),subject:expr(subject),emailType:'text',message:expr(message),options:{appendAttribution:false}}, {credentials:{gmailOAuth2:{name:'Gmail - Negocio'}},onError:'continueErrorOutput',retryOnFail:false});
}
function respond(name, status, body) {return node(name,'respondToWebhook',{respondWith:'json',responseBody:expr(body),options:{responseCode:status}});}

node('Recibir lead','webhook',{httpMethod:'POST',path:'gympredict-leads',authentication:'headerAuth',responseMode:'responseNode',options:{}},{webhookId:'gympredict-leads-v1',credentials:{httpHeaderAuth:{name:'Ingreso - API Key'}}});
code('Validar consulta',`${validateLead.toString()}\nreturn [{json:validateLead($json.body)}];`,false);
iff('Consulta valida', '$json.valid === true');
respond('Rechazar datos invalidos',400,`({status:'invalid', errors:${ref('Validar consulta')}.errors})`);
code('Configuracion',`return [{json:${JSON.stringify(config,null,2)}}];`,false);
code('Verificar configuracion',`${validateConfig.toString()}\nreturn [{json:validateConfig($json)}];`);
http('Buscar duplicado','GET',`${table('leads_table')} + '?maxRecords=1&filterByFormula=' + encodeURIComponent('{EventId}=' + JSON.stringify(${lead}.event_id))`);
iff('Solicitud ya registrada','Array.isArray($json.records) && $json.records.length > 0');
respond('Confirmar duplicado',200,`({status:'duplicate',event_id:${lead}.event_id,state:${ref('Buscar duplicado')}.records[0].fields.State})`);
http('Registrar solicitud','PATCH',table('leads_table'),`({performUpsert:{fieldsToMergeOn:['EventId']},records:[{fields:{EventId:${lead}.event_id,Name:${lead}.name,Email:${lead}.email,Message:${lead}.message,Consent:true,State:'processing',Approval:'pending',ExecutionId:String($execution.id),CreatedAt:new Date().toISOString()}}]})`);
respond('Acusar recibo',202,`({status:'processing',event_id:${lead}.event_id})`);
http('Recuperar memoria','GET',`${table('leads_table')} + '?maxRecords=' + ${cfg}.max_history + '&sort%5B0%5D%5Bfield%5D=CreatedAt&sort%5B0%5D%5Bdirection%5D=desc&filterByFormula=' + encodeURIComponent('AND({Email}=' + JSON.stringify(${lead}.email) + ',{State}="sent")')`);
http('Recuperar conocimiento','GET',`${table('knowledge_table')} + '?maxRecords=' + ${cfg}.max_knowledge + '&sort%5B0%5D%5Bfield%5D=UpdatedAt&sort%5B0%5D%5Bdirection%5D=desc&filterByFormula=' + encodeURIComponent('{Active}=TRUE()')`);
code('Construir prompt con memoria',`${makePrompt.toString()}\nreturn [{json:makePrompt(${lead},${ref('Recuperar memoria')},$json,${cfg})}];`);
http('Generar propuesta IA','POST',"'https://api.openai.com/v1/chat/completions'",'$json.request','openai',false);
code('Validar borrador',`${parseDraft.toString()}\nconst d=parseDraft($json,${ref('Construir prompt con memoria')}.source_ids);\nreturn [{json:{...d,record_id:${receipt}.id,event_id:${lead}.event_id,email:${lead}.email,deadline:new Date(Date.now()+${cfg}.approval_ttl_hours*3600000).toISOString()}}];`);
http('Guardar propuesta pendiente','PATCH',recordUrl,`({fields:{State:'pending_approval',Approval:'pending',Reviewer:'',ProposalSubject:${draft}.subject,ProposalBody:${draft}.body,Summary:${draft}.summary,Score:${draft}.score,SourceIds:JSON.stringify(${draft}.source_ids),MissingInfo:JSON.stringify(${draft}.missing_info),ApprovalDeadline:${draft}.deadline}})`);
gmail('Avisar al revisor',`${cfg}.reviewer_email`,`'Revisar propuesta: ' + ${lead}.event_id`,`${cfg}.business_name + '\\nDestinatario: ' + ${draft}.email + '\\nAsunto: ' + ${draft}.subject + '\\n\\n' + ${draft}.body + '\\n\\nFaltantes: ' + JSON.stringify(${draft}.missing_info) + '\\nFuentes: ' + JSON.stringify(${draft}.source_ids) + '\\n\\nAbrí la vista privada: ' + ${cfg}.review_url + '\\nBuscá EventId ' + ${draft}.event_id + '. Revisá el texto, completá Reviewer y cambiá Approval a approved o rejected. No edites el borrador: si cambia, el flujo se bloquea. Vence: ' + ${draft}.deadline`);
node('Esperar decision humana','wait',{resume:'timeInterval',amount:expr(`${cfg}.poll_seconds`),unit:'seconds'},{webhookId:'gympredict-wait-v1'});
http('Leer decision en Airtable','GET',recordUrl);
code('Evaluar aprobacion',`${approvalDecision.toString()}\nreturn [{json:approvalDecision($json,${draft},Date.now())}];`);
iff('Aprobada por humano',"$json.decision === 'approved'");
iff('Sigue pendiente',"$json.decision === 'pending'");
http('Cerrar sin envio','PATCH',recordUrl,`({fields:{State:${ref('Evaluar aprobacion')}.decision,DecisionReason:${ref('Evaluar aprobacion')}.reason,CompletedAt:new Date().toISOString()}})`);
http('Marcar enviando','PATCH',recordUrl,`({fields:{State:'sending',Reviewer:${ref('Evaluar aprobacion')}.reviewer,ApprovedAt:new Date().toISOString()}})`);
gmail('Enviar propuesta aprobada',`${draft}.email`,`${draft}.subject`,`${draft}.body`);
code('Verificar confirmacion Gmail',"if (!$json.id) throw new Error('GMAIL_MISSING_MESSAGE_ID'); return [{json:$json}];");
http('Confirmar envio en memoria','PATCH',recordUrl,`({fields:{State:'sent',GmailMessageId:${ref('Verificar confirmacion Gmail')}.id,CompletedAt:new Date().toISOString()}})`);

// Ruta local de errores. Datos sanitizados: nunca copia tokens, consultas o respuestas de APIs.
code('Preparar incidencia',`const get = name => {try{return $(name).first().json;}catch{return null;}};
const receipt=get('Registrar solicitud')?.records?.[0];
const sendStarted=!!get('Marcar enviando');
const sent=get('Verificar confirmacion Gmail')?.id;
return [{json:{record_id:receipt?.id || '',event_id:get('Validar consulta')?.lead?.event_id || '',execution_id:String($execution.id),state:sent?'sent_unconfirmed':sendStarted?'delivery_unknown':'failed',reason:sent?'GMAIL_SENT_DB_UNCONFIRMED':sendStarted?'CHECK_GMAIL_BEFORE_ANY_RETRY':'WORKFLOW_FAILED',at:new Date().toISOString()}}];`,false);
iff('Existe registro para error',"Boolean($json.record_id)");
const incident=ref('Preparar incidencia');
const markError=http('Marcar solicitud con error','PATCH',`${table('leads_table')} + '/' + ${incident}.record_id`,`({fields:{State:${incident}.state,DecisionReason:${incident}.reason}})`);
markError.onError='continueRegularOutput';
const log=http('Registrar incidencia','PATCH',table('errors_table'),`({performUpsert:{fieldsToMergeOn:['ExecutionId']},records:[{fields:{ExecutionId:${incident}.execution_id,EventId:${incident}.event_id,State:${incident}.state,Reason:${incident}.reason,CreatedAt:${incident}.at}}]})`);
log.onError='continueRegularOutput';
const alert=gmail('Alertar fallo al responsable',`${cfg}.reviewer_email`,`'Incidencia de automatizacion ' + ${incident}.execution_id`,`'Estado: ' + ${incident}.state + '\\nMotivo: ' + ${incident}.reason + '\\nEventId: ' + ${incident}.event_id + '\\nRevisá la ejecución ' + ${incident}.execution_id + ' en n8n. Si figura delivery_unknown o sent_unconfirmed, verificá Enviados de Gmail antes de reintentar. No hay reenvío automático.'`);
alert.onError='continueRegularOutput';
respond('Responder fallo si corresponde',503,`({status:'failed',event_id:${incident}.event_id})`);
node('Finalizar con error auditable','stopAndError',{errorMessage:expr(`${incident}.reason`)});

for(const [a,b,o] of [
 ['Recibir lead','Validar consulta'],['Validar consulta','Consulta valida'],['Consulta valida','Configuracion',0],['Consulta valida','Rechazar datos invalidos',1],['Configuracion','Verificar configuracion'],['Verificar configuracion','Buscar duplicado'],['Buscar duplicado','Solicitud ya registrada'],['Solicitud ya registrada','Confirmar duplicado',0],['Solicitud ya registrada','Registrar solicitud',1],['Registrar solicitud','Acusar recibo'],['Acusar recibo','Recuperar memoria'],['Recuperar memoria','Recuperar conocimiento'],['Recuperar conocimiento','Construir prompt con memoria'],['Construir prompt con memoria','Generar propuesta IA'],['Generar propuesta IA','Validar borrador'],['Validar borrador','Guardar propuesta pendiente'],['Guardar propuesta pendiente','Avisar al revisor'],['Avisar al revisor','Esperar decision humana'],['Esperar decision humana','Leer decision en Airtable'],['Leer decision en Airtable','Evaluar aprobacion'],['Evaluar aprobacion','Aprobada por humano'],['Aprobada por humano','Marcar enviando',0],['Aprobada por humano','Sigue pendiente',1],['Sigue pendiente','Esperar decision humana',0],['Sigue pendiente','Cerrar sin envio',1],['Marcar enviando','Enviar propuesta aprobada'],['Enviar propuesta aprobada','Verificar confirmacion Gmail'],['Verificar confirmacion Gmail','Confirmar envio en memoria'],['Preparar incidencia','Existe registro para error'],['Existe registro para error','Marcar solicitud con error',0],['Existe registro para error','Registrar incidencia',1],['Marcar solicitud con error','Registrar incidencia'],['Registrar incidencia','Alertar fallo al responsable'],['Alertar fallo al responsable','Responder fallo si corresponde'],['Responder fallo si corresponde','Finalizar con error auditable']
]) link(a,b,o||0);
for(const n of nodes) if(n.onError==='continueErrorOutput') link(n.name,'Preparar incidencia',1);

// Canvas legible: cuatro filas funcionales, más errores en una fila separada.
const rows = [
 ['Recibir lead','Validar consulta','Consulta valida','Configuracion','Verificar configuracion','Buscar duplicado','Solicitud ya registrada','Registrar solicitud','Acusar recibo'],
 ['Recuperar memoria','Recuperar conocimiento','Construir prompt con memoria','Generar propuesta IA','Validar borrador','Guardar propuesta pendiente','Avisar al revisor'],
 ['Esperar decision humana','Leer decision en Airtable','Evaluar aprobacion','Aprobada por humano','Marcar enviando','Enviar propuesta aprobada','Verificar confirmacion Gmail','Confirmar envio en memoria'],
 ['Preparar incidencia','Existe registro para error','Marcar solicitud con error','Registrar incidencia','Alertar fallo al responsable','Responder fallo si corresponde','Finalizar con error auditable']
];
rows.forEach((row,y)=>row.forEach((name,x)=>nodes.find(n=>n.name===name).position=[x*270,y*500]));
for(const [name,x,y] of [['Rechazar datos invalidos',540,200],['Confirmar duplicado',1620,200],['Sigue pendiente',810,1200],['Cerrar sin envio',1080,1200]]) nodes.find(n=>n.name===name).position=[x,y];
node('LEER ANTES DE ACTIVAR','stickyNote',{content:'## GymPredict · Entrega final\n4 tecnologías: n8n + Airtable + OpenAI + Gmail.\nImportar, completar Configuracion y asociar 4 credenciales.\nHITL: editar Approval y Reviewer en Airtable privado.\nLos nodos Gmail no reintentan para evitar envíos duplicados.\nVer README y docs/INSTALACION.md. No se incluyen credenciales.',height:260,width:540},{position:[0,-350]});
const main={name:'GymPredict - Leads IA con memoria y HITL',nodes,connections,active:false,settings:{executionOrder:'v1',saveDataErrorExecution:'all',saveDataSuccessExecution:'all',saveExecutionProgress:true,timezone:'America/Argentina/Buenos_Aires'},pinData:{},tags:[]};
fs.writeFileSync(path.join(out,'01-leads-ia.json'),JSON.stringify(main,null,2)+'\n');

// Respaldo para fallos inesperados no cubiertos por las ramas locales.
nodes=[];connections={};
node('Error inesperado','errorTrigger',{});
code('Configuracion',`return [{json:${JSON.stringify(config,null,2)}}];`,false);
code('Resumir incidente',`const e=$('Error inesperado').first().json;return [{json:{id:String(e.execution?.id||'activation'),workflow:e.workflow?.name||'desconocido',node:e.execution?.lastNodeExecuted||'trigger',reason:'UNEXPECTED_ERROR'}}];`,false);
const fallback=gmail('Avisar error inesperado',`${cfg}.reviewer_email`,"'Fallo de automatizacion: ' + $json.workflow","'Ejecución: ' + $json.id + '\\nNodo: ' + $json.node + '\\nRevisar n8n. No reintentar envíos sin comprobar Gmail.'");
fallback.onError='stopWorkflow';
link('Error inesperado','Configuracion');link('Configuracion','Resumir incidente');link('Resumir incidente','Avisar error inesperado');
const errors={name:'GymPredict - Respaldo de errores',nodes,connections,active:false,settings:{executionOrder:'v1',saveDataErrorExecution:'all'},pinData:{},tags:[]};
fs.writeFileSync(path.join(out,'02-error-handler.json'),JSON.stringify(errors,null,2)+'\n');
console.log(`Generados 2 workflows en ${out}`);
