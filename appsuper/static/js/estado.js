/* ================= ESTADO GLOBAL DE LA APLICACIÓN ================= */

// Helper abreviado para lectura de localStorage
const LS = k => {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};

// Variables principales de Identidad y Configuración
let ME = LS('sp_me') || (typeof DJANGO_USER !== 'undefined' ? DJANGO_USER.phone : "");
let SECURE = (LS('sp_secure') === '1') ? 1 : 0;
let MYNAME = LS('sp_myname') || (typeof DJANGO_USER !== 'undefined' ? DJANGO_USER.name : "");

// Respaldo de fecha de alta local
let MYSINCE = LS('sp_since');
if (!MYSINCE) {
  MYSINCE = String(Date.now());
  try {
    localStorage.setItem('sp_since', MYSINCE);
  } catch (e) {}
}

// Estructuras de Almacenamiento Local (Contactos y Grupos)
let contacts = JSON.parse(LS('sp_contacts') || '[]');   // Array de objetos { name, number }
let groups = JSON.parse(LS('sp_groups') || '[]');       // Array de objetos { name, members: [...] }

// Diccionarios en Memoria para Rutas de Mensajería
const convs = {};      // Mapeo: topic -> objeto conversación
const topicMap = {};   // Mapeo: topic -> objeto conversación (enrutamiento de paquetes MQTT/WebSocket)
let cur = null;        // Objeto de la conversación activa en pantalla

// Cliente MQTT / WebSocket en Tiempo Real
let client = null;

// Mapas auxiliares para nombres y fechas en llamadas y presencia
const callNames = {};
const peerSince = {};

/**
 * Retorna el nombre visible de un usuario preferenciando el nombre de llamada
 * o buscando en la agenda de contactos mediante nameFor().
 */
function dispName(num) {
  return callNames[num] || (typeof nameFor === 'function' ? nameFor(num) : num);
}