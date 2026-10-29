/**
 * client/src/utils/geofence.js
 * Client-side geo-fence utilities.
 * Mirrors server logic so we can do pre-flight zone classification
 * before the API call — enabling instant UI feedback.
 */

// ─── Haversine distance (metres) ─────────────────────────────────────────────

export function getDistance(lat1, lon1, lat2, lon2) {
  const R  = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Zone classification ──────────────────────────────────────────────────────

/**
 * Pre-flight zone check (mirrors server logic).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} accuracy  - GPS accuracy in metres
 * @param {{
 *   officeLat:     number,
 *   officeLng:     number,
 *   strictRadius:  number,   // default 25
 *   bufferRadius:  number,   // default 50
 *   maxAccuracy:   number,   // default 50
 * }} config
 * @returns {{ zone: string, distance: number, effectiveDistance: number, allowed: boolean }}
 */
export function classifyZone(lat, lng, accuracy, config) {
  const {
    officeLat,
    officeLng,
    strictRadius  = 25,
    bufferRadius  = 50,
    maxAccuracy   = 50,
  } = config;

  if (!officeLat || !officeLng) {
    return { zone: 'unknown', distance: null, effectiveDistance: null, allowed: true };
  }

  if (accuracy > maxAccuracy) {
    return { zone: 'low_accuracy', distance: null, effectiveDistance: null, allowed: false };
  }

  const distance          = getDistance(lat, lng, officeLat, officeLng);
  const effectiveDistance = Math.max(0, distance - accuracy);

  let zone;
  if (effectiveDistance <= strictRadius)      zone = 'strict';
  else if (effectiveDistance <= bufferRadius) zone = 'buffer';
  else                                         zone = 'outside';

  return {
    zone,
    distance:          Math.round(distance),
    effectiveDistance: Math.round(effectiveDistance),
    allowed:           zone !== 'outside',
  };
}

// ─── GPS position promise ─────────────────────────────────────────────────────

/**
 * Get current GPS position as a Promise.
 * Returns { lat, lng, accuracy } or throws on error.
 *
 * @param {{ enableHighAccuracy?: boolean, timeout?: number }} options
 */
export function getPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat:      pos.coords.latitude,
        lng:      pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout:            10000,
        maximumAge:         0,
        ...options,
      }
    );
  });
}

// ─── Zone display helpers ─────────────────────────────────────────────────────

export const ZONE_CONFIG = {
  strict: {
    label:  'Inside Office',
    color:  '#10b981',   // emerald-500
    bg:     '#ecfdf5',   // emerald-50
    border: '#a7f3d0',   // emerald-200
    dot:    '●',
  },
  buffer: {
    label:  'Boundary Check-in',
    color:  '#f59e0b',   // amber-500
    bg:     '#fffbeb',   // amber-50
    border: '#fde68a',   // amber-200
    dot:    '⚠',
  },
  outside: {
    label:  'Outside Office',
    color:  '#ef4444',   // red-500
    bg:     '#fef2f2',   // red-50
    border: '#fecaca',   // red-200
    dot:    '✕',
  },
  low_accuracy: {
    label:  'Weak GPS Signal',
    color:  '#6b7280',   // gray-500
    bg:     '#f9fafb',
    border: '#e5e7eb',
    dot:    '📡',
  },
};
