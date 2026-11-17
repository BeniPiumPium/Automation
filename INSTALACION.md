# Instalación y puesta en marcha

## 1. Qué necesitás

- Una instancia de n8n con acceso HTTPS y ejecuciones persistidas. Puede ser Cloud o una instalación propia.
- Una base de Airtable que puedas editar y un token limitado a esa base.
- Una API key de OpenAI con acceso al modelo configurado y saldo disponible. La suscripción de ChatGPT no reemplaza el acceso a la API.
- Una cuenta Gmail conectada mediante OAuth2 en n8n.
- Un email del responsable y una vista privada de revisión en Airtable.

No hace falta instalar Node.js para importar los JSON. Node.js solo se usa si querés regenerarlos o ejecutar las pruebas.

## 2. Crear la base de Airtable

Crear una base y tres tablas. Se incluyen CSV para importar encabezados; comprobar los tipos manualmente. No importar ejemplos de prueba como clientes reales.

### Tabla `Solicitudes`

| Campo | Tipo | Uso |
|---|---|---|
| EventId | Texto corto, campo principal | Identificador estable enviado por el origen |
| Name | Texto corto | Nombre del cliente |
| Email | Email | Destinatario validado |
| Message | Texto largo | Consulta original |
| Consent | Checkbox | Autorización para procesar y responder |
| State | Texto corto | Estado técnico del proceso |
| Approval | Selección única | Opciones exactas: `pending`, `approved`, `rejected` |
| Reviewer | Texto corto | Nombre de quien revisó |
| ProposalSubject | Texto corto | Asunto propuesto |
| ProposalBody | Texto largo | Mensaje propuesto |
| Summary | Texto largo | Resumen de la IA |
| Score | Número entero | Interés comercial entre 0 y 100 |
| SourceIds | Texto largo | IDs de las fuentes usadas, en JSON |
| MissingInfo | Texto largo | Datos faltantes, en JSON |
| ExecutionId | Texto corto | Identificador de ejecución de n8n |
| GmailMessageId | Texto corto | Identificador confirmado por Gmail |
| DecisionReason | Texto corto | Motivo del cierre o incidente |
| CreatedAt | Fecha con hora | Momento de recepción |
| ApprovalDeadline | Fecha con hora | Vencimiento de la aprobación |
| ApprovedAt | Fecha con hora | Momento de aprobación procesada |
| CompletedAt | Fecha con hora | Momento de finalización |

Usar nombres exactos, incluyendo mayúsculas. El modelo no genera nombres de campos. Activar hora en las columnas de fecha; usar UTC para facilitar las comparaciones.

### Tabla `Conocimiento`

| Campo | Tipo | Uso |
|---|---|---|
| Title | Texto corto, principal | Título del documento |
| Content | Texto largo | Información comercial verificada |
| Active | Checkbox | Habilita el documento |
| UpdatedAt | Fecha con hora | Prioridad por actualización |

Cargar al menos un documento activo. El CSV es material ficticio para la demostración: sustituirlo por servicios y políticas reales antes de atender clientes. No inventar precios para completar el ejemplo.

### Tabla `Incidencias`

| Campo | Tipo |
|---|---|
| ExecutionId | Texto corto, principal |
| EventId | Texto corto |
| State | Texto corto |
| Reason | Texto corto |
| CreatedAt | Fecha con hora |

Crear en `Solicitudes` una vista privada **Revisión**, filtrada por `State = pending_approval`, con Email, Message, ProposalSubject, ProposalBody, SourceIds, MissingInfo, ApprovalDeadline, Reviewer y Approval visibles. Copiar su URL en `review_url`.

Solo los revisores autorizados deben tener permisos de edición. No publicar esta vista ni habilitar formularios públicos que escriban `Approval`. `Reviewer` es una atribución operativa, no una firma autenticada: la identidad se respalda en el control de acceso y el historial de Airtable. Si el plan lo permite, restringir edición de los campos técnicos al usuario de integración.

## 3. Crear las cuatro credenciales en n8n

| Nombre sugerido | Tipo | Configuración |
|---|---|---|
| Ingreso - API Key | Header Auth | Name: `X-Lead-Key`; Value: secreto aleatorio propio |
| Airtable - Bearer | Header Auth | Name: `Authorization`; Value: `Bearer TU_TOKEN` |
| OpenAI - Bearer | Header Auth | Name: `Authorization`; Value: `Bearer TU_API_KEY` |
| Gmail - Negocio | Gmail OAuth2 | Iniciar sesión siguiendo la pantalla de n8n |

El token de Airtable necesita lectura y escritura de registros (`data.records:read`, `data.records:write`) únicamente en la base elegida. No hace falta permitir modificaciones de esquema para ejecutar el flujo.

Asociar las credenciales desde la interfaz después de importar. Los nombres del JSON no crean cuentas ni incluyen IDs reales. Las claves se guardan en el almacén de credenciales de n8n, nunca en los nodos Code ni en GitHub.

## 4. Importar los workflows

1. Importar `02-error-handler.json` y guardar.
2. Importar `01-leads-ia.json` y guardar.
3. Conectar las credenciales en todos los nodos que las soliciten.
4. En los ajustes del principal, elegir **GymPredict - Respaldo de errores** como Error Workflow. El ID depende de tu instancia, por eso no viene fijado en el archivo.
5. Completar el nodo `Configuracion` de ambos workflows con tus valores.
6. Mantener el principal inactivo hasta terminar la configuración y la prueba inicial.

El Error Trigger se comprueba con una ejecución de producción; una ejecución manual del editor no demuestra que esa integración esté configurada.

## 5. Configuración central

| Variable | Valor que debés ingresar |
|---|---|
| business_name | Nombre del negocio |
| airtable_base_id | ID que comienza con `app`, desde la documentación de tu base |
| leads_table | Nombre o ID de la tabla de solicitudes |
| knowledge_table | Nombre o ID de la tabla de conocimiento |
| errors_table | Nombre o ID de la tabla de incidencias |
| review_url | URL HTTPS privada de la vista en airtable.com |
| reviewer_email | Email real del responsable |
| model | Modelo de OpenAI compatible con JSON Schema estricto |
| approval_ttl_hours | Horas de validez, entero entre 1 y 48 |
| poll_seconds | Intervalo de revisión, entero entre 60 y 3600 |
| max_history | Cantidad de consultas previas, entre 1 y 20 |
| max_knowledge | Candidatos activos recuperados, entre 1 y 100 |
| max_output_tokens | Límite de salida de IA, entre 500 y 4000 |

El ejemplo usa `gpt-4o-mini`. Si tu cuenta no lo ofrece, configurar otro modelo compatible y comprobar su respuesta real. No se incluyen claves en esta configuración.

También podés copiar `config.example.json` a `config.local.json`, completar sus campos y ejecutar `npm run configure`. Esto produce los dos JSON personalizados en `dist/`, que está excluida de Git. Importar esos archivos en lugar de los ejemplos.

## 6. Enviar la primera consulta

Activar el workflow y copiar la **Production URL** del nodo `Recibir lead`. La ruta se llama `gympredict-leads`, pero el host y el prefijo los determina n8n; usar la URL que muestre la instancia.

Ejemplo en PowerShell:

```powershell
$leadUrl = Read-Host 'Pegá la Production URL del webhook'
$leadKey = Read-Host 'Clave X-Lead-Key' -AsSecureString
$leadCredential = [System.Management.Automation.PSCredential]::new('unused', $leadKey)
$leadHeaders = @{ 'X-Lead-Key' = $leadCredential.GetNetworkCredential().Password }
$leadJson = Get-Content -Raw -LiteralPath './lead-example.json'
Invoke-RestMethod -Uri $leadUrl -Method Post -Headers $leadHeaders -ContentType 'application/json' -Body $leadJson
```

Cambiar el email ficticio por una casilla propia antes de la prueba real. Generar un `event_id` nuevo para cada consulta distinta; reutilizarlo solamente si el origen reintenta la misma solicitud. No poner la clave del webhook en JavaScript público del navegador: llamar desde un backend o integración de confianza.

Respuesta esperada: `202` con `status: processing`. Significa que se registró la solicitud; no que se haya enviado el correo. Un duplicado devuelve `200` y datos inválidos `400`. Si ocurre una falla antes del acuse, se intenta devolver `503`; el tiempo de reintento puede superar el límite de un proxy, por lo que el emisor también debe manejar timeouts usando el mismo event_id.

## 7. Aprobar o rechazar

El responsable recibe un aviso con el destinatario, asunto, texto y acceso a la vista privada. Abrir Airtable, localizar el `EventId`, revisar el borrador y completar `Reviewer`. Elegir `approved` para enviar o `rejected` para cerrar sin enviar.

Con `poll_seconds = 300`, n8n revisa la decisión cada cinco minutos. Para la demostración puede configurarse en 60. El nodo Wait persiste la espera; el servicio n8n debe mantener su base de datos y sus credenciales después de reiniciar.

Si querés cambiar la propuesta, rechazarla y generar una nueva solicitud para revisión. Editar directamente el borrador, destinatario o vencimiento bloquea el envío por seguridad.

## 8. Operación y recuperación

- Lecturas y actualizaciones de Airtable: tres intentos, separados por cinco segundos, con timeout de quince segundos. Si no se recuperan, se abre una incidencia.
- OpenAI y Gmail: sin reintento automático en este proyecto. Una falla se registra y requiere revisión, evitando consumo o correos repetidos.
- Ante `429` de Airtable, respetar al menos los treinta segundos que indica su documentación antes de una recuperación manual. Los reintentos cortos no garantizan resolver ese límite.
- Ante `delivery_unknown` o `sent_unconfirmed`, revisar Gmail Enviados antes de repetir cualquier ejecución. No pulsar Retry a ciegas.
- Ante error de Airtable, la alerta por Gmail intenta continuar. Si Gmail también falla, queda la ejecución fallida en n8n; debe existir una revisión operativa de ejecuciones fallidas.
- Si el proceso cae después de poner `sending` y antes de guardar `sent`, reconciliar esa solicitud manualmente contra Gmail.
- El acuse `202` no se reemplaza por un error posterior. Consultar State y las ejecuciones para conocer el resultado.

## 9. Límite de concurrencia y duplicados

La comprobación `EventId` evita reenvíos secuenciales de solicitudes ya registradas. Airtable no aporta una restricción única transaccional: **no se garantiza exactamente una entrega para dos eventos iguales que entren simultáneamente**.

Para la demostración, usar un emisor secuencial sin solicitudes concurrentes y una única instancia. Para producción con múltiples emisores, agregar un bloqueo atómico por EventId en PostgreSQL o Redis antes de la consulta a Airtable, con restricción única y política de recuperación. Una simple configuración de concurrencia de n8n no reemplaza esa garantía.

## 10. Consumo de Airtable

Cada solicitud usa aproximadamente nueve operaciones de Airtable más una lectura por cada ciclo de espera. Una espera completa de 24 horas a intervalos de 300 segundos implica 288 lecturas adicionales. Ajustar el intervalo, el plazo y el volumen a la cuota disponible. Para un uso intensivo conviene reemplazar el sondeo por una aprobación autenticada que reactive un Wait por webhook.
