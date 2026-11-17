// Simulador de contratos del grafo exportado. No es el motor de n8n ni usa APIs reales.
import fs from 'node:fs';
export function simulate(options={}) {
  const workflow=JSON.parse(fs.readFileSync(new URL('./01-leads-ia.json',import.meta.url),'utf8'));
  const config={business_name:'Negocio de prueba',airtable_base_id:'appTEST123',leads_table:'Solicitudes',knowledge_table:'Conocimiento',errors_table:'Incidencias',review_url:'https://airtable.com/appTEST123',reviewer_email:'reviewer@example.com',model:'gpt-4o-mini',poll_seconds:300,approval_ttl_hours:1,max_history:5,max_knowledge:20,max_output_tokens:1500};
  const body=options.body||{event_id:'demo-0001',name:'Cliente Demo',email:'cliente@example.com',message:'Quiero conocer el servicio de prediccion de alumnos.',consent:true};
  let clock=Date.parse('2026-11-17T12:00:00.000Z');
  const NativeDate=Date;
  class ClockDate extends NativeDate {constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;}}
  let current='Recibir lead', input={body}, steps=0,polls=0;
  const outputs=new Map(), records=options.duplicate?[{id:'recOld',fields:{EventId:body.event_id,State:'sent'}}]:[];
  const mails=[], responses=[], trace=[], calls=[], failures={};
  const $ = name => ({first(){if(!outputs.has(name))throw new Error('Node not executed');return {json:outputs.get(name)};}});
  const evaluate=(value,data=input)=> typeof value==='string' && value.startsWith('={{ ') ? new Function('$','$json','$execution','Date','return ('+value.slice(4,-3)+');')($,data,{id:'exec-1'},ClockDate):value;
  const defaultDraft={summary:'Consulta comercial',score:75,subject:'Información del servicio',body:'Hola, ofrecemos una demo de predicción de alumnos. ¿Cuántos alumnos tiene tu gimnasio?',source_ids:['recKnowledge'],missing_info:['Cantidad actual de alumnos']};
  let stopped=false;
  while(current && steps++<250) {
    const n=workflow.nodes.find(n=>n.name===current);trace.push(n.name);let branch=0, result=input;
    try {
      if(n.name==='Configuracion')result=config;
      else if(n.type.endsWith('.webhook'))result={body};
      else if(n.type.endsWith('.code')) result=new Function('$','$json','$execution','Date',n.parameters.jsCode)($,input,{id:'exec-1'},ClockDate)[0].json;
      else if(n.type.endsWith('.if')) branch=evaluate(n.parameters.conditions.conditions[0].leftValue)?0:1;
      else if(n.type.endsWith('.respondToWebhook')) {if(!responses.length)responses.push({status:n.parameters.options.responseCode,body:evaluate(n.parameters.responseBody)});}
      else if(n.type.endsWith('.wait')) {clock+=evaluate(n.parameters.amount)*1000;}
      else if(n.type.endsWith('.httpRequest')) {
        const url=evaluate(n.parameters.url); const payload=n.parameters.sendBody?evaluate(n.parameters.jsonBody):null;
        calls.push({node:n.name,url,payload,method:n.parameters.method});
        if(options.failNode===n.name) { failures[n.name]=(failures[n.name]||0)+1;throw new Error('Simulated provider failure'); }
        if(n.name==='Generar propuesta IA')result=options.aiResponse||{choices:[{finish_reason:'stop',message:{content:JSON.stringify(options.draft||defaultDraft)}}]};
        else if(n.name==='Recuperar conocimiento')result={records:options.emptyKnowledge?[]:[{id:'recKnowledge',fields:{Active:true,Title:'Demo',Content:'Ofrecemos una demo de predicción de alumnos.'}}]};
        else if(n.name==='Recuperar memoria')result={records:options.history||[]};
        else if(n.name==='Buscar duplicado')result={records:records.filter(r=>r.fields.EventId===body.event_id)};
        else if(n.name==='Registrar solicitud') {const r={id:'recLead',fields:{...payload.records[0].fields}};records.push(r);result={records:[structuredClone(r)]};}
        else if(n.name==='Registrar incidencia')result={records:[{id:'recIncident',fields:payload.records[0].fields}]};
        else if(n.name==='Leer decision en Airtable') {
          polls++;const r=records.at(-1);
          r.fields.Approval=polls <= (options.pendingPolls||0)?'pending':(options.approval||'approved');
          if(r.fields.Approval==='approved')r.fields.Reviewer=options.noReviewer?'':'Revisor Demo';
          if(options.tamper)r.fields.ProposalBody='Texto distinto';
          result=structuredClone(r);
        } else { const r=records.at(-1);Object.assign(r.fields,payload.fields);result=structuredClone(r); }
      } else if(n.type.endsWith('.gmail')) {
        if(options.failNode===n.name)throw new Error('Simulated Gmail failure');
        const mail={node:n.name,to:evaluate(n.parameters.sendTo),subject:evaluate(n.parameters.subject),body:evaluate(n.parameters.message)};
        mails.push(mail);result=options.missingGmailId&&n.name==='Enviar propuesta aprobada'?{}:{id:'mail-'+mails.length};
      } else if(n.type.endsWith('.stopAndError')) { stopped=true; break; }
      else throw new Error('Unknown node '+n.type);
      outputs.set(n.name,structuredClone(result));
    } catch(e) {
      if(n.onError==='continueErrorOutput'){branch=1;result={error:{message:e.message}};outputs.set(n.name,result);}
      else if(n.onError==='continueRegularOutput'){result={error:{message:e.message}};outputs.set(n.name,result);}
      else throw e;
    }
    input=result;current=workflow.connections[n.name]?.main[branch]?.[0]?.node;
  }
  if(steps>=250)throw new Error('Unbounded loop');
  return {records,mails,responses,trace,calls,stopped,polls,workflow,outputs};
}
