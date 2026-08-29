/**
 * ============================================================================
 * PROYECTO: Web_proveedores_Cristal
 * MÓDULO: Modificar_proveedores - Configuración Pública de Cliente
 * FASE: 4.3 — Frontend Administrativo CRUD Completo
 * ============================================================================
 *
 * REGLA CRÍTICA DE SEGURIDAD:
 * Este archivo se publica en GitHub Pages.
 * NO contiene contraseñas, secretos, tokens maestros ni llaves privadas.
 * Únicamente contiene la URL pública del Web App de Google Apps Script.
 */

const APP_CONFIG = {
  APP_NAME: 'Proveedores Cristal — Panel de Administración',
  APP_VERSION: '2.2.0-fase4',

  // URL pública del Web App de Google Apps Script (Despliegue Web)
  // Puede ser configurada aquí o editada dinámicamente desde el panel de diagnóstico
  DEFAULT_API_URL: '',

  // Clave de almacenamiento local para persistir la URL configurada por la usuaria
  API_URL_STORAGE_KEY: 'CRISTAL_API_URL_ENDPOINT',
  SESSION_STORAGE_KEY: 'CRISTAL_ADMIN_SESSION_TOKEN',
  SESSION_USER_KEY: 'CRISTAL_ADMIN_USER_DATA',

  // Configuración de timeouts y límites
  REQUEST_TIMEOUT_MS: 25000,
  MAX_PAGE_LIMIT: 100,
  IMAGE_MAX_DIMENSION: 1200,
  IMAGE_QUALITY: 0.85
};

// Función auxiliar para obtener la URL activa del backend
function getActiveApiUrl() {
  const customUrl = localStorage.getItem(APP_CONFIG.API_URL_STORAGE_KEY);
  if (customUrl && customUrl.trim().startsWith('https://script.google.com/')) {
    return customUrl.trim();
  }
  return APP_CONFIG.DEFAULT_API_URL;
}

// Función auxiliar para guardar la URL activa del backend
function setActiveApiUrl(url) {
  if (url && url.trim().startsWith('https://script.google.com/')) {
    localStorage.setItem(APP_CONFIG.API_URL_STORAGE_KEY, url.trim());
    return true;
  }
  return false;
}
