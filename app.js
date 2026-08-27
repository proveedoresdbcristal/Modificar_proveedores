/**
 * ============================================================================
 * PROYECTO: Web_proveedores_Cristal
 * MÓDULO: Modificar_proveedores - Lógica de Cliente y Suite de Pruebas
 * FASE: 2 — Validación de Infraestructura, Autenticación y Seguridad
 * ============================================================================
 */

// --- ESTADO GLOBAL DE LA APLICACIÓN ---
const AppState = {
  sessionToken: null,
  userData: null,
  expiresAt: null,
  apiUrl: ''
};

// ============================================================================
// 1. INICIALIZACIÓN Y EVENT LISTENERS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApiUrl();
  initSessionFromStorage();
  setupEventListeners();
  logToTerminal('Sistema listo. Modo FASE 2: Pruebas de Seguridad y Backend Inicial.', 'info');
});

function initApiUrl() {
  const currentUrl = getActiveApiUrl();
  const urlInput = document.getElementById('apiUrlInput');
  if (urlInput) {
    urlInput.value = currentUrl;
  }
  AppState.apiUrl = currentUrl;
  updateApiStatusDisplay();
}

function initSessionFromStorage() {
  const savedToken = sessionStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY) || localStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY);
  const savedUser = sessionStorage.getItem(APP_CONFIG.SESSION_USER_KEY) || localStorage.getItem(APP_CONFIG.SESSION_USER_KEY);
  
  if (savedToken) {
    AppState.sessionToken = savedToken;
    try {
      AppState.userData = savedUser ? JSON.parse(savedUser) : { user: 'administradora' };
    } catch(e) {
      AppState.userData = { user: 'administradora' };
    }
    updateSessionUI(true);
    // Verificar en segundo plano si el token sigue activo
    verifyCurrentSession(false);
  } else {
    updateSessionUI(false);
  }
}

function setupEventListeners() {
  // Guardar URL de API
  document.getElementById('btnSaveApiUrl')?.addEventListener('click', () => {
    const input = document.getElementById('apiUrlInput');
    const newUrl = input.value.trim();
    if (!newUrl.startsWith('https://script.google.com/')) {
      alert('Por favor ingresa una URL válida de Google Apps Script que comience con https://script.google.com/.../exec');
      return;
    }
    setActiveApiUrl(newUrl);
    AppState.apiUrl = newUrl;
    updateApiStatusDisplay();
    logToTerminal(`URL de API actualizada: ${newUrl}`, 'info');
  });

  // Formulario de Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passInput = document.getElementById('passwordInput');
    const rememberMe = document.getElementById('rememberMeCheck')?.checked || false;
    const password = passInput.value.trim();
    
    if (!password) {
      showLoginAlert('Por favor ingresa la contraseña.', 'error');
      return;
    }
    
    await executeLogin(password, rememberMe);
  });

  // Botón de Cerrar Sesión
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await executeLogout();
  });

  // Botón Verificar Sesión
  document.getElementById('btnVerifySession')?.addEventListener('click', async () => {
    await verifyCurrentSession(true);
  });

  // Botón Probar Sheet
  document.getElementById('btnTestSheet')?.addEventListener('click', async () => {
    await executeTestSheet();
  });

  // Botón Probar Drive
  document.getElementById('btnTestDrive')?.addEventListener('click', async () => {
    await executeTestDrive();
  });

  // Botón Ejecutar Suite Completa de Pruebas de Seguridad
  document.getElementById('btnRunAllTests')?.addEventListener('click', async () => {
    await runFullSecurityTestSuite();
  });

  // Botón Limpiar Terminal
  document.getElementById('btnClearTerminal')?.addEventListener('click', () => {
    const terminal = document.getElementById('diagnosticTerminal');
    if (terminal) terminal.innerHTML = '';
  });
}

// ============================================================================
// 2. CLIENTE DE COMUNICACIÓN API (FETCH POST CON MANEJO DE REDIRECTS)
// ============================================================================
async function callApi(action, payload = {}, token = null) {
  const apiUrl = AppState.apiUrl || getActiveApiUrl();
  if (!apiUrl) {
    throw new Error('La URL de Google Apps Script no ha sido configurada. Ingrésala arriba.');
  }

  const effectiveToken = token !== undefined ? token : AppState.sessionToken;
  const requestBody = {
    action: action,
    token: effectiveToken || '',
    payload: payload,
    origin: 'MODIFICAR_PROVEEDORES_WEB'
  };

  logToTerminal(`-> [ENVIANDO] action: ${action} ${effectiveToken ? '(con token)' : '(sin token)'}`, 'info');

  try {
    // Se utiliza text/plain o POST estándar para evitar problemas de preflight en Apps Script
    const response = await fetch(apiUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok && response.status !== 401) {
      throw new Error(`Error HTTP de servidor: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logToTerminal(`<- [RESPUESTA] action: ${action} | status: ${data.status || data.error || 'OK'}`, data.success ? 'success' : 'warning');
    return data;
  } catch (err) {
    logToTerminal(`<!> [ERROR RED/CORS] ${err.message}`, 'error');
    throw err;
  }
}

// ============================================================================
// 3. OPERACIONES DE AUTENTICACIÓN Y SESIÓN
// ============================================================================
async function executeLogin(password, rememberMe = false) {
  const btnSubmit = document.getElementById('btnLoginSubmit');
  if (btnSubmit) btnSubmit.disabled = true;
  showLoginAlert('Autenticando con el servidor seguro...', 'info');

  try {
    const res = await callApi('login', { password: password }, null);
    
    if (res.success && res.token) {
      AppState.sessionToken = res.token;
      AppState.userData = { user: res.user, expiresAt: res.expiresAt };
      AppState.expiresAt = res.expiresAt;

      // Guardar en Storage
      sessionStorage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, res.token);
      sessionStorage.setItem(APP_CONFIG.SESSION_USER_KEY, JSON.stringify(AppState.userData));
      
      if (rememberMe) {
        localStorage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, res.token);
        localStorage.setItem(APP_CONFIG.SESSION_USER_KEY, JSON.stringify(AppState.userData));
      }

      showLoginAlert('¡Sesión iniciada correctamente!', 'success');
      updateSessionUI(true);
      logToTerminal(`Sesión creada exitosamente. Token: ${res.token.substring(0, 16)}...`, 'success');
    } else {
      showLoginAlert(res.message || 'Contraseña incorrecta.', 'error');
      logToTerminal(`Error de login: ${res.message || res.error}`, 'error');
    }
  } catch (err) {
    showLoginAlert(`Error de conexión: ${err.message}`, 'error');
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

async function executeLogout() {
  if (AppState.sessionToken) {
    try {
      await callApi('logout', {}, AppState.sessionToken);
    } catch(e) {
      logToTerminal('Aviso: Cierre de sesión local sin respuesta de red.', 'warning');
    }
  }

  // Limpiar estado y almacenamiento
  AppState.sessionToken = null;
  AppState.userData = null;
  AppState.expiresAt = null;

  sessionStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
  sessionStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
  localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
  localStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);

  updateSessionUI(false);
  showLoginAlert('Sesión cerrada correctamente.', 'info');
  logToTerminal('Sesión finalizada e invalidada localmente.', 'info');
}

async function verifyCurrentSession(notify = true) {
  if (!AppState.sessionToken) {
    updateSessionUI(false);
    return;
  }

  try {
    const res = await callApi('verifySession', {}, AppState.sessionToken);
    if (res.success && res.status === 'SESSION_VALID') {
      updateSessionUI(true, res.session);
      if (notify) logToTerminal(`✓ Sesión VÁLIDA. Tiempo restante: ~${res.session.remainingMinutes} min.`, 'success');
    } else {
      logToTerminal(`<!> Sesión inválida o expirada en el servidor.`, 'warning');
      executeLogout();
    }
  } catch (err) {
    logToTerminal(`Error verificando sesión: ${err.message}`, 'error');
  }
}

// ============================================================================
// 4. ACCIONES PROTEGIDAS DE PRUEBA (SHEET & DRIVE)
// ============================================================================
async function executeTestSheet() {
  try {
    const res = await callApi('testSheet');
    if (res.success) {
      logToTerminal(`✓ GOOGLE SHEET ACCESIBLE: "${res.spreadsheetName}"`, 'success');
      logToTerminal(`  Pestañas detectadas: [ ${res.sheetsFound.join(', ')} ]`, 'info');
      Object.entries(res.details || {}).forEach(([sheetName, info]) => {
        logToTerminal(`  - ${sheetName}: ${info.rowCount} filas, ${info.columnCount} cols. Encabezados: (${info.headers.slice(0, 4).join(', ')}...)`, 'info');
      });
    } else {
      logToTerminal(`Error accediendo a Google Sheet: ${res.error || res.message}`, 'error');
    }
  } catch (err) {
    logToTerminal(`Fallo en testSheet: ${err.message}`, 'error');
  }
}

async function executeTestDrive() {
  try {
    const res = await callApi('testDrive');
    if (res.success) {
      logToTerminal(`✓ GOOGLE DRIVE ACCESIBLE:`, 'success');
      logToTerminal(`  Carpeta Raíz: "${res.rootFolder.name}" (ID: ${res.rootFolder.id})`, 'info');
      logToTerminal(`  Carpeta Fotos: "${res.imagesFolder.name}" (ID: ${res.imagesFolder.id})`, 'info');
      logToTerminal(`  Permisos de acceso: ${res.imagesFolder.sharingAccess}`, 'info');
    } else {
      logToTerminal(`Error accediendo a Google Drive: ${res.error || res.message}`, 'error');
    }
  } catch (err) {
    logToTerminal(`Fallo en testDrive: ${err.message}`, 'error');
  }
}

// ============================================================================
// 5. SUITE AUTOMATIZADA DE PRUEBAS DE SEGURIDAD (FASE 2)
// ============================================================================
async function runFullSecurityTestSuite() {
  const btnRun = document.getElementById('btnRunAllTests');
  if (btnRun) btnRun.disabled = true;
  
  logToTerminal('====================================================', 'info');
  logToTerminal('INICIANDO SUITE DE PRUEBAS DE SEGURIDAD Y COMUNICACIÓN', 'info');
  logToTerminal('====================================================', 'info');

  const tests = [
    {
      id: 'test-1',
      name: 'TEST 1: testSheet sin token',
      run: async () => {
        const res = await callApi('testSheet', {}, '');
        return res.success === false && res.error === 'UNAUTHORIZED';
      }
    },
    {
      id: 'test-2',
      name: 'TEST 2: testDrive sin token',
      run: async () => {
        const res = await callApi('testDrive', {}, '');
        return res.success === false && res.error === 'UNAUTHORIZED';
      }
    },
    {
      id: 'test-3',
      name: 'TEST 3: Token inválido / falso',
      run: async () => {
        const res = await callApi('testSheet', {}, 'TOKEN_FALSO_12345678901234567890123456789012');
        return res.success === false && res.error === 'UNAUTHORIZED';
      }
    },
    {
      id: 'test-4',
      name: 'TEST 4: Token expirado o malformado',
      run: async () => {
        const res = await callApi('verifySession', {}, 'INVALID_MALFORMED_TOKEN');
        return res.success === false && res.error === 'UNAUTHORIZED';
      }
    },
    {
      id: 'test-5',
      name: 'TEST 5: Login con contraseña incorrecta',
      run: async () => {
        const res = await callApi('login', { password: 'CONTRASENA_INCORRECTA_PRUEBA' }, null);
        return res.success === false && res.error === 'LOGIN_FAILED';
      }
    },
    {
      id: 'test-6',
      name: 'TEST 6: Healthcheck público',
      run: async () => {
        const res = await callApi('health', {}, null);
        return res.success === true && res.status === 'ONLINE';
      }
    },
    {
      id: 'test-7',
      name: 'TEST 7: Acceso a Google Sheet con sesión activa',
      run: async () => {
        if (!AppState.sessionToken) {
          throw new Error('Requiere iniciar sesión primero en el panel superior.');
        }
        const res = await callApi('testSheet', {}, AppState.sessionToken);
        return res.success === true && res.status === 'SHEET_ACCESSIBLE';
      }
    },
    {
      id: 'test-8',
      name: 'TEST 8: Acceso a Google Drive con sesión activa',
      run: async () => {
        if (!AppState.sessionToken) {
          throw new Error('Requiere iniciar sesión primero en el panel superior.');
        }
        const res = await callApi('testDrive', {}, AppState.sessionToken);
        return res.success === true && res.status === 'DRIVE_ACCESSIBLE';
      }
    },
    {
      id: 'test-9',
      name: 'TEST 9: Verificación de sesión activa',
      run: async () => {
        if (!AppState.sessionToken) {
          throw new Error('Requiere iniciar sesión primero en el panel superior.');
        }
        const res = await callApi('verifySession', {}, AppState.sessionToken);
        return res.success === true && res.status === 'SESSION_VALID';
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    updateTestStatus(t.id, 'running', 'Ejecutando...');
    try {
      const ok = await t.run();
      if (ok) {
        updateTestStatus(t.id, 'passed', '✓ PASÓ');
        logToTerminal(`[PASÓ] ${t.name}`, 'success');
        passed++;
      } else {
        updateTestStatus(t.id, 'failed', '✗ FALLÓ');
        logToTerminal(`[FALLÓ] ${t.name}`, 'error');
        failed++;
      }
    } catch (err) {
      updateTestStatus(t.id, 'failed', `✗ ERROR: ${err.message}`);
      logToTerminal(`[ERROR] ${t.name}: ${err.message}`, 'error');
      failed++;
    }
  }

  logToTerminal('====================================================', 'info');
  logToTerminal(`RESUMEN: ${passed} pruebas superadas, ${failed} fallidas.`, passed === tests.length ? 'success' : 'warning');
  logToTerminal('====================================================', 'info');

  if (btnRun) btnRun.disabled = false;
}

function updateTestStatus(testId, statusClass, text) {
  const el = document.querySelector(`[data-test-id="${testId}"] .test-status`);
  if (el) {
    el.className = `test-status status-${statusClass}`;
    el.textContent = text;
  }
}

// ============================================================================
// 6. ACTUALIZACIÓN DE INTERFAZ Y HELPERS
// ============================================================================
function updateSessionUI(isLoggedIn, sessionData = null) {
  const loginSection = document.getElementById('loginSection');
  const authSection = document.getElementById('authSection');
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const sessionDetailsText = document.getElementById('sessionDetailsText');

  if (isLoggedIn) {
    if (loginSection) loginSection.style.display = 'none';
    if (authSection) authSection.style.display = 'block';
    if (sessionStatusBadge) {
      sessionStatusBadge.className = 'session-badge session-active';
      sessionStatusBadge.innerHTML = '● Sesión Activa';
    }
    if (sessionDetailsText) {
      const expires = sessionData?.remainingMinutes 
        ? `Expira en ~${sessionData.remainingMinutes} min` 
        : 'Sesión válida (8h)';
      sessionDetailsText.textContent = `Administradora autenticada | ${expires}`;
    }
  } else {
    if (loginSection) loginSection.style.display = 'block';
    if (authSection) authSection.style.display = 'none';
    if (sessionStatusBadge) {
      sessionStatusBadge.className = 'session-badge session-inactive';
      sessionStatusBadge.innerHTML = '○ No Autenticado';
    }
    if (sessionDetailsText) {
      sessionDetailsText.textContent = 'Ingresa tu contraseña para acceder.';
    }
  }
}

function updateApiStatusDisplay() {
  const badge = document.getElementById('apiStatusBadge');
  if (badge) {
    if (AppState.apiUrl) {
      badge.className = 'badge-phase';
      badge.textContent = 'Backend Configurado';
    } else {
      badge.className = 'badge-phase';
      badge.style.backgroundColor = '#F59E0B';
      badge.textContent = 'URL Pendiente';
    }
  }
}

function showLoginAlert(msg, type = 'info') {
  const box = document.getElementById('loginAlertBox');
  if (box) {
    box.className = `alert alert-${type}`;
    box.textContent = msg;
    box.style.display = 'flex';
  }
}

function logToTerminal(message, type = 'info') {
  const terminal = document.getElementById('diagnosticTerminal');
  if (!terminal) return;

  const line = document.createElement('div');
  line.className = `terminal-line log-${type}`;
  const timestamp = new Date().toLocaleTimeString();
  line.textContent = `[${timestamp}] ${message}`;
  
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}
