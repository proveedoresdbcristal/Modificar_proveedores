/**
 * ============================================================================
 * PROYECTO: Web_proveedores_Cristal
 * MÓDULO: Modificar_proveedores — Frontend Administrativo CRUD Completo
 * FASE: 4.3 — Arquitectura SPA Vanilla JS + Integración Apps Script 2.2.0-fase4
 * ============================================================================
 */

// ============================================================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN (AppState)
// ============================================================================
const AppState = {
  apiUrl: getActiveApiUrl(),
  sessionToken: null,
  userData: null,
  expiresAt: null,
  activeTab: 'tabDashboard',

  // Proveedores
  providers: [],
  providersFilter: { search: '', estado: 'ACTIVO', rubro: '', offset: 0, limit: 25 },
  providersTotal: 0,

  // Productos
  products: [],
  productsFilter: { search: '', id_proveedor: '', categoria_producto: '', estado: 'ACTIVO', offset: 0, limit: 20 },
  productsTotal: 0,

  // Caché de Proveedores Activos (para selects de productos)
  activeProvidersCache: [],

  // Imagen en proceso de carga
  pendingImage: null
};

// ============================================================================
// 2. CAPA DE COMUNICACIÓN CON LA API (ApiClient)
// ============================================================================

/**
 * Cliente centralizado para enviar solicitudes HTTP POST a Google Apps Script
 */
async function callApi(action, payload = {}, token = null, options = {}) {
  const url = AppState.apiUrl || getActiveApiUrl();

  if (!url) {
    const err = new Error('URL de API no configurada.');
    logToTerminal('Error: URL del backend no configurada.', 'error');
    throw err;
  }

  const effectiveToken = token !== null ? token : AppState.sessionToken;

  const requestBody = {
    action: action,
    token: effectiveToken || undefined,
    origin: 'MODIFICAR_PROVEEDORES_WEB',
    payload: payload || {}
  };

  const isPublicAction = (action === 'health' || action === 'login');
  logToTerminal(`-> [ENVIANDO] action: ${action}${effectiveToken ? ' (con token)' : isPublicAction ? ' (sin token)' : ''}`, 'info');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      logToTerminal(`<- [ERROR PARSEO] Respuesta no JSON: ${responseText.substring(0, 150)}...`, 'error');
      throw new Error('La respuesta del servidor no es un JSON válido.');
    }

    logToTerminal(`<- [RESPUESTA] action: ${action} | status: ${data.status || data.error || (data.success ? 'SUCCESS' : 'ERROR')}`, data.success ? 'success' : 'warning');

    // Interceptor de Sesión Expirada o Inválida (401)
    // Se dispara únicamente en operaciones reales del panel, NO durante pruebas diagnósticas controladas
    if (!data.success && (data.error === 'UNAUTHORIZED' || data.code === 401)) {
      if (!isPublicAction && !options.diagnostic) {
        handleSessionExpired(data.message || 'La sesión expiró o es inválida.');
      }
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logToTerminal(`<- [TIMEOUT] La solicitud excedió ${APP_CONFIG.REQUEST_TIMEOUT_MS / 1000}s`, 'error');
      showToast('Tiempo de espera agotado al conectar con el backend.', 'error');
    } else {
      logToTerminal(`<- [ERROR RED] ${error.message}`, 'error');
    }
    throw error;
  }
}

/**
 * Mapeo uniforme de errores de backend a mensajes comprensibles
 */
function mapErrorMessage(errorData) {
  if (!errorData) return 'Ocurrió un error inesperado.';
  const code = errorData.error || errorData.code;

  switch (code) {
    case 'VALIDATION_ERROR':
      return errorData.message || 'Los datos ingresados no son válidos.';
    case 'INVALID_IMAGE_FORMAT':
      return 'Formato de imagen no permitido (solo WebP, JPEG o PNG).';
    case 'IMAGE_TOO_LARGE':
      return 'La imagen supera el límite permitido de 5 MB.';
    case 'UNAUTHORIZED':
      return 'La sesión ha expirado. Inicie sesión nuevamente.';
    case 'RECORD_NOT_FOUND':
      return errorData.message || 'El registro solicitado no fue encontrado.';
    case 'INTEGRITY_CONFLICT':
      return errorData.message || 'No se puede realizar la operación por conflicto de dependencia.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Demasiados intentos fallidos. Acceso bloqueado temporalmente (15 min).';
    case 'SERVER_ERROR':
      return 'Error interno del servidor. Consulte los registros.';
    case 'METHOD_NOT_ALLOWED':
      return 'Método no permitido. Esta acción requiere POST.';
    default:
      return errorData.message || `Error del sistema: ${code}`;
  }
}

// ============================================================================
// 3. GESTIÓN DE SESIÓN Y AUTENTICACIÓN
// ============================================================================

function initAuth() {
  const rememberToken = localStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY);
  const tempToken = sessionStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY);
  const savedToken = rememberToken || tempToken;

  if (savedToken) {
    AppState.sessionToken = savedToken;
    const userJson = localStorage.getItem(APP_CONFIG.SESSION_USER_KEY) || sessionStorage.getItem(APP_CONFIG.SESSION_USER_KEY);
    if (userJson) {
      try {
        AppState.userData = JSON.parse(userJson);
      } catch (e) {}
    }
    verifyCurrentSession();
  } else {
    updateSessionUI(false);
  }
}

async function executeLogin(password, rememberMe) {
  showLoginAlert('Verificando credenciales...', 'info');
  setButtonLoading('btnLoginSubmit', true, 'Ingresando...');

  try {
    const res = await callApi('login', { password: password }, '');

    if (res.success && res.token) {
      AppState.sessionToken = res.token;
      AppState.userData = res.user || { role: 'administradora' };
      AppState.expiresAt = res.expiresAt;

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, res.token);
      storage.setItem(APP_CONFIG.SESSION_USER_KEY, JSON.stringify(AppState.userData));

      if (!rememberMe) {
        localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
        localStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
      }

      showLoginAlert('', 'none');
      updateSessionUI(true);
      showToast('¡Bienvenida al Panel Administrativo!', 'success');

      // Cargar datos iniciales
      loadDashboardSummary();
      loadActiveProvidersCache();
    } else {
      const msg = res.message || 'Contraseña incorrecta.';
      showLoginAlert(msg, 'error');
      showToast(msg, 'error');
    }
  } catch (err) {
    showLoginAlert('Error de conexión con el backend.', 'error');
  } finally {
    setButtonLoading('btnLoginSubmit', false, 'Ingresar al Sistema');
  }
}

async function executeLogout() {
  try {
    if (AppState.sessionToken) {
      await callApi('logout', {}, AppState.sessionToken);
    }
  } catch (e) {
  } finally {
    AppState.sessionToken = null;
    AppState.userData = null;
    AppState.expiresAt = null;
    localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
    localStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
    sessionStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
    sessionStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
    updateSessionUI(false);
    showToast('Sesión cerrada correctamente.', 'info');
  }
}

async function verifyCurrentSession() {
  if (!AppState.sessionToken) return;

  try {
    const res = await callApi('verifySession', {}, AppState.sessionToken);
    if (res.success && res.status === 'SESSION_VALID') {
      updateSessionUI(true);
      loadDashboardSummary();
      loadActiveProvidersCache();
    } else {
      handleSessionExpired('La sesión ha expirado.');
    }
  } catch (err) {
    // Si hay error de red no cerramos inmediatamente
    updateSessionUI(true);
  }
}

function handleSessionExpired(reason) {
  AppState.sessionToken = null;
  AppState.userData = null;
  localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
  localStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
  sessionStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
  sessionStorage.removeItem(APP_CONFIG.SESSION_USER_KEY);
  updateSessionUI(false);
  showToast(reason || 'La sesión expiró. Inicie sesión nuevamente.', 'error');
}

function updateSessionUI(isAuthenticated) {
  const loginSection = document.getElementById('loginSection');
  const authSection = document.getElementById('authSection');
  const sessionStatusBadge = document.getElementById('sessionStatusBadge');
  const sessionDetailsText = document.getElementById('sessionDetailsText');

  if (isAuthenticated) {
    loginSection.style.display = 'none';
    authSection.style.display = 'block';
    sessionStatusBadge.className = 'session-badge session-active';
    sessionStatusBadge.innerHTML = '● Sesión Activa';
    sessionDetailsText.innerHTML = `Administradora autenticada &bull; Modo Productivo`;
  } else {
    loginSection.style.display = 'block';
    authSection.style.display = 'none';
    sessionStatusBadge.className = 'session-badge session-inactive';
    sessionStatusBadge.innerHTML = '○ No Autenticado';
    const passInput = document.getElementById('passwordInput');
    if (passInput) passInput.value = '';
  }
}

// ============================================================================
// 4. NAVEGACIÓN Y VISTAS (SPA)
// ============================================================================

function initNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  AppState.activeTab = tabId;

  // Actualizar botones
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Actualizar paneles de contenido
  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.id === tabId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Carga de datos según pestaña
  if (tabId === 'tabDashboard') {
    loadDashboardSummary();
  } else if (tabId === 'tabProveedores') {
    loadProviders();
  } else if (tabId === 'tabProductos') {
    loadProducts();
    loadActiveProvidersCache();
  }
}

// ============================================================================
// 5. MÓDULO 1: DASHBOARD
// ============================================================================

async function loadDashboardSummary() {
  const subtitle = document.getElementById('dashboardLastUpdated');
  if (subtitle) subtitle.innerText = 'Actualizando métricas...';

  try {
    const res = await callApi('getDashboardSummary', {});

    if (res.success && res.data) {
      const m = res.data.metrics || {};

      document.getElementById('metricTotalProveedores').innerText = m.totalProveedores || 0;
      document.getElementById('metricProveedoresActivos').innerText = `${m.proveedoresActivos || 0} activos`;
      document.getElementById('metricProveedoresInactivos').innerText = `${m.proveedoresInactivos || 0} inactivos`;

      document.getElementById('metricTotalProductos').innerText = m.totalProductos || 0;
      document.getElementById('metricProductosActivos').innerText = `${m.productosActivos || 0} activos`;
      document.getElementById('metricProductosInactivos').innerText = `${m.productosInactivos || 0} inactivos`;

      const conFoto = (m.totalProductos || 0) - (m.productosSinFoto || 0);
      document.getElementById('metricProductosConFoto').innerText = conFoto >= 0 ? conFoto : 0;
      document.getElementById('metricProductosSinFoto').innerText = `${m.productosSinFoto || 0} sin foto`;

      // Renderizar distribución por Rubros
      renderDistributionList('rubrosList', res.data.rubros, 'rubro');

      // Renderizar distribución por Categorías
      renderDistributionList('categoriasList', res.data.categorias, 'categoria');

      if (subtitle) {
        const d = new Date();
        subtitle.innerText = `Última sincronización: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
      }
    }
  } catch (err) {
    if (subtitle) subtitle.innerText = 'Error al cargar métricas.';
    showToast('No se pudieron cargar las métricas del dashboard.', 'error');
  }
}

function renderDistributionList(containerId, dataMap, emptyLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!dataMap || Object.keys(dataMap).length === 0) {
    container.innerHTML = `<div class="dist-item"><span class="dist-name">Sin ${emptyLabel}s registrados</span><span class="dist-count">0</span></div>`;
    return;
  }

  let html = '';
  for (const [name, count] of Object.entries(dataMap)) {
    html += `
      <div class="dist-item">
        <span class="dist-name">${escapeHtml(name)}</span>
        <span class="dist-count">${count}</span>
      </div>
    `;
  }
  container.innerHTML = html;
}

// ============================================================================
// 6. MÓDULO 2: PROVEEDORES (CRUD)
// ============================================================================

async function loadProviders() {
  const tbody = document.getElementById('providersTableBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="table-loading">Cargando proveedores...</td></tr>`;

  try {
    const payload = {
      search: AppState.providersFilter.search,
      estado: AppState.providersFilter.estado,
      rubro: AppState.providersFilter.rubro,
      limit: AppState.providersFilter.limit,
      offset: AppState.providersFilter.offset
    };

    const res = await callApi('getProviders', payload);

    if (res.success && res.data) {
      AppState.providers = res.data.providers || [];
      AppState.providersTotal = res.data.filtered !== undefined ? res.data.filtered : res.data.total;

      renderProvidersTable();
      updateProvidersPagination();
      updateRubroFilterOptions();
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Error al cargar proveedores.</td></tr>`;
    showToast('Error al obtener lista de proveedores.', 'error');
  }
}

function renderProvidersTable() {
  const tbody = document.getElementById('providersTableBody');
  if (!tbody) return;

  if (AppState.providers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No se encontraron proveedores con los filtros aplicados.</td></tr>`;
    return;
  }

  let html = '';
  AppState.providers.forEach(p => {
    const statusBadge = p.estado === 'ACTIVO'
      ? '<span class="badge-success">ACTIVO</span>'
      : '<span class="badge-muted">INACTIVO</span>';

    const waLink = p.whatsapp_link || (p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}` : '');
    const waHtml = waLink
      ? `<a href="${waLink}" target="_blank" style="color: var(--color-primary); font-weight: 600; text-decoration: none;">📱 ${escapeHtml(p.whatsapp || 'Ver')}</a>`
      : '<span style="color: var(--color-text-muted);">-</span>';

    const modDate = p.fecha_modificacion ? new Date(p.fecha_modificacion).toLocaleDateString() : '-';

    html += `
      <tr>
        <td><strong>${escapeHtml(p.id_proveedor)}</strong></td>
        <td><strong>${escapeHtml(p.nombre)}</strong></td>
        <td>${waHtml}</td>
        <td>${escapeHtml(p.direccion || '-')}</td>
        <td>${escapeHtml(p.rubro_categoria || '-')}</td>
        <td>${statusBadge}</td>
        <td style="font-size: 0.8rem; color: var(--color-text-muted);">${modDate}</td>
        <td class="actions-cell">
          <button class="btn btn-outline btn-sm" onclick="handleEditProvider('${p.id_proveedor}')">✏️ Editar</button>
          ${p.estado === 'ACTIVO' ? `<button class="btn btn-danger btn-sm" onclick="handleDeleteProviderPrompt('${p.id_proveedor}', '${escapeHtml(p.nombre)}')">🚫 Desactivar</button>` : ''}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function updateProvidersPagination() {
  const info = document.getElementById('providersPaginationInfo');
  const btnPrev = document.getElementById('btnPrevProviders');
  const btnNext = document.getElementById('btnNextProviders');

  const start = AppState.providersTotal === 0 ? 0 : AppState.providersFilter.offset + 1;
  const end = Math.min(AppState.providersFilter.offset + AppState.providers.length, AppState.providersTotal);

  if (info) info.innerText = `Mostrando ${start}–${end} de ${AppState.providersTotal} proveedores`;
  if (btnPrev) btnPrev.disabled = (AppState.providersFilter.offset === 0);
  if (btnNext) btnNext.disabled = (end >= AppState.providersTotal);
}

function updateRubroFilterOptions() {
  const select = document.getElementById('filterProviderRubro');
  if (!select) return;

  const currentVal = select.value;
  const rubros = new Set();
  AppState.providers.forEach(p => {
    if (p.rubro_categoria && p.rubro_categoria.trim()) {
      rubros.add(p.rubro_categoria.trim());
    }
  });

  let options = '<option value="">Todos los Rubros</option>';
  rubros.forEach(r => {
    options += `<option value="${escapeHtml(r)}" ${r === currentVal ? 'selected' : ''}>${escapeHtml(r)}</option>`;
  });
  select.innerHTML = options;
}

function openProviderModal(prov = null) {
  const modal = document.getElementById('modalProvider');
  const title = document.getElementById('modalProviderTitle');
  const form = document.getElementById('formProvider');

  clearFieldErrors();
  form.reset();

  if (prov) {
    title.innerText = `Editar Proveedor (${prov.id_proveedor})`;
    document.getElementById('provId').value = prov.id_proveedor || '';
    document.getElementById('provNombre').value = prov.nombre || '';
    document.getElementById('provEstado').value = prov.estado || 'ACTIVO';
    document.getElementById('provWhatsapp').value = prov.whatsapp || '';
    document.getElementById('provRubro').value = prov.rubro_categoria || '';
    document.getElementById('provDireccion').value = prov.direccion || '';
    document.getElementById('provLatitud').value = prov.latitud || '';
    document.getElementById('provLongitud').value = prov.longitud || '';
    document.getElementById('provWeb').value = prov.pagina_web || '';
    document.getElementById('provMinimo').value = prov.minimo_compra || '';
    document.getElementById('provTransportes').value = prov.transportes_usados || '';
    document.getElementById('provNotas').value = prov.notas_generales || '';
  } else {
    title.innerText = '➕ Nuevo Proveedor';
    document.getElementById('provId').value = '';
    document.getElementById('provEstado').value = 'ACTIVO';
  }

  modal.classList.add('active');
}

async function handleSaveProviderSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const nombre = document.getElementById('provNombre').value.trim();
  if (nombre.length < 2 || nombre.length > 100) {
    showFieldError('errProvNombre', 'El nombre debe tener entre 2 y 100 caracteres.');
    return;
  }

  const lat = document.getElementById('provLatitud').value;
  if (lat && (isNaN(parseFloat(lat)) || parseFloat(lat) < -90 || parseFloat(lat) > 90)) {
    showToast('La latitud debe estar entre -90 y 90.', 'error');
    return;
  }

  const lng = document.getElementById('provLongitud').value;
  if (lng && (isNaN(parseFloat(lng)) || parseFloat(lng) < -180 || parseFloat(lng) > 180)) {
    showToast('La longitud debe estar entre -180 y 180.', 'error');
    return;
  }

  const payload = {
    id_proveedor: document.getElementById('provId').value || undefined,
    nombre: nombre,
    estado: document.getElementById('provEstado').value,
    whatsapp: document.getElementById('provWhatsapp').value.trim(),
    rubro_categoria: document.getElementById('provRubro').value.trim(),
    direccion: document.getElementById('provDireccion').value.trim(),
    latitud: lat ? parseFloat(lat) : '',
    longitud: lng ? parseFloat(lng) : '',
    pagina_web: document.getElementById('provWeb').value.trim(),
    minimo_compra: document.getElementById('provMinimo').value.trim(),
    transportes_usados: document.getElementById('provTransportes').value.trim(),
    notas_generales: document.getElementById('provNotas').value.trim()
  };

  setButtonLoading('btnSaveProviderSubmit', true, 'Guardando...');

  try {
    const res = await callApi('saveProvider', payload);
    if (res.success) {
      closeAllModals();
      showToast(res.operation === 'CREATE' ? '¡Proveedor creado exitosamente!' : 'Proveedor actualizado.', 'success');
      loadProviders();
      loadDashboardSummary();
      loadActiveProvidersCache();
    } else {
      showToast(mapErrorMessage(res), 'error');
    }
  } catch (err) {
    showToast('Error de comunicación al guardar proveedor.', 'error');
  } finally {
    setButtonLoading('btnSaveProviderSubmit', false, 'Guardar Proveedor');
  }
}

window.handleEditProvider = function(id) {
  const p = AppState.providers.find(x => x.id_proveedor === id);
  if (p) openProviderModal(p);
};

window.handleDeleteProviderPrompt = function(id, name) {
  const modal = document.getElementById('modalConfirmDelete');
  const title = document.getElementById('modalConfirmTitle');
  const msg = document.getElementById('modalConfirmMessage');
  const cascadeBox = document.getElementById('cascadeCheckboxContainer');
  const cascadeCheck = document.getElementById('cascadeProductsCheck');

  title.innerText = 'Desactivar Proveedor';
  msg.innerHTML = `¿Estás segura de desactivar al proveedor <strong>${escapeHtml(name)}</strong> (${id})?<br><small style="color: var(--color-text-muted);">Pasará a estado INACTIVO y no se eliminará de la base.</small>`;
  cascadeBox.style.display = 'flex';
  cascadeCheck.checked = false;

  const btnConfirm = document.getElementById('btnConfirmDeleteSubmit');
  btnConfirm.onclick = async () => {
    setButtonLoading('btnConfirmDeleteSubmit', true, 'Desactivando...');
    try {
      const res = await callApi('deleteProvider', {
        id_proveedor: id,
        cascadeProducts: cascadeCheck.checked
      });

      if (res.success) {
        closeAllModals();
        showToast(`Proveedor ${id} desactivado correctamente.`, 'info');
        loadProviders();
        loadDashboardSummary();
        loadActiveProvidersCache();
      } else {
        showToast(mapErrorMessage(res), 'error');
      }
    } catch (e) {
      showToast('Error al desactivar proveedor.', 'error');
    } finally {
      setButtonLoading('btnConfirmDeleteSubmit', false, 'Confirmar Desactivación');
    }
  };

  modal.classList.add('active');
};

// ============================================================================
// 7. MÓDULO 3: PRODUCTOS / CATÁLOGO (CRUD)
// ============================================================================

async function loadProducts() {
  const grid = document.getElementById('productsGrid');
  if (grid) grid.innerHTML = `<div class="loading-spinner">Cargando catálogo...</div>`;

  try {
    const payload = {
      search: AppState.productsFilter.search,
      id_proveedor: AppState.productsFilter.id_proveedor,
      categoria_producto: AppState.productsFilter.categoria_producto,
      estado: AppState.productsFilter.estado,
      limit: AppState.productsFilter.limit,
      offset: AppState.productsFilter.offset
    };

    const res = await callApi('getProducts', payload);

    if (res.success && res.data) {
      AppState.products = res.data.products || [];
      AppState.productsTotal = res.data.filtered !== undefined ? res.data.filtered : res.data.total;

      renderProductsGrid();
      updateProductsPagination();
      updateProductFilterCategories();
    }
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="table-empty">Error al cargar productos.</div>`;
    showToast('Error al obtener lista de productos.', 'error');
  }
}

function renderProductsGrid() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  if (AppState.products.length === 0) {
    grid.innerHTML = `<div class="table-empty" style="grid-column: 1 / -1; padding: 3rem;">No se encontraron productos con los filtros seleccionados.</div>`;
    return;
  }

  let html = '';
  AppState.products.forEach(p => {
    const statusBadge = p.estado === 'ACTIVO'
      ? '<span class="product-status-badge badge-success">ACTIVO</span>'
      : '<span class="product-status-badge badge-muted">INACTIVO</span>';

    const priceFormatted = `$ ${parseFloat(p.precio || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ${p.moneda || 'ARS'}`;
    const rawImg = p.drive_view_url || p.drive_file_id;
    const directImgUrl = getDirectDriveImageUrl(rawImg);
    const driveIdMatch = rawImg ? (String(rawImg).match(/id=([a-zA-Z0-9_-]+)/i) || String(rawImg).match(/\/d\/([a-zA-Z0-9_-]+)/i)) : null;
    const fileId = p.drive_file_id || (driveIdMatch ? driveIdMatch[1] : (rawImg && /^[a-zA-Z0-9_-]{20,}$/.test(rawImg) ? rawImg : ''));

    const imgHtml = directImgUrl
      ? `<img src="${directImgUrl}" alt="${escapeHtml(p.nombre_referencia)}" class="product-img" loading="lazy" referrerpolicy="no-referrer" onerror="if(!this.dataset.fb && '${fileId}'){this.dataset.fb='1';this.src='https://drive.google.com/thumbnail?id=${fileId}&sz=w800';}else{this.parentElement.innerHTML='<div class=\\'product-no-img\\'>📦</div>';}">`
      : '<div class="product-no-img">📦</div>';

    html += `
      <div class="product-card">
        <div class="product-img-box">
          ${imgHtml}
          ${statusBadge}
        </div>
        <div class="product-body">
          <div class="product-provider">${escapeHtml(p.nombre_proveedor || p.id_proveedor || '')}</div>
          <div class="product-title">${escapeHtml(p.nombre_referencia)}</div>
          <div class="product-price">${priceFormatted}</div>
          <div class="product-meta">
            ${p.categoria_producto ? `<span class="badge-phase" style="font-size: 0.65rem;">${escapeHtml(p.categoria_producto)}</span> &bull; ` : ''}
            Bulto x ${p.cantidad_por_bulto || 1} ${escapeHtml(p.unidad_referencia || 'u')}
          </div>
          ${p.fecha_precio ? `<div class="product-meta" style="font-size: 0.72rem;">Precio al: ${p.fecha_precio}</div>` : ''}

          <div class="product-actions">
            <button class="btn btn-outline btn-sm flex-1" onclick="handleEditProduct('${p.id_producto}')">✏️ Editar</button>
            ${p.estado === 'ACTIVO' ? `<button class="btn btn-danger btn-sm" onclick="handleDeleteProductPrompt('${p.id_producto}', '${escapeHtml(p.nombre_referencia)}')">🚫</button>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
}

function updateProductsPagination() {
  const info = document.getElementById('productsPaginationInfo');
  const btnPrev = document.getElementById('btnPrevProducts');
  const btnNext = document.getElementById('btnNextProducts');

  const start = AppState.productsTotal === 0 ? 0 : AppState.productsFilter.offset + 1;
  const end = Math.min(AppState.productsFilter.offset + AppState.products.length, AppState.productsTotal);

  if (info) info.innerText = `Mostrando ${start}–${end} de ${AppState.productsTotal} productos`;
  if (btnPrev) btnPrev.disabled = (AppState.productsFilter.offset === 0);
  if (btnNext) btnNext.disabled = (end >= AppState.productsTotal);
}

async function loadActiveProvidersCache() {
  try {
    const res = await callApi('getProviders', { estado: 'ACTIVO', limit: 100 });
    if (res.success && res.data) {
      AppState.activeProvidersCache = res.data.providers || [];
      populateProductProviderFilters();
    }
  } catch (e) {}
}

function populateProductProviderFilters() {
  const filterSelect = document.getElementById('filterProductProvider');
  const modalSelect = document.getElementById('prodProveedor');

  if (filterSelect) {
    let options = '<option value="">Todos los Proveedores</option>';
    AppState.activeProvidersCache.forEach(p => {
      options += `<option value="${p.id_proveedor}">${escapeHtml(p.nombre)} (${p.id_proveedor})</option>`;
    });
    filterSelect.innerHTML = options;
  }

  if (modalSelect) {
    let options = '<option value="">Selecciona un proveedor activo...</option>';
    AppState.activeProvidersCache.forEach(p => {
      options += `<option value="${p.id_proveedor}">${escapeHtml(p.nombre)} (${p.id_proveedor})</option>`;
    });
    modalSelect.innerHTML = options;
  }
}

function updateProductFilterCategories() {
  const select = document.getElementById('filterProductCategory');
  if (!select) return;

  const currentVal = select.value;
  const cats = new Set();
  AppState.products.forEach(p => {
    if (p.categoria_producto && p.categoria_producto.trim()) {
      cats.add(p.categoria_producto.trim());
    }
  });

  let options = '<option value="">Todas las Categorías</option>';
  cats.forEach(c => {
    options += `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)}</option>`;
  });
  select.innerHTML = options;
}

function openProductModal(prod = null) {
  const modal = document.getElementById('modalProduct');
  const title = document.getElementById('modalProductTitle');
  const form = document.getElementById('formProduct');

  clearFieldErrors();
  form.reset();
  resetImageUploader();
  populateProductProviderFilters();

  if (prod) {
    title.innerText = `Editar Producto (${prod.id_producto})`;
    document.getElementById('prodId').value = prod.id_producto || '';
    document.getElementById('prodProveedor').value = prod.id_proveedor || '';
    document.getElementById('prodNombre').value = prod.nombre_referencia || '';
    document.getElementById('prodCategoria').value = prod.categoria_producto || '';
    document.getElementById('prodPrecio').value = prod.precio || 0;
    document.getElementById('prodMoneda').value = prod.moneda || 'ARS';
    document.getElementById('prodUnidad').value = prod.unidad_referencia || 'Unidad';
    document.getElementById('prodCantidadBulto').value = prod.cantidad_por_bulto || 1;
    document.getElementById('prodFechaPrecio').value = prod.fecha_precio || '';
    document.getElementById('prodNotas').value = prod.descripcion_notas || '';
    document.getElementById('prodEstado').value = prod.estado || 'ACTIVO';
    document.getElementById('prodDriveId').value = prod.drive_file_id || '';
    document.getElementById('prodDriveUrl').value = prod.drive_view_url || '';

    if (prod.drive_view_url) {
      showImagePreview(prod.drive_view_url, 'Imagen actual en Google Drive');
    }
  } else {
    title.innerText = '➕ Nuevo Producto';
    document.getElementById('prodId').value = '';
    document.getElementById('prodEstado').value = 'ACTIVO';
    document.getElementById('prodUnidad').value = 'Unidad';
    document.getElementById('prodCantidadBulto').value = 1;
    document.getElementById('prodMoneda').value = 'ARS';
    document.getElementById('prodFechaPrecio').value = new Date().toISOString().split('T')[0];
  }

  modal.classList.add('active');
}

async function handleSaveProductSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const provId = document.getElementById('prodProveedor').value;
  if (!provId) {
    showFieldError('errProdProveedor', 'Debes seleccionar un proveedor.');
    return;
  }

  const nombre = document.getElementById('prodNombre').value.trim();
  if (nombre.length < 2 || nombre.length > 100) {
    showFieldError('errProdNombre', 'El nombre debe tener entre 2 y 100 caracteres.');
    return;
  }

  const precio = parseFloat(document.getElementById('prodPrecio').value);
  if (isNaN(precio) || precio < 0) {
    showToast('El precio debe ser un número mayor o igual a 0.', 'error');
    return;
  }

  setButtonLoading('btnSaveProductSubmit', true, 'Guardando producto...');

  try {
    let driveFileId = document.getElementById('prodDriveId').value;
    let driveViewUrl = document.getElementById('prodDriveUrl').value;

    // 1. Si hay una nueva imagen procesada por Canvas, subirla primero
    if (AppState.pendingImage) {
      setButtonLoading('btnSaveProductSubmit', true, 'Subiendo imagen a Drive...');
      const uploadRes = await callApi('uploadProductImage', {
        base64Data: AppState.pendingImage.base64,
        mimeType: AppState.pendingImage.mimeType,
        fileName: AppState.pendingImage.fileName,
        id_proveedor: provId,
        id_producto: document.getElementById('prodId').value || undefined
      });

      if (uploadRes.success && uploadRes.data) {
        driveFileId = uploadRes.data.drive_file_id;
        driveViewUrl = uploadRes.data.drive_view_url;
      } else {
        showToast(mapErrorMessage(uploadRes), 'error');
        setButtonLoading('btnSaveProductSubmit', false, 'Guardar Producto');
        return;
      }
    }

    // 2. Guardar datos del producto
    setButtonLoading('btnSaveProductSubmit', true, 'Guardando registro...');
    const payload = {
      id_producto: document.getElementById('prodId').value || undefined,
      id_proveedor: provId,
      nombre_referencia: nombre,
      categoria_producto: document.getElementById('prodCategoria').value.trim(),
      precio: precio,
      moneda: document.getElementById('prodMoneda').value,
      unidad_referencia: document.getElementById('prodUnidad').value.trim() || 'Unidad',
      cantidad_por_bulto: parseInt(document.getElementById('prodCantidadBulto').value, 10) || 1,
      fecha_precio: document.getElementById('prodFechaPrecio').value || undefined,
      descripcion_notas: document.getElementById('prodNotas').value.trim(),
      estado: document.getElementById('prodEstado').value,
      drive_file_id: driveFileId || '',
      drive_view_url: driveViewUrl || ''
    };

    const res = await callApi('saveProduct', payload);

    if (res.success) {
      closeAllModals();
      showToast(res.operation === 'CREATE' ? '¡Producto creado exitosamente!' : 'Producto actualizado.', 'success');
      loadProducts();
      loadDashboardSummary();
    } else {
      showToast(mapErrorMessage(res), 'error');
    }
  } catch (err) {
    showToast('Error al guardar el producto.', 'error');
  } finally {
    setButtonLoading('btnSaveProductSubmit', false, 'Guardar Producto');
  }
}

window.handleEditProduct = function(id) {
  const p = AppState.products.find(x => x.id_producto === id);
  if (p) openProductModal(p);
};

window.handleDeleteProductPrompt = function(id, name) {
  const modal = document.getElementById('modalConfirmDelete');
  const title = document.getElementById('modalConfirmTitle');
  const msg = document.getElementById('modalConfirmMessage');
  const cascadeBox = document.getElementById('cascadeCheckboxContainer');

  title.innerText = 'Desactivar Producto';
  msg.innerHTML = `¿Estás segura de desactivar el producto <strong>${escapeHtml(name)}</strong> (${id})?<br><small style="color: var(--color-text-muted);">Pasará a estado INACTIVO y no se eliminará físicamente.</small>`;
  cascadeBox.style.display = 'none';

  const btnConfirm = document.getElementById('btnConfirmDeleteSubmit');
  btnConfirm.onclick = async () => {
    setButtonLoading('btnConfirmDeleteSubmit', true, 'Desactivando...');
    try {
      const res = await callApi('deleteProduct', { id_producto: id });
      if (res.success) {
        closeAllModals();
        showToast(`Producto ${id} desactivado correctamente.`, 'info');
        loadProducts();
        loadDashboardSummary();
      } else {
        showToast(mapErrorMessage(res), 'error');
      }
    } catch (e) {
      showToast('Error al desactivar producto.', 'error');
    } finally {
      setButtonLoading('btnConfirmDeleteSubmit', false, 'Confirmar Desactivación');
    }
  };

  modal.classList.add('active');
};

// ============================================================================
// 8. MÓDULO DE IMÁGENES Y COMPRESIÓN EN CANVAS
// ============================================================================

function initImageUploader() {
  const fileInput = document.getElementById('productImageInput');
  const btnRemove = document.getElementById('btnRemoveSelectedImage');

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Validación previa de tamaño bruto (< 10 MB para no colapsar memoria)
      if (file.size > 10 * 1024 * 1024) {
        showToast('El archivo original supera los 10 MB. Selecciona una imagen más liviana.', 'error');
        fileInput.value = '';
        return;
      }

      // Validación previa de formato MIME
      const validTypes = ['image/webp', 'image/jpeg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        showToast('Formato no permitido. Solo se aceptan imágenes WebP, JPEG o PNG.', 'error');
        fileInput.value = '';
        return;
      }

      try {
        const compressed = await compressImageWithCanvas(file, APP_CONFIG.IMAGE_MAX_DIMENSION, APP_CONFIG.IMAGE_QUALITY);
        AppState.pendingImage = compressed;

        const origKB = Math.round(file.size / 1024);
        const compKB = Math.round(compressed.byteSize / 1024);
        showImagePreview(compressed.dataUrl, `Original: ${origKB} KB &rarr; Comprimido: ${compKB} KB (${compressed.mimeType.split('/')[1].toUpperCase()})`);
        showToast(`Imagen optimizada: ${compKB} KB`, 'success');
      } catch (err) {
        showToast('No se pudo optimizar la imagen seleccionada.', 'error');
      }
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', () => {
      resetImageUploader();
      document.getElementById('prodDriveId').value = '';
      document.getElementById('prodDriveUrl').value = '';
    });
  }
}

/**
 * Compresión proporcional en Canvas con salida WebP (o JPEG fallback)
 */
function compressImageWithCanvas(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Intentar WebP primero
        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL(mimeType, quality);

        // Fallback a JPEG si el navegador no produce WebP
        if (!dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          dataUrl = canvas.toDataURL(mimeType, quality);
        }

        const base64Clean = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        const byteSize = Math.round((base64Clean.length * 3) / 4);

        // Sanitización básica del nombre para enviar
        const cleanName = (file.name || 'foto.webp').replace(/[^a-zA-Z0-9._-]/g, '_');

        resolve({
          dataUrl: dataUrl,
          base64: base64Clean,
          mimeType: mimeType,
          fileName: cleanName.endsWith('.webp') ? cleanName : cleanName + '.webp',
          byteSize: byteSize
        });
      };
      img.onerror = reject;
      img.src = readerEvent.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Transforma identificadores o URLs de Google Drive a URLs CDN directas y optimizadas para <img>
 */
function getDirectDriveImageUrl(urlOrId) {
  if (!urlOrId) return '';
  const str = String(urlOrId).trim();

  // Si ya es un Data URI (base64) o URL de blob, devolverlo directamente
  if (str.startsWith('data:') || str.startsWith('blob:')) {
    return str;
  }

  // Extraer el ID de archivo de Google Drive
  let fileId = '';
  const idMatch = str.match(/id=([a-zA-Z0-9_-]+)/i) ||
                  str.match(/\/d\/([a-zA-Z0-9_-]+)/i) ||
                  str.match(/file\/d\/([a-zA-Z0-9_-]+)/i);

  if (idMatch && idMatch[1]) {
    fileId = idMatch[1];
  } else if (/^[a-zA-Z0-9_-]{20,}$/.test(str)) {
    fileId = str;
  }

  if (fileId) {
    // Endpoint oficial de Google CDN para archivos públicos de Drive
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return str;
}

function showImagePreview(url, statsText) {
  const container = document.getElementById('imagePreviewContainer');
  const img = document.getElementById('imagePreviewImg');
  const text = document.getElementById('imageStatsText');

  if (container && img && text) {
    img.src = getDirectDriveImageUrl(url);
    img.setAttribute('referrerpolicy', 'no-referrer');
    text.innerHTML = statsText || '';
    container.style.display = 'flex';
  }
}

function resetImageUploader() {
  AppState.pendingImage = null;
  const fileInput = document.getElementById('productImageInput');
  const container = document.getElementById('imagePreviewContainer');
  if (fileInput) fileInput.value = '';
  if (container) container.style.display = 'none';
}

// ============================================================================
// 9. MODALES Y TOASTS
// ============================================================================

function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    });
  });

  // Cerrar modal al hacer clic en el backdrop
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerText = msg;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.innerText = '');
}

function setButtonLoading(buttonId, isLoading, text) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading ? `⏳ ${text}` : text;
}

function showLoginAlert(msg, type) {
  const box = document.getElementById('loginAlertBox');
  if (!box) return;
  if (type === 'none' || !msg) {
    box.style.display = 'none';
    box.innerText = '';
    return;
  }
  box.className = `alert alert-${type}`;
  box.innerText = msg;
  box.style.display = 'block';
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// 10. PRESERVACIÓN DE SUITE DE PRUEBAS Y DIAGNÓSTICO (FASE 2 / 3.1)
// ============================================================================

function logToTerminal(message, type = 'info') {
  const terminal = document.getElementById('diagnosticTerminal');
  if (!terminal) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const line = document.createElement('div');
  line.className = `terminal-line log-${type}`;
  line.innerText = `[${timeStr}] ${message}`;

  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

async function runFullSecurityTestSuite() {
  const btn = document.getElementById('btnRunAllTests');
  if (btn) btn.disabled = true;

  logToTerminal('====================================================', 'info');
  logToTerminal('INICIANDO SUITE DE PRUEBAS DE SEGURIDAD Y COMUNICACIÓN', 'info');
  logToTerminal('====================================================', 'info');

  const setTestStatus = (id, status, text) => {
    const el = document.querySelector(`[data-test-id="${id}"] .test-status`);
    if (el) {
      el.className = `test-status status-${status}`;
      el.innerText = text;
    }
  };

  let passed = 0;
  let failed = 0;

  // Test 1: testSheet sin token -> UNAUTHORIZED
  try {
    setTestStatus('test-1', 'running', 'Probando...');
    const r1 = await callApi('testSheet', {}, '', { diagnostic: true });
    if (!r1.success && r1.error === 'UNAUTHORIZED') {
      setTestStatus('test-1', 'passed', 'Superado');
      logToTerminal('[PASÓ] TEST 1: testSheet sin token', 'success');
      passed++;
    } else {
      setTestStatus('test-1', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-1', 'failed', 'Error'); failed++; }

  // Test 2: testDrive sin token -> UNAUTHORIZED
  try {
    setTestStatus('test-2', 'running', 'Probando...');
    const r2 = await callApi('testDrive', {}, '', { diagnostic: true });
    if (!r2.success && r2.error === 'UNAUTHORIZED') {
      setTestStatus('test-2', 'passed', 'Superado');
      logToTerminal('[PASÓ] TEST 2: testDrive sin token', 'success');
      passed++;
    } else {
      setTestStatus('test-2', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-2', 'failed', 'Error'); failed++; }

  // Test 3: Token falso -> UNAUTHORIZED
  try {
    setTestStatus('test-3', 'running', 'Probando...');
    const r3 = await callApi('testSheet', {}, 'TOKEN_FALSO_1234567890123456789012345678901234567890123456789012345678901234', { diagnostic: true });
    if (!r3.success && r3.error === 'UNAUTHORIZED') {
      setTestStatus('test-3', 'passed', 'Superado');
      logToTerminal('[PASÓ] TEST 3: Token inválido / falso', 'success');
      passed++;
    } else {
      setTestStatus('test-3', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-3', 'failed', 'Error'); failed++; }

  // Test 4: Token malformado -> UNAUTHORIZED
  try {
    setTestStatus('test-4', 'running', 'Probando...');
    const r4 = await callApi('verifySession', {}, 'CORTO', { diagnostic: true });
    if (!r4.success && r4.error === 'UNAUTHORIZED') {
      setTestStatus('test-4', 'passed', 'Superado');
      logToTerminal('[PASÓ] TEST 4: Token expirado o malformado', 'success');
      passed++;
    } else {
      setTestStatus('test-4', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-4', 'failed', 'Error'); failed++; }

  // Test 5: Login con contraseña incorrecta -> LOGIN_FAILED
  try {
    setTestStatus('test-5', 'running', 'Probando...');
    const r5 = await callApi('login', { password: 'PASSWORD_INCORRECTA_999' }, '', { diagnostic: true });
    if (!r5.success && (r5.error === 'LOGIN_FAILED' || r5.status === 'LOGIN_FAILED')) {
      setTestStatus('test-5', 'passed', 'Superado');
      logToTerminal('[PASÓ] TEST 5: Login con contraseña incorrecta', 'success');
      passed++;
    } else {
      setTestStatus('test-5', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-5', 'failed', 'Error'); failed++; }

  // Test 6: Healthcheck público -> ONLINE
  try {
    setTestStatus('test-6', 'running', 'Probando...');
    const r6 = await callApi('health', {}, '', { diagnostic: true });
    if (r6.success && r6.status === 'ONLINE') {
      setTestStatus('test-6', 'passed', 'Superado');
      logToTerminal(`[PASÓ] TEST 6: Healthcheck público (${r6.version})`, 'success');
      passed++;
    } else {
      setTestStatus('test-6', 'failed', 'Falló');
      failed++;
    }
  } catch (e) { setTestStatus('test-6', 'failed', 'Error'); failed++; }

  // Test 7: testSheet con token activo
  if (AppState.sessionToken) {
    try {
      setTestStatus('test-7', 'running', 'Probando...');
      const r7 = await callApi('testSheet', {}, AppState.sessionToken, { diagnostic: true });
      if (r7.success && r7.status === 'SHEET_ACCESSIBLE') {
        setTestStatus('test-7', 'passed', 'Superado');
        logToTerminal('[PASÓ] TEST 7: Acceso a Google Sheet con sesión activa', 'success');
        passed++;
      } else {
        setTestStatus('test-7', 'failed', 'Falló');
        failed++;
      }
    } catch (e) { setTestStatus('test-7', 'failed', 'Error'); failed++; }

    // Test 8: testDrive con token activo
    try {
      setTestStatus('test-8', 'running', 'Probando...');
      const r8 = await callApi('testDrive', {}, AppState.sessionToken, { diagnostic: true });
      if (r8.success && r8.status === 'DRIVE_ACCESSIBLE') {
        setTestStatus('test-8', 'passed', 'Superado');
        logToTerminal('[PASÓ] TEST 8: Acceso a Google Drive con sesión activa', 'success');
        passed++;
      } else {
        setTestStatus('test-8', 'failed', 'Falló');
        failed++;
      }
    } catch (e) { setTestStatus('test-8', 'failed', 'Error'); failed++; }

    // Test 9: verifySession con token activo
    try {
      setTestStatus('test-9', 'running', 'Probando...');
      const r9 = await callApi('verifySession', {}, AppState.sessionToken, { diagnostic: true });
      if (r9.success && r9.status === 'SESSION_VALID') {
        setTestStatus('test-9', 'passed', 'Superado');
        logToTerminal('[PASÓ] TEST 9: Verificación de sesión activa', 'success');
        passed++;
      } else {
        setTestStatus('test-9', 'failed', 'Falló');
        failed++;
      }
    } catch (e) { setTestStatus('test-9', 'failed', 'Error'); failed++; }
  } else {
    setTestStatus('test-7', 'pending', 'Req. Login');
    setTestStatus('test-8', 'pending', 'Req. Login');
    setTestStatus('test-9', 'pending', 'Req. Login');
    logToTerminal('Tests 7, 8 y 9 requieren sesión iniciada previa.', 'warning');
  }

  logToTerminal('====================================================', 'info');
  logToTerminal(`RESUMEN: ${passed} pruebas superadas, ${failed} fallidas.`, passed > 0 && failed === 0 ? 'success' : 'warning');
  logToTerminal('====================================================', 'info');

  if (btn) btn.disabled = false;
}

// ============================================================================
// 11. INICIALIZACIÓN GLOBAL DE EVENTOS AL CARGAR EL DOM
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  logToTerminal(`Sistema listo. Versión ${APP_CONFIG.APP_VERSION}.`, 'info');

  // Inicializar autenticación y sesión
  initAuth();
  initNavigation();
  initModals();
  initImageUploader();

  // Endpoint API Input
  const apiUrlInput = document.getElementById('apiUrlInput');
  const btnSaveApiUrl = document.getElementById('btnSaveApiUrl');
  if (apiUrlInput) apiUrlInput.value = getActiveApiUrl();
  if (btnSaveApiUrl) {
    btnSaveApiUrl.addEventListener('click', () => {
      const val = apiUrlInput.value.trim();
      if (setActiveApiUrl(val)) {
        AppState.apiUrl = val;
        showToast('Endpoint guardado correctamente.', 'success');
        logToTerminal(`Endpoint actualizado: ${val}`, 'info');
      } else {
        showToast('URL inválida. Debe comenzar con https://script.google.com/', 'error');
      }
    });
  }

  // Formulario de Login
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pass = document.getElementById('passwordInput').value;
      const remember = document.getElementById('rememberMeCheck').checked;
      if (pass) executeLogin(pass, remember);
    });
  }

  // Botón Logout
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', executeLogout);

  // Botón Actualizar Dashboard
  const btnRefreshDash = document.getElementById('btnRefreshDashboard');
  if (btnRefreshDash) btnRefreshDash.addEventListener('click', loadDashboardSummary);

  // Botones y Filtros de Proveedores
  const btnNewProv = document.getElementById('btnNewProvider');
  if (btnNewProv) btnNewProv.addEventListener('click', () => openProviderModal());

  const formProv = document.getElementById('formProvider');
  if (formProv) formProv.addEventListener('submit', handleSaveProviderSubmit);

  const searchProv = document.getElementById('searchProviderInput');
  if (searchProv) {
    let debounceTimer;
    searchProv.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        AppState.providersFilter.search = e.target.value.trim();
        AppState.providersFilter.offset = 0;
        loadProviders();
      }, 350);
    });
  }

  const filterProvEstado = document.getElementById('filterProviderEstado');
  if (filterProvEstado) {
    filterProvEstado.addEventListener('change', (e) => {
      AppState.providersFilter.estado = e.target.value;
      AppState.providersFilter.offset = 0;
      loadProviders();
    });
  }

  const filterProvRubro = document.getElementById('filterProviderRubro');
  if (filterProvRubro) {
    filterProvRubro.addEventListener('change', (e) => {
      AppState.providersFilter.rubro = e.target.value;
      AppState.providersFilter.offset = 0;
      loadProviders();
    });
  }

  const btnPrevProv = document.getElementById('btnPrevProviders');
  if (btnPrevProv) {
    btnPrevProv.addEventListener('click', () => {
      if (AppState.providersFilter.offset > 0) {
        AppState.providersFilter.offset = Math.max(0, AppState.providersFilter.offset - AppState.providersFilter.limit);
        loadProviders();
      }
    });
  }

  const btnNextProv = document.getElementById('btnNextProviders');
  if (btnNextProv) {
    btnNextProv.addEventListener('click', () => {
      if (AppState.providersFilter.offset + AppState.providersFilter.limit < AppState.providersTotal) {
        AppState.providersFilter.offset += AppState.providersFilter.limit;
        loadProviders();
      }
    });
  }

  // Botones y Filtros de Productos
  const btnNewProd = document.getElementById('btnNewProduct');
  if (btnNewProd) btnNewProd.addEventListener('click', () => openProductModal());

  const formProd = document.getElementById('formProduct');
  if (formProd) formProd.addEventListener('submit', handleSaveProductSubmit);

  const searchProd = document.getElementById('searchProductInput');
  if (searchProd) {
    let debounceTimer;
    searchProd.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        AppState.productsFilter.search = e.target.value.trim();
        AppState.productsFilter.offset = 0;
        loadProducts();
      }, 350);
    });
  }

  const filterProdProv = document.getElementById('filterProductProvider');
  if (filterProdProv) {
    filterProdProv.addEventListener('change', (e) => {
      AppState.productsFilter.id_proveedor = e.target.value;
      AppState.productsFilter.offset = 0;
      loadProducts();
    });
  }

  const filterProdCat = document.getElementById('filterProductCategory');
  if (filterProdCat) {
    filterProdCat.addEventListener('change', (e) => {
      AppState.productsFilter.categoria_producto = e.target.value;
      AppState.productsFilter.offset = 0;
      loadProducts();
    });
  }

  const filterProdEstado = document.getElementById('filterProductEstado');
  if (filterProdEstado) {
    filterProdEstado.addEventListener('change', (e) => {
      AppState.productsFilter.estado = e.target.value;
      AppState.productsFilter.offset = 0;
      loadProducts();
    });
  }

  const btnPrevProd = document.getElementById('btnPrevProducts');
  if (btnPrevProd) {
    btnPrevProd.addEventListener('click', () => {
      if (AppState.productsFilter.offset > 0) {
        AppState.productsFilter.offset = Math.max(0, AppState.productsFilter.offset - AppState.productsFilter.limit);
        loadProducts();
      }
    });
  }

  const btnNextProd = document.getElementById('btnNextProducts');
  if (btnNextProd) {
    btnNextProd.addEventListener('click', () => {
      if (AppState.productsFilter.offset + AppState.productsFilter.limit < AppState.productsTotal) {
        AppState.productsFilter.offset += AppState.productsFilter.limit;
        loadProducts();
      }
    });
  }

  // Suite de Pruebas & Consola
  const btnRunTests = document.getElementById('btnRunAllTests');
  if (btnRunTests) btnRunTests.addEventListener('click', runFullSecurityTestSuite);

  const btnClearTerm = document.getElementById('btnClearTerminal');
  if (btnClearTerm) {
    btnClearTerm.addEventListener('click', () => {
      const term = document.getElementById('diagnosticTerminal');
      if (term) term.innerHTML = '';
    });
  }
});
