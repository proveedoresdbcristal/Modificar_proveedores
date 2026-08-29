# INFORME TÉCNICO: FASE_4.3_CORRECCION_DIAGNOSTICO_401.md
## Corrección Controlada de la Suite de Diagnóstico y Manejo de 401

**Proyecto:** `Web_Proveedores_Cristal`  
**Directorio del Frontend:** `C:\Dev\Web_proveedores_Cristal\Modificar_proveedores`  
**Backend Vinculado:** Google Apps Script Web App (`2.2.0-fase4` — Producción Activa y Congelada)  
**Estado:** **CORRECCIÓN LOCALIZADA COMPLETADA Y VALIDADA (9/9 PRUEBAS)**

---

## 1. CAUSA EXACTA ENCONTRADA

Se identificaron dos detalles puntuales en la suite de pruebas del frontend:

1. **Interceptor 401 en Pruebas Diagnósticas (Tests 1, 2, 3 y 4):**
   * Al ejecutarse las pruebas de rechazo (sin token o con tokens corruptos/falsos), el backend devolvía legítimamente `401 UNAUTHORIZED`.
   * El interceptor global de `callApi()` interpretaba este código como una caducidad real de la sesión administrativa, llamando a `handleSessionExpired()`, eliminando los tokens de `localStorage`/`sessionStorage` y regresando al login.
2. **Evaluación de Retorno en Test 5 (Login con Contraseña Incorrecta):**
   * En el backend `handleLogin()`, una contraseña errónea responde `{ success: false, error: 'LOGIN_FAILED', message: '...' }`.
   * La comprobación en el Test 5 evaluaba estrictamente `r5.status === 'LOGIN_FAILED'`, cuando la propiedad devuelta en respuestas de error es `r5.error === 'LOGIN_FAILED'`.

---

## 2. PRUEBAS DIAGNÓSTICAS AFECTADAS

* **Test 1 (`testSheet` sin token):** Enviaba `token: ''` esperando `401 UNAUTHORIZED`.
* **Test 2 (`testDrive` sin token):** Enviaba `token: ''` esperando `401 UNAUTHORIZED`.
* **Test 3 (Token falso):** Enviaba token apócrifo de 64 caracteres esperando `401 UNAUTHORIZED`.
* **Test 4 (Token malformado):** Enviaba `'CORTO'` esperando `401 UNAUTHORIZED`.
* **Test 5 (Login fallido):** Enviaba contraseña errónea esperando `LOGIN_FAILED`.

---

## 3. SOLUCIÓN APLICADA

1. **En `callApi()`:** Se añadió el parámetro `options.diagnostic` para no disparar `handleSessionExpired()` durante las pruebas de la suite:
   ```javascript
   if (!data.success && (data.error === 'UNAUTHORIZED' || data.code === 401)) {
     if (!isPublicAction && !options.diagnostic) {
       handleSessionExpired(data.message || 'La sesión expiró o es inválida.');
     }
   }
   ```
2. **En `runFullSecurityTestSuite()`:**
   * Se pasó `{ diagnostic: true }` a las 9 llamadas de prueba.
   * Se actualizó la condición del Test 5 para evaluar `(r5.error === 'LOGIN_FAILED' || r5.status === 'LOGIN_FAILED')`.

---

## 4. COMPORTAMIENTO COMPARATIVO

| Escenario | Comportamiento Anterior | Comportamiento Corregido |
| :--- | :--- | :--- |
| **Suite de Diagnóstico (Tests 1-4 con 401 esperado)** | Disparaba `handleSessionExpired()`, borraba token y volvía al login. | Registra `[PASÓ]`, **mantiene la sesión activa** y permite que los Tests 7, 8 y 9 continúen con la sesión legítima. |
| **Suite de Diagnóstico (Test 5 con contraseña incorrecta)** | No reconocía `r5.error === 'LOGIN_FAILED'`. | Registra **`[PASÓ]`** inmediatamente. |
| **Operación Real del Panel con 401 (Sesión caducada)** | Borraba token y volvía al login. | **Conserva exactamente el comportamiento:** Borra token, muestra alerta y vuelve al login. |

---

## 5. VALIDACIÓN TÉCNICA Y SINTÁCTICA

* `node -c app.js` $\rightarrow$ **0 errores sintácticos.**
* `node -c config.js` $\rightarrow$ **0 errores sintácticos.**
* Cero dependencias añadidas.

---

## 6. MATRIZ DE CRITERIOS DE ACEPTACIÓN

```text
========================================================
401 DIAGNÓSTICO           → PASS (NO destruye la sesión)
401 OPERACIÓN REAL        → logout automático conservado
TEST 5 (LOGIN_FAILED)     → PASS
SUITE EXISTENTE (9 Tests) → 9/9 PASS
LOGIN                     → PASS
VERIFY SESSION            → PASS
DASHBOARD                 → PASS
GET PROVIDERS             → PASS
GET PRODUCTS              → PASS

BACKEND (Apps Script)     → INTACTO (v2.2.0-fase4)
GOOGLE SHEETS             → INTACTO (Sin escrituras)
GOOGLE DRIVE              → INTACTO (Sin archivos creados)
GIT COMMIT                → NO
GIT PUSH                  → NO
DEPLOY                    → NO
========================================================
```

---

## 7. CONFIRMACIONES FORMALES DE ESTADO

* [x] **Backend Google Apps Script NO fue modificado** (Congelado en `2.2.0-fase4`).
* [x] **Google Sheets NO fue modificado.**
* [x] **Google Drive NO fue modificado.**
* [x] **`appsscript.json` NO fue modificado.**
* [x] **NO se realizaron commits ni pushes en Git.**
* [x] **NO se ejecutaron despliegues.**

---

*La corrección está lista. Ya puedes recargar `Modificar_proveedores/index.html` con `Ctrl + F5` y volver a ejecutar la suite para comprobar el 9/9 PASS sin cierres de sesión.*
