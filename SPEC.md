# VERA — Especificación MVP, marco regulatorio y plan de repositorio

**Fecha:** 25 de septiembre de 2026  
**Contexto:** IDEATECH 2026 · Perú  
**Estado:** Spec operativa para hackathon / MVP

> **VERA se construye como módulo, no como plataforma integral de RR. HH.**

El MVP demuestra un único circuito:

```text
Espacio privado
      ↓
IA explicable
      ↓
Borrador estructurado
      ↓
Autorización explícita
      ↓
Caso institucional
```

---

# 1. Decisión de producto

## Objetivo de mañana

Demostrar el flujo completo de VERA con datos sintéticos en una sola URL.

## Vertical inicial

Hostigamiento sexual laboral en organizaciones privadas en Perú.

Universidades pueden convertirse en un segundo vertical, pero no se intentará resolver ambos contextos en el MVP.

## Diferenciación

VERA combina:

- espacio privado previo al reporte;
- evidencia trazable;
- IA para estructurar información;
- revisión humana;
- formalización asistida;
- selección explícita de qué compartir;
- handoff controlado hacia la organización;
- seguimiento institucional básico.

## Lo que VERA todavía NO promete

El MVP no debe afirmar que cuenta con:

- arquitectura zero-access completa;
- cumplimiento legal certificado;
- investigación automática;
- decisiones jurídicas;
- identificación automática de culpabilidad;
- recomendación automática de sanciones.

---

# 2. Qué problema resuelve VERA

Actualmente una persona puede tener:

- mensajes;
- correos;
- capturas;
- fotografías;
- PDFs;
- audios;
- recuerdos de situaciones presenciales.

Pero esa información está desordenada.

El problema no es solamente:

> "No sé dónde denunciar."

El problema previo es:

> **"No tengo una forma privada de entender, ordenar y revisar lo que ocurrió antes de decidir qué quiero compartir."**

VERA cubre el tramo entre:

```text
"Me pasó algo"
        ↓
"Tengo información dispersa"
        ↓
"Quiero entender lo ocurrido"
        ↓
"Quiero decidir si reportarlo"
        ↓
"La organización recibe un caso estructurado"
```

La organización **no paga por acceder al espacio privado**.

Paga porque los casos que sí son escalados pueden llegar:

- mejor estructurados;
- con evidencia relacionada;
- con trazabilidad;
- con menos información faltante;
- con menor necesidad de reconstrucción manual;
- preparados para comenzar el procedimiento institucional.

---

# 3. Journey general

```text
HECHOS DISPERSOS

relato
capturas
correo
PDF
fotografías

        ↓

ENTENDIMIENTO

eventos
cronología
fuentes
relaciones
inconsistencias

        ↓

FORMALIZACIÓN

borrador estructurado

        ↓

DECISIÓN

la persona elige qué comparte

        ↓

INSTITUTIONAL

caso recibido
responsable
estado
plazos
trazabilidad
```

---

# 4. Marco regulatorio usado para diseñar el MVP

Para el MVP se toma como principal caso de uso el **hostigamiento sexual laboral en el sector privado peruano**.

La regulación peruana permite que la queja o denuncia pueda presentarse verbalmente o por escrito.

Por eso VERA **no debe obligar a la persona a completar un documento formal antes de registrar lo ocurrido**.

El documento formal debe ser una consecuencia del proceso:

```text
relato libre
      ↓
evidencia
      ↓
VERA estructura
      ↓
persona revisa
      ↓
VERA prepara borrador
```

No al revés.

---

# 5. Borrador formal que VERA puede preparar

La Resolución Ministerial N.° 115-2020-MIMP aprobó formatos referenciales relacionados con la denuncia o queja por hostigamiento sexual.

Para VERA se utilizarán como referencia seis grupos de información.

## I. Datos de la persona afectada

VERA puede solicitar:

- nombres;
- identificación;
- datos de contacto;
- cargo;
- área;
- relación con la organización.

Estos datos deben provenir principalmente del perfil y ser confirmados por la persona.

---

## II. Persona contra quien se formula la queja

Información posible:

- nombre;
- cargo;
- área;
- relación con la persona afectada.

### Regla

La IA puede detectar nombres mencionados en la evidencia.

Pero **no debe completar automáticamente la identidad de una persona sin confirmación**.

---

## III. Persona que formula la queja

Puede ser diferente de la persona afectada.

Por eso el modelo de datos no debería asumir para siempre:

```text
victim == reporter
```

Para mañana puede simplificarse el flujo mostrando a la propia persona afectada como quien presenta el caso.

---

## IV. Detalle de los hechos

Esta es una de las partes donde VERA aporta más valor.

Puede estructurar:

- circunstancias;
- fechas;
- periodos;
- lugares;
- participantes;
- secuencia de acontecimientos;
- consecuencias descritas por la persona.

Todo debe provenir de eventos previamente revisados.

---

## V. Medios probatorios

Ejemplos:

- capturas;
- correos;
- fotografías;
- documentos;
- audios;
- mensajes;
- otros archivos.

VERA debe mantener la relación:

```text
evento
   ↓
fuente
   ↓
archivo / fragmento original
```

---

## VI. Medidas de protección

La persona puede indicar medidas que desea solicitar.

### Regla crítica

VERA:

- puede mostrar opciones;
- puede explicar en lenguaje sencillo;
- puede recordar que este campo existe.

VERA NO debe decidir automáticamente qué medida corresponde.

---

# 6. Regla de UX sobre información faltante

La IA nunca debe inventar un dato para completar un formulario.

Si no conocemos la fecha exacta:

```text
❌ 14/09/2026
```

si eso no está respaldado.

Debe utilizar:

```text
✓ Fecha aproximada:
  "mediados de septiembre"

✓ Fecha pendiente de confirmar

✓ La evidencia no permite determinar
  una fecha exacta
```

VERA puede señalar:

> Falta confirmar esta información.

No debe impedir que la persona continúe porque el expediente no esté "perfecto".

---

# 7. Procedimiento institucional

Una vez que la organización recibe formalmente un caso, aparecen obligaciones y plazos.

Para el MVP **no construiremos todo el sistema de compliance**, pero el dashboard institucional debe demostrar que VERA entiende que después del reporte existe un procedimiento.

---

# 8. Hitos regulatorios que puede mostrar Institutional

## Recepción

La organización recibe el caso.

VERA crea:

```text
case_id
submitted_at
institution_id
snapshot
```

Este es el momento en que el caso pasa de:

```text
Private
```

a:

```text
Institutional
```

---

## Información sobre derechos

Cuando corresponde, la organización debe informar a la persona sobre sus derechos y dejar constancia.

### MVP

Mostrar:

```text
[ ] Información de derechos entregada
```

No automatizar jurídicamente este paso.

---

## Atención médica / psicológica

La regulación establece plazos cortos para poner estos canales a disposición.

### MVP

Mostrar una tarea:

```text
Atención médica / psicológica

Estado:
Pendiente

Referencia:
máximo 1 día hábil
```

---

## Medidas de protección

Debe existir seguimiento de este hito.

### MVP

```text
Medidas de protección

Estado:
Pendiente

Referencia:
máximo 3 días hábiles
```

VERA no elige la medida.

---

## Traslado al Comité

El procedimiento puede involucrar al Comité de Intervención frente al Hostigamiento Sexual.

### MVP

```text
Traslado al Comité
[ Pendiente ]
```

---

## Investigación e informe

El Comité tiene un plazo regulatorio para investigar y emitir un informe.

### MVP

Mostrarlo como checkpoint.

No construir todavía el módulo completo de investigación.

---

## Decisión

RR. HH. o el órgano correspondiente debe emitir una decisión luego del procedimiento.

### MVP

```text
Estado final:
Pendiente
```

No generar una decisión mediante IA.

---

# 9. Comunicación al MTPE

Existen obligaciones de comunicación al MTPE asociadas a la recepción del caso, medidas adoptadas y decisión final.

Para mañana:

```text
[ ] Comunicación MTPE pendiente
```

Puede mostrarse el plazo de referencia.

No debemos intentar implementar una integración real con el MTPE.

---

# 10. Protección de datos

VERA trabaja con información extremadamente sensible.

Por diseño debemos asumir que el riesgo de privacidad es central.

El Reglamento de la Ley N.° 29733 de Protección de Datos Personales implica revisar, entre otros puntos:

- consentimiento;
- datos sensibles;
- finalidades;
- transferencias;
- conservación;
- seguridad;
- derechos del titular;
- proveedores;
- decisiones automatizadas.

---

# 11. Regla fundamental de privacidad

Antes del escalamiento:

```text
Persona                ✓ puede verlo

Empresa                ✕ no puede verlo
RR. HH.                ✕ no puede verlo
Legal                  ✕ no puede verlo
Admin organización     ✕ no puede verlo
```

Pero además:

```text
La organización tampoco debería saber
que el borrador existe.
```

Por lo tanto Institutional no debe poder:

- listar registros privados;
- contar registros privados;
- saber qué usuario tiene registros;
- recibir alertas sobre casos privados;
- inferir que una persona está preparando un reporte.

---

# 12. MVP de mañana

El producto tendrá **6 vistas principales**.

---

# 12.1 Vista 1 — Mi espacio privado

## Objetivo

Dar sensación inmediata de:

> Esto todavía es mío.

### Ejemplo

```text
Mi espacio

Tus registros son privados hasta que decidas compartirlos.

──────────────────────────────

Situación #001

5 evidencias
Actualizado hoy

🔒 Privado

[ Continuar ]

──────────────────────────────

+ Registrar una situación
```

---

# 12.2 Vista 2 — Registrar

La persona puede:

- escribir;
- subir evidencia;
- agregar documentos.

### Copy

> Cuéntanos qué pasó o agrega lo que tengas.  
> No necesitas ordenar la información.

Inputs:

```text
[ Escribir relato ]

[ + Captura ]
[ + Correo / PDF ]
[ + Imagen ]
```

Para mañana usar:

- un relato;
- una captura;
- un PDF/correo.

Todos sintéticos.

---

# 12.3 Vista 3 — Entender

Esta es la principal experiencia de IA.

VERA convierte información desestructurada en eventos.

Ejemplo:

```text
12 SEP
Reunión presencial

Fuente:
Relato personal

[Ver fuente]
[Corregir]
[Confirmar]


14 SEP · 22:43
Mensaje recibido

Fuente:
captura_01.png

[Ver fuente]
[Corregir]
[Confirmar]


17 SEP · 09:12
Correo

Fuente:
correo_01.pdf

[Ver fuente]
[Corregir]
[Confirmar]
```

---

# 13. IA — capacidad A: extracción de eventos

Entrada:

```text
relato
+
captura
+
PDF
```

Salida:

```json
{
  "events": [
    {
      "id": "evt-1",
      "description": "Reunión presencial descrita por la persona",
      "date_kind": "approximate",
      "event_date": null,
      "approximate_date": "mediados de septiembre",
      "source_ids": ["src-1"],
      "support_quotes": [
        "..."
      ],
      "needs_review": true
    }
  ]
}
```

---

# 14. IA — capacidad B: revisión de contexto

VERA puede detectar cosas como:

```text
⚠ Fecha inconsistente

El relato menciona martes 15,
pero la captura corresponde al miércoles 16.

[ Revisar ]
```

También:

```text
🔗 Posible relación

Este correo menciona la misma reunión
descrita anteriormente.

[ Relacionar ]
[ Ignorar ]
```

O:

```text
📎 Evidencia no vinculada

captura_03.png todavía no está asociada
a ningún evento.

[ Revisar ]
```

---

# 15. Lo que la IA NO debe hacer

No debe producir:

```text
Probabilidad de acoso: 87%
```

No debe afirmar:

```text
La persona denunciada es culpable.
```

No debe decidir:

```text
Debe ser despedido.
```

No debe evaluar:

```text
La víctima parece creíble.
```

No debe inferir:

```text
Intención sexual confirmada.
```

---

# 16. Human-in-the-loop

Regla:

```text
IA propone
     ↓
persona revisa
     ↓
corrige / descarta / confirma
```

Nada generado por IA se convierte automáticamente en hecho confirmado.

---

# 17. Vista 4 — Preparar queja

Después de revisar los eventos:

```text
[ Preparar reporte ]
```

VERA genera un borrador basado **únicamente en información confirmada**.

Ejemplo:

```text
BORRADOR

I. Datos de la persona afectada

Nombre:
María X

Cargo:
Analista


II. Persona mencionada

Nombre:
Juan X

Cargo:
Supervisor


III. Persona que presenta el reporte

María X


IV. Relación de hechos

Evento 1
...

Evento 2
...


V. Evidencias

captura_01.png
correo_01.pdf


VI. Medidas de protección solicitadas

[ Sin seleccionar ]
```

Todos los campos pueden editarse.

---

# 18. Trazabilidad del borrador

Idealmente cada bloque puede indicar:

```text
Fuente

Evento 2
← captura_01.png
```

Así evitamos que VERA sea una caja negra.

---

# 19. Vista 5 — Revisar y compartir

Esta pantalla es crítica.

Debe quedar inequívocamente claro qué pasará.

```text
SE COMPARTIRÁ

☑ Evento 1
☑ Evento 2
☑ Captura 01
☑ Correo 01


SEGUIRÁ PRIVADO

🔒 Relato personal
🔒 Captura 02
🔒 Nota privada
```

Botón:

```text
[ Revisar lo que verá la organización ]
```

Después:

```text
[ Confirmar y enviar ]
```

---

# 20. Vista 6 — Institutional

Después de confirmar:

VERA crea un caso institucional.

Dashboard:

```text
VERA Institutional

Casos recibidos          4
En revisión              2
Pendientes               1
Cerrados                 1
```

Tabla:

| Caso | Recibido | Estado | Responsable |
|---|---|---|---|
| V-001 | Hoy | Nuevo | Sin asignar |
| V-002 | 22 sep | En revisión | Andrea |
| V-003 | 18 sep | Seguimiento | Carlos |

---

# 21. Detalle institucional

```text
CASO V-001

Estado:
Nuevo

Responsable:
Sin asignar

[ Asignarme ]


────────────────────────────

Resumen

────────────────────────────

Cronología

────────────────────────────

Evidencias recibidas

────────────────────────────

Procedimiento

[ ] Información de derechos
[ ] Atención médica/psicológica
[ ] Medidas de protección
[ ] Traslado al Comité
[ ] Informe
[ ] Decisión
[ ] Comunicación MTPE
```

---

# 22. Qué NO construir mañana

No construir:

- chatbot;
- "pregúntale a VERA";
- scoring de riesgo;
- probabilidad de acoso;
- evaluación emocional;
- recomendación de sanciones;
- SSO;
- MFA completo;
- recuperación avanzada de cuenta;
- integración con Buk;
- integración SAP;
- integración MTPE;
- multiempresa avanzada;
- blockchain;
- confidential computing;
- zero-access completo;
- dashboard analítico de prevención;
- módulo completo del Comité;
- OCR avanzado si retrasa el flujo.

---

# 23. Definición de terminado

El MVP está listo cuando:

> **Una única URL permite ejecutar Private → IA → borrador → selección → envío → Institutional con datos sintéticos.**

Además:

- el flujo funciona de principio a fin;
- existe fallback de IA;
- la empresa solo recibe lo compartido;
- la persona puede revisar la IA;
- Institutional no puede ver Private;
- el dashboard muestra el procedimiento;
- el pitch coincide con lo que realmente hace el sistema.

---

# 24. Fallback de IA

La demo no puede depender completamente de una API externa.

Debe existir:

```text
demo_fixture.json
```

Con una respuesta preparada.

Flujo:

```text
API funciona
   ↓
usar IA real

API falla
   ↓
usar fixture
```

La interfaz debe verse igual en ambos casos.

---

# 25. Frontera de confianza

Arquitectura conceptual:

```text
PRIVATE

PrivateRecord
relatos
archivos
timeline
complaint draft

        │

        │ único puente
        │ submit

        ▼

SNAPSHOT INSTITUCIONAL

case_id nuevo
JSON congelado
evidencias seleccionadas
hashes
timestamp

        ▼

INSTITUTIONAL
```

---

# 26. Regla del snapshot

Una vez presentado un caso:

```text
Private
```

puede seguir evolucionando.

Pero el expediente enviado:

```text
InstitutionalCase
```

no debe modificarse silenciosamente.

Ejemplo:

```text
Private v3
        ↓
Submit
        ↓
Institutional snapshot v1
```

Después:

```text
Private v4
```

NO modifica:

```text
Institutional snapshot v1
```

Si se comparte información adicional:

```text
Supplement / nueva versión
```

debe quedar registrado.

---

# 27. Evidencia e integridad

El repo actual ya calcula SHA-256 para archivos.

Debemos conservar eso.

Cuando una evidencia pase a Institutional:

```text
original.sha256
=
institutional_copy.sha256
```

Así podemos demostrar que el archivo enviado corresponde al archivo seleccionado.

---

# 28. Claim correcto para mañana

Podemos decir:

> **El prototipo demuestra aislamiento entre usuarios, selección explícita, integridad mediante hashes y un handoff controlado entre Private e Institutional.**

NO debemos decir:

> VERA ya es zero-knowledge.

NO debemos decir:

> Ni siquiera VERA puede leer los datos.

Todavía no.

La arquitectura actual almacena información legible en su infraestructura.

---

# 29. Evolución de privacidad

Después de la hackathon:

```text
Client-side encryption
        ↓
almacenamiento cifrado
        ↓
gestión de claves
        ↓
procesamiento confidencial
        ↓
zero-access progresivo
```

Eso requiere una fase arquitectónica separada.

---

# 30. Estado del repositorio actual

La base actual es suficientemente buena.

No debemos reescribir el proyecto.

Stack existente:

```text
Frontend
React
TypeScript
Vite

Backend
FastAPI
SQLAlchemy
Alembic

DB
PostgreSQL

Storage
abstracción local / objetos

Testing
pytest
Vitest

CI
GitHub Actions
```

---

# 31. Qué conservar del repo

## React + TypeScript + Vite

### Decisión

**CONSERVAR**

No necesitamos Next.js ni cambiar de framework.

---

## FastAPI

### Decisión

**CONSERVAR**

Adecuado para:

- endpoints;
- IA;
- autenticación;
- archivos;
- institucional.

---

## PostgreSQL + Alembic

### Decisión

**CONSERVAR**

Agregar únicamente las tablas necesarias.

---

## Auth actual

El repositorio ya posee:

- sesiones;
- revocación;
- aislamiento entre usuarios;
- membresía institucional.

### Decisión

**CONSERVAR**

No construir auth de nuevo.

---

## PrivateRecord

Representa adecuadamente un registro privado.

### Decisión

**CONSERVAR**

Es el núcleo de Private.

---

## Account

Actualmente funciona conceptualmente como relato / entrada.

El nombre no es ideal.

### Decisión

**CONSERVAR MAÑANA**

Después de la hackathon evaluar renombrarlo a:

```text
Narrative
Statement
Entry
```

No gastar tiempo hoy.

---

# 32. Archivos y evidencias

El repo ya cuenta con:

- validación;
- almacenamiento;
- metadatos;
- SHA-256.

### Decisión

**CONSERVAR**

Agregar solamente la capacidad de copiar las evidencias seleccionadas al espacio institucional.

---

# 33. Timeline

Actualmente ya existe:

- generación;
- revisión;
- aceptar;
- descartar;
- corregir;
- versionado;
- fuentes.

### Decisión

**CONSERVAR Y EXTENDER**

Es una de las piezas más valiosas que ya tienen.

---

# 34. timeline_ai

El adapter actual es demasiado simple para el producto que queremos mostrar.

Actualmente el comportamiento está más cerca de:

```text
seleccionar fragmentos existentes
```

Necesitamos:

```text
evidencia
   ↓
eventos estructurados
   ↓
source_ids
   ↓
review_items
```

### Decisión

**REFACTORIZAR**

No reemplazar toda la arquitectura.

Solo ampliar el contrato.

---

# 35. VoiceCapture

Existe captura de voz.

No es necesaria para demostrar la propuesta central.

Además puede complicar:

- compatibilidad;
- privacidad;
- demo;
- permisos del navegador.

### Decisión

**OCULTAR DEL HAPPY PATH**

No borrar.

---

# 36. Multi-institución

La arquitectura ya contempla instituciones.

Eso es bueno para futuro.

Pero mañana solo necesitamos una organización.

### Decisión

**CONSERVAR BACKEND**

**SIMPLIFICAR UI**

---

# 37. Institutional actual

Actualmente existe más como contexto institucional que como gestor de casos.

### Decisión

**EXTENDER**

Necesitamos:

```text
lista de casos
      ↓
detalle
      ↓
estado
      ↓
responsable
      ↓
checklist
```

---

# 38. README

El README actual mezcla:

- setup;
- historias anteriores;
- estado de features;
- documentación histórica.

Además, parte de su descripción quedó desactualizada respecto del Timeline existente.

### Decisión

**SIMPLIFICAR**

El README debe tener solamente:

```text
Qué es VERA
Stack
Cómo levantarlo
Variables necesarias
Cuentas demo
Arquitectura general
Link a SPEC.md
```

---

# 39. Nuevas piezas mínimas

Backend:

```text
backend/app/

complaints.py
institutional.py

models.py
  + ComplaintDraft
  + InstitutionalCase
  + CaseFile
```

Migración:

```text
migrations/versions/

0007_complaints_cases.py
```

Frontend:

```text
frontend/src/

Complaint.tsx
Institutional.tsx
```

Documentación:

```text
SPEC.md
```

---

# 40. Modelo de datos nuevo

## ComplaintDraft

Borrador privado.

Campos mínimos:

```text
id
record_id
revision
fields_json
source_map
reviewed_at
created_at
updated_at
```

---

## InstitutionalCase

Snapshot enviado a una organización.

```text
id
case_id
institution_id
submitted_by
submitted_at
snapshot_json
status
assignee_id
created_at
```

---

## CaseFile

Archivo compartido.

```text
id
case_id
source_file_id
filename
media_type
sha256
storage_key
created_at
```

---

## AuditEvent

Puede ser P1 si falta tiempo.

```text
id
entity_type
entity_id
actor_id
action
occurred_at
payload_hash
```

Sirve para registrar:

```text
draft_created
draft_reviewed
submission_confirmed
case_received
status_changed
assignee_changed
```

---

# 41. Endpoint crítico

El endpoint central es conceptual:

```http
POST /private-records/{record_id}/submit
```

Payload:

```json
{
  "draft_revision": 3,
  "event_ids": [
    "evt-1",
    "evt-3"
  ],
  "file_ids": [
    "file-2",
    "file-5"
  ],
  "institution_id": "org-1"
}
```

Debe:

1. validar ownership;
2. validar revisión;
3. recuperar solo los elementos elegidos;
4. generar snapshot;
5. copiar solo archivos seleccionados;
6. conservar hashes;
7. crear `InstitutionalCase`;
8. devolver `case_id`.

---

# 42. Nunca hacer esto

```text
InstitutionalCase
   ↓
foreign key directo
   ↓
PrivateRecord
```

de forma que la organización pueda recorrer toda la información privada.

Institutional debe recibir un snapshot limitado.

---

# 43. Flujo de GitHub

No necesitamos un proceso empresarial complejo.

Necesitamos velocidad sin destruir `main`.

---

# 44. Tres fuentes de verdad

## README.md

Contiene:

- qué es el proyecto;
- setup;
- stack;
- variables;
- demo accounts.

NO contiene:

- backlog;
- roadmap largo;
- historias detalladas.

---

## SPEC.md

Este documento.

Contiene:

- alcance;
- arquitectura;
- contratos;
- reglas;
- acceptance criteria.

Esta es la fuente de verdad del MVP.

---

## GitHub Issues / Project

Contiene:

- tareas concretas;
- owner;
- estado;
- bloqueos.

No duplicar todo el SPEC.

---

# 45. Project board

Columnas:

```text
Ready
  ↓
In Progress
  ↓
Review
  ↓
Done
```

Nada más.

---

# 46. Labels

Usar únicamente:

```text
P0-demo
P1

frontend
backend
ux-research

blocked
```

---

# 47. Branches

Ejemplos:

```text
feat/123-complaint-draft

feat/124-submit-case

feat/125-institutional-cases

fix/130-demo-flow
```

No crear:

```text
develop
staging
release
```

para una hackathon de 24 horas.

---

# 48. Commits

Convención:

```text
feat:
fix:
test:
docs:
refactor:
```

Ejemplos:

```text
feat: add complaint draft generation

feat: create institutional case snapshot

fix: prevent institutional access to private records

test: cover private to institutional boundary
```

---

# 49. Pull Requests

Los PR deben ser pequeños.

Template:

```markdown
## Qué cambia

Breve explicación.

## Cómo probar

1.
2.
3.

## Acceptance criteria

- [ ]
- [ ]
- [ ]

## Screenshots

Si corresponde.

## Riesgos

...
```

---

# 50. Template de Issue

```markdown
## Objetivo

Qué problema resuelve este ticket.

## Definition of Done

Una frase observable.

## Acceptance criteria

- [ ] ...
- [ ] ...
- [ ] ...

## Fuera de alcance

Qué NO se hará.

## Cómo probar

1. ...
2. ...
3. ...

## Riesgos / dependencias

...
```

---

# 51. Regla de merge

No mergear si:

- rompe la demo;
- Institutional puede acceder a Private;
- la IA genera información sin fuente;
- no existe forma de revisar la salida;
- rompe tests existentes.

Y:

> No empezar una feature P1 mientras exista una P0 bloqueada.

---

# 52. Backlog P0 para hoy

## Issue 1 — Congelar SPEC + README

**Owner:** Esteban

### Done

- equipo acepta el flujo;
- se cierran claims;
- README deja de ser fuente de producto.

---

## Issue 2 — Timeline IA → eventos estructurados

**Owner:** Esteban

### Done

La API/fixture devuelve:

```text
events
source_ids
support_quotes
review_items
```

---

## Issue 3 — Vista Preparar queja

**Owner:** Junior + UX

### Done

Muestra:

- las seis secciones;
- información disponible;
- campos faltantes;
- edición manual;
- fuente de información.

---

## Issue 4 — Submit Private → Institutional

**Owner:** Esteban

### Done

Al confirmar:

```text
Private
↓
snapshot
↓
InstitutionalCase
```

Solo pasan los elementos elegidos.

---

## Issue 5 — Institutional

**Owner:** Junior

### Done

Existe:

```text
lista
detalle
estado
responsable
```

Solo casos escalados.

---

## Issue 6 — Checklist regulatorio

**Owner:** Junior + research

### Done

El detalle del caso muestra:

- derechos;
- atención;
- medidas;
- Comité;
- informe;
- decisión;
- MTPE.

---

## Issue 7 — Tests de frontera

**Owner:** Esteban

### Tests mínimos

```text
usuario A no lee Private de usuario B

Institutional no lista Private

Institutional no abre Private

submit copia solo file_ids seleccionados

editar Private después de submit
no modifica snapshot
```

---

## Issue 8 — Demo seed + fallback

**Owner:** Todos

Dataset preparado:

```text
1 usuario
1 organización
1 registro
1 relato
2–3 evidencias
3–4 eventos
```

Y:

```text
demo_fixture.json
```

---

# 53. Si falta tiempo

Cortar en este orden:

```text
1. Grafo visual
2. OCR avanzado
3. Multimodal complejo
4. AuditEvent completo
5. Cálculo real de días hábiles
```

NO cortar:

```text
revisión humana
borrador formal
selección explícita
submit
snapshot
Institutional
frontera Private / Institutional
```

---

# 54. Acceptance criteria final

Antes de presentar:

- [ ] La usuaria puede abrir un registro privado.
- [ ] Existe relato.
- [ ] Existe al menos una captura.
- [ ] Existe al menos un correo/PDF.
- [ ] VERA genera mínimo 3 eventos.
- [ ] Cada evento tiene fuente.
- [ ] Se puede confirmar/corregir al menos un evento.
- [ ] Existe borrador estructurado.
- [ ] Los campos faltantes no son inventados.
- [ ] La pantalla muestra qué se compartirá.
- [ ] La pantalla muestra qué seguirá privado.
- [ ] Submit crea un `case_id`.
- [ ] Se genera snapshot.
- [ ] El caso aparece en Institutional.
- [ ] Institutional no puede leer Private.
- [ ] Existe estado.
- [ ] Existe responsable.
- [ ] Existe checklist regulatorio.
- [ ] Existe fallback de IA.
- [ ] Toda la demo funciona desde una URL.
- [ ] El pitch no promete zero-access todavía.

---

# 55. Demo ideal

Duración aproximada:

**2 minutos.**

## Inicio

> Durante varias semanas ocurrieron distintos hechos. Tengo mensajes, un correo y recuerdo una reunión, pero todavía no sé si quiero reportarlo.

Abrimos Private.

---

## Registro

Mostramos:

- relato;
- captura;
- correo.

Click:

```text
Entender lo ocurrido
```

---

## IA

Aparece Timeline.

> VERA convierte fuentes dispersas en eventos y conserva la relación con cada evidencia.

Abrimos una fuente.

---

## Revisión

Mostramos una inconsistencia.

La persona corrige.

> La IA propone. La persona decide.

---

## Formalización

Click:

```text
Preparar reporte
```

Aparecen las seis secciones.

> Solo se utiliza información que la persona revisó.

---

## Privacidad

Click:

```text
Revisar y compartir
```

Desmarcamos evidencia.

> Tener algo guardado en VERA no significa haberlo denunciado.

---

## Submit

```text
Confirmar y enviar
```

---

## Institutional

Aparece:

```text
Caso V-001
Nuevo
```

Más checklist.

> La organización recibe únicamente lo autorizado y puede comenzar su procedimiento.

Fin.

---

# 56. Frase común del equipo

> **VERA ayuda a una persona a convertir hechos y evidencia dispersa en una historia estructurada y revisable dentro de un espacio privado. La IA organiza y relaciona la información, pero la persona mantiene el control. Solo cuando decide escalar, selecciona qué compartir y la organización recibe un expediente estructurado para iniciar su procedimiento.**

---

# 57. Frase comercial

> **La organización no paga por acceder a información privada. Paga por recibir los casos que sí fueron escalados mejor estructurados, trazables y accionables.**

---

# 58. Claim técnico

Para el MVP:

> **VERA demuestra aislamiento entre usuarios, revisión humana de la IA, integridad mediante hashes y un handoff explícito entre el espacio privado y el institucional.**

Visión posterior:

> **La arquitectura evolucionará hacia un modelo zero-access donde la infraestructura convencional de VERA tampoco pueda leer el contenido privado.**

Son dos cosas distintas.

No mezclarlas en el pitch.

---

# 59. Trabajo después de la hackathon

Antes de utilizar datos reales:

1. Revisión jurídica.
2. Definir si VERA actúa como responsable o encargado del tratamiento.
3. Revisar consentimiento para datos sensibles.
4. Definir relación con proveedores cloud/IA.
5. Evaluación de impacto de privacidad.
6. Diseñar client-side encryption.
7. Diseñar key management.
8. Evaluar confidential computing.
9. Definir retención y eliminación.
10. Diseñar recuperación segura.
11. Auditoría externa de seguridad.
12. Piloto controlado.

---

# 60. Fuentes regulatorias de referencia

## R1 — Reglamento de la Ley N.° 27942

**Decreto Supremo N.° 014-2019-MIMP**

Reglamento de la Ley de Prevención y Sanción del Hostigamiento Sexual.

https://www.gob.pe/institucion/mimp/normas-legales/285411-014-2019-mimp

---

## R2 — Modificación del Reglamento

**Decreto Supremo N.° 021-2021-MIMP**

https://www.gob.pe/institucion/mimp/normas-legales/2038976-021-2021-mimp

---

## R3 — Formatos referenciales

**Resolución Ministerial N.° 115-2020-MIMP**

Aprueba formatos referenciales e instructivo relacionados con la queja o denuncia por hostigamiento sexual.

https://www.gob.pe/institucion/mimp/normas-legales/846051-115-2020-mimp

---

## R4 — Guía MTPE

Guía sobre hostigamiento sexual laboral.

https://cdn.www.gob.pe/uploads/document/file/5114432/Gu%C3%ADa-hostigamiento%20sexual.pdf

---

## R5 — Comité de Intervención

Información del MTPE sobre funcionamiento del Comité frente al Hostigamiento Sexual.

https://www.gob.pe/institucion/mtpe/noticias/77892-empresas-tienen-plazo-hasta-el-23-de-enero-para-implementar-comites-de-intervencion-frente-al-hostigamiento-sexual

---

## R6 — Comunicación al MTPE

Información oficial sobre comunicación de casos y decisiones.

https://www.gob.pe/institucion/mtpe/noticias/674300-mtpe-invoca-a-trabajadoras-denunciar-casos-de-hostigamiento-sexual-laboral

---

## R7 — Protección de datos personales

**Decreto Supremo N.° 016-2024-JUS**

Reglamento de la Ley N.° 29733, Ley de Protección de Datos Personales.

https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus
