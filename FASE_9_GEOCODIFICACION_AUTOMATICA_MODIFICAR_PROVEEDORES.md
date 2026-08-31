# INFORME TÉCNICO: FASE_9_GEOCODIFICACION_AUTOMATICA_MODIFICAR_PROVEEDORES.md
## Geocodificación Automática al Guardar Proveedores (Dirección → Latitud/Longitud Persistentes) — Modificar_proveedores

**Proyecto:** `Web_Proveedores_Cristal`  
**Directorio del Frontend Modificado:** `C:\Dev\Web_proveedores_Cristal\Modificar_proveedores`  
**Directorio de Consulta Relacionado (Intacto):** `C:\Dev\Web_proveedores_Cristal\Ver_proveedores`  
**Backend Vinculado:** Google Apps Script Web App (`2.2.0-fase4` — Producción Activa y Congelada)  
**Cuenta Oficial:** `proveedoresdbcristal@gmail.com`  
**Estado:** **ETAPA 9 IMPLEMENTADA LOCALMENTE Y VALIDADA**

---

## 1. OBJETIVO DE LA ETAPA 9

Implementar en el frontend administrativo `Modificar_proveedores` la **determinación y persistencia automática de coordenadas geográficas (`latitud` y `longitud`)** a partir de la dirección física comercial ingresada por la usuaria, eliminando la necesidad de ingresar coordenadas manuales y asegurando que las coordenadas queden guardadas en la base de datos de Google Sheets para su consumo en `Ver_proveedores`.

---

## 2. ESTADO INICIAL Y ARQUITECTURA ENCONTRADA

* **Campos en Google Sheets (`PROVEEDORES`):**
  * Columna 5 (E): `direccion`
  * Columna 6 (F): `latitud`
  * Columna 7 (G): `longitud`
* **Backend Apps Script (`2.2.0-fase4` en `Codigo.js`):**
  * Ya contiene validación nativa estricta para `latitud` (-90 a 90) y `longitud` (-180 a 180).
  * Ya incluye soporte completo para guardar y actualizar `latitud` y `longitud` en `handleSaveProvider`.
  * **Conclusión:** El backend `2.2.0-fase4` NO requirió modificaciones, manteniéndose 100% congelado e intacto.
* **Frontend Anterior:**
  * Tenía campos de entrada de texto manuales para `provLatitud` y `provLongitud`, lo cual requería que la usuaria conociese las coordenadas.

---

## 3. ARQUITECTURA DE GEOCODIFICACIÓN AUTOMÁTICA IMPLEMENTADA

```text
[Usuaria completa/modifica Dirección Comercial]
                     │
                     ▼
           [Click en "Guardar Proveedor"]
                     │
                     ▼
      ¿La dirección está vacía?
         ├─► SÍ ──► Coordenadas = "" (Limpieza garantizada)
         │
         └─► NO ──► ¿La dirección no cambió y ya tiene coordenadas válidas?
                      ├─► SÍ ──► Conservar coordenadas (0 llamadas a Nominatim)
                      │
                      └─► NO ──► [Geocodificación Automática Nominatim / OSM]
                                   ├─► Consulta Caché Técnica (sessionStorage)
                                   └─► Si no está en caché: Consulta Nominatim
                                         │
                                         ├─► Éxito ──► latitud / longitud calculadas
                                         │             Mensaje: "📍 Ubicación detectada"
                                         │
                                         └─► Fallo ──► latitud = "", longitud = ""
                                                       Mensaje: "⚠️ Guardado sin mapa"
                                         │
                                         ▼
                     [Envío payload a saveProvider]
                                         │
                                         ▼
                  [Persistencia en Google Sheets (DB)]
                                         │
                                         ▼
                [Disponible automáticamente en Ver_proveedores]
```

---

## 4. COMPONENTES Y REGLAS FUNCIONALES

1. **Eliminación de Inputs Manuales:**
   * Se reemplazaron los inputs visibles de latitud y longitud por campos ocultos (`<input type="hidden">`) y una caja informativa de solo lectura (`#provGeoStatusBox`).
2. **Normalización y Contexto Geográfico:**
   * La función `normalizeAddressForGeocoding(address)` elimina espacios redundantes.
   * Si la dirección no especifica país, se le añade automáticamente el sufijo `, Argentina` para delimitar la búsqueda a nivel nacional.
3. **Caché Técnica Local:**
   * Se utiliza `sessionStorage` con clave `CRISTAL_GEO_CACHE_v1` indexada por dirección normalizada.
4. **Protección contra Doble Envío:**
   * Bloqueo booleano `AppState.isSavingProvider` que descarta clics rápidos sucesivos.
5. **Detección Inteligente de Cambios:**
   * Al abrir el modal, se guardan en `form.dataset` los valores originales: `originalAddress`, `originalLat`, `originalLon`.
   * Si la dirección no se modifica, se conservan las coordenadas existentes sin generar tráfico innecesario.
   * Si la dirección se modifica y no se encuentra en el mapa, **NUNCA se asocian las coordenadas antiguas a la dirección nueva** (se limpian para evitar mapas erróneos).

---

## 5. MATRIZ DE PRUEBAS DE LA ETAPA 9

| Prueba | Caso de Uso | Comportamiento Esperado | Resultado |
| :--- | :--- | :--- | :--- |
| **TEST 1** | Alta con dirección real | Dirección geocodificada automáticamente al guardar; coordenadas numéricas calculadas. | **PASS** |
| **TEST 2** | Edición sin cambio de dirección | No ejecuta consulta externa; conserva coordenadas existentes sin latencia. | **PASS** |
| **TEST 3** | Edición con nueva dirección | Geocodifica la nueva dirección y actualiza las coordenadas con éxito. | **PASS** |
| **TEST 4** | Dirección eliminada (vacía) | Limpia automáticamente `latitud` y `longitud` en el payload enviado al backend. | **PASS** |
| **TEST 5** | Dirección no encontrada | No inventa coordenadas; guarda proveedor y notifica advertencia amigable. | **PASS** |
| **TEST 6** | Protección doble clic | Segundo clic descartado; una sola petición enviada a la API. | **PASS** |
| **TEST 7** | Caché técnica | Segunda edición con misma dirección se resuelve a 0ms desde `sessionStorage`. | **PASS** |
| **TEST 8** | Validación frontend | Coordenadas validadas en rango (-90 a 90, -180 a 180). | **PASS** |
| **TEST 9** | Ver_proveedores intacto | No se alteró ningún archivo de `Ver_proveedores`. | **PASS** |
| **TEST 10**| Código | `node --check app.js` y `config.js` sin errores (0). | **PASS** |
| **TEST 11**| Formato | `git diff --check` sin advertencias (0). | **PASS** |

---

## 6. ARCHIVOS MODIFICADOS

* `Modificar_proveedores/index.html`: Reemplazo de inputs visibles de latitud/longitud por inputs ocultos y caja de estado `#provGeoStatusBox`.
* `Modificar_proveedores/styles.css`: Estilos para `.geo-status-box` y `.geo-status-box.warning`.
* `Modificar_proveedores/app.js`: Inclusión de `isSavingProvider`, `geocodeAddress()`, `normalizeAddressForGeocoding()`, gestión de caché técnica, actualización de `openProviderModal()` y `handleSaveProviderSubmit()`.
* `Ver_proveedores`: **INTACTO (0 cambios)**.
* `Backend_AppsScript`: **INTACTO (0 cambios)**.

---

## 7. ESTADO DE GIT

```text
============================================================
ESTADO DEL REPOSITORIO — ETAPA 9
============================================================
Proyecto:              Modificar_proveedores
Branch:                main
Último commit:         c59bd01 (Fix visualizacion de imagenes de productos)

Archivos modificados:  app.js, index.html, styles.css
Archivos nuevos:       FASE_9_GEOCODIFICACION_AUTOMATICA_MODIFICAR_PROVEEDORES.md
Archivos eliminados:   Ninguno

Commit:                NO (Trabajando localmente)
Push:                  NO
Deploy:                NO

Ver_proveedores:       NO MODIFICADO (Intacto)
Backend 2.2.0-fase4:   NO MODIFICADO (Intacto)
Google Sheets:         Verificado (Estructura lista y compatible)
Google Drive:          Verificado (Intacto)
============================================================
```

---

## 8. CONFIRMACIONES FORMALES DE INTEGRIDAD

* [x] **Backend Google Apps Script (`2.2.0-fase4`):** **INTACTO Y CONGELADO**.
* [x] **Google Sheets (`Web_Proveedores_Cristal_DB`):** **INTACTO**.
* [x] **Google Drive (`Imagenes_Productos`):** **INTACTO**.
* [x] **Script Properties:** **INTACTAS**.
* [x] **`appsscript.json`:** **INTACTO**.
* [x] **`Ver_proveedores`:** **INTACTO Y NO MODIFICADO**.
* [x] **Cero exposición de credenciales o secretos**.

---

*La **Etapa 9** ha concluido exitosamente. La geocodificación automática al guardar proveedores se encuentra 100% operativa en `Modificar_proveedores` y lista para alimentar a `Ver_proveedores`.*
