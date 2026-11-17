# Validación y guion de defensa

## Resultado local

Fecha: 17 de noviembre de 2026. Se ejecutaron **29 pruebas automatizadas: 29 aprobadas, 0 fallidas** con Node.js. Los resultados corresponden a funciones puras y a un simulador que recorre el JSON exportado y evalúa sus expresiones y nodos Code.

No se ha ejecutado n8n, ni OAuth de Gmail, ni las APIs reales. El simulador no implementa el motor n8n, su persistencia, su planificador o su estrategia real de reintentos. Las siguientes pruebas no equivalen a evidencia en vivo.

| Caso local | Resultado esperado y comprobado |
|---|---|
| Datos inválidos | 400, sin DB, IA ni Gmail |
| Consentimiento como texto | Rechazado |
| Email con múltiples destinatarios o CRLF | Rechazado |
| Duplicado secuencial | No genera nueva propuesta ni envío |
| Aprobación válida | Un envío con el borrador exacto y registro final |
| Pendiente | Repite la espera hasta decisión o plazo |
| Rechazo | Cierra sin enviar |
| Vencimiento | Cierra como expired sin enviar |
| Falta de Reviewer | No envía |
| Texto alterado | Cierra como blocked |
| Conocimiento vacío | Incidencia, sin invención de respuesta |
| IA truncada, rechazada o JSON inválido | No pasa a envío |
| Fuentes inventadas, score inválido, HTML o URL | Bloqueados por validación |
| Memoria | Se incluye en el prompt junto al conocimiento |
| Fallas de APIs antes del envío | No envían al cliente |
| Fallo ambiguo de Gmail | delivery_unknown, sin reenvío |
| DB falla después de Gmail | sent_unconfirmed, sin reenvío |
| Grafo | Destinos existentes y rutas de error conectadas |

Comandos para reproducir:

```sh
npm run build
npm test
npm run demo
```

## Evidencia real requerida para cerrar la consigna

Completar esta tabla únicamente después de ejecutar el flujo en la instancia real. No reemplazar los pendientes por datos inventados.

| Evidencia | Estado |
|---|---|
| Versión del servidor n8n e importación sin nodos desconocidos | Pendiente |
| Autenticación del webhook: llamada sin clave rechazada | Pendiente |
| Base con las tres tablas y conocimiento real | Pendiente |
| Primera ejecución real y respuesta de OpenAI | Pendiente |
| Ejecución detenida en Wait | Pendiente |
| Cambio humano a approved y correo recibido | Pendiente |
| Cambio humano a rejected sin correo al cliente | Pendiente |
| Timeout real de aprobación sin envío | Pendiente |
| Fallo de API controlado en una base de prueba | Pendiente |
| Error Workflow asociado y alerta de respaldo | Pendiente |
| Capturas y/o video de la demostración | Pendiente |

En una prueba real de timeout, usar `approval_ttl_hours = 1` y esperar el plazo; no afirmar haber probado el vencimiento real solo cambiando la fecha del registro, porque esa edición activa la protección contra cambios.

Usar una casilla propia como cliente de prueba. Los tests de fallo deben realizarse en una copia del workflow y una base de prueba, sin cambiar credenciales compartidas de producción.

## Demo de aproximadamente seis minutos

1. **Problema y objetivo (40 s):** explicar la pérdida de contexto y la demora al responder consultas. Mostrar las cuatro tecnologías.
2. **Recorrido (50 s):** mostrar el canvas de n8n, la entrada autenticada y las rutas de error.
3. **Disparo (50 s):** enviar el JSON de prueba con un event_id nuevo. Mostrar 202 y el registro en Airtable.
4. **IA y memoria (60 s):** mostrar el contexto recuperado, las fuentes y el borrador estructurado. Usar un segundo evento del mismo email para mostrar memoria de una respuesta ya enviada.
5. **HITL (80 s):** mostrar la espera, revisar el texto, completar Reviewer y elegir approved. Esperar el ciclo configurado y comprobar Gmail y el estado sent.
6. **Error o rechazo (60 s):** en otra ejecución, rechazar y demostrar que no se envió al cliente. Mostrar también una incidencia de la prueba controlada.
7. **Límites (20 s):** explicar que no hay envío sin aprobación y que los errores ambiguos de correo requieren reconciliación.

## Explicación sencilla para defender el trabajo

“n8n es el coordinador. Airtable funciona como memoria y registro. OpenAI recibe la consulta junto con información del negocio y prepara un borrador. Gmail avisa al responsable. El sistema espera la aprobación humana antes de enviar al cliente y después guarda el resultado. Si faltan datos o una API falla, la ruta de errores detiene el envío y deja una incidencia.”

## Registro de una ejecución real

Copiar y completar para cada caso:

```text
Versión n8n:
Fecha y hora:
EventId:
ExecutionId:
Caso: aprobado / rechazado / vencido / error
Estado inicial y final:
Revisor:
GmailMessageId (si corresponde):
Recepción comprobada:
Ruta de evidencia local o URL privada:
Observaciones:
```

No publicar capturas con credenciales, correos privados o datos reales de clientes. Para la entrega pública usar identidades ficticias y ocultar secretos.
