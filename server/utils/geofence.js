/**
 * server/utils/geofence.js
 * Geo-fencing utilities: Haversine distance + zone classification.
 * Used by attendance routes to validate employee location.
 */

// ─── Haversine Distance ───────────────────────────────────────────────────────

/**
 * Calculate the great-circle distance between two points (metres).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in metres
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R  = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Zone Classification ──────────────────────────────────────────────────────

/**
 * @typedef {Object} GeoValidationResult
 * @property {boolean} allowed          - Whether check-in is permitted
 * @property {string}  zone             - 'strict' | 'buffer' | 'outside'
 * @property {number}  distance         - Raw distance from office (metres)
 * @property {number}  effectiveDistance - distance - accuracy (conservative estimate)
 * @property {boolean} isBoundaryCheckin - true when in buffer zone
 * @property {boolean} checkinVerified  - true only for strict zone entries
 * @property {string}  reason           - rejection reason if not allowed
 * @property {string}  message          - human-readable UI message
 */

/**
 * Validate an employee's location against geo-fence settings.
 *
 * @param {{ lat: number, lng: number, accuracy: number }} location
 * @param {{
 *   office_lat:             string|number,
 *   office_lng:             string|number,
 *   geofence_strict_radius: string|number,
 *   geofence_buffer_radius: string|number,
 *   geofence_max_accuracy:  string|number,
 * }} settings  - values from app_settings (may be strings from DB)
 * @returns {GeoValidationResult}
 */
function validateLocation(location, settings) {
  const { lat, lng, accuracy = 999 } = location;

  const officeLat     = parseFloat(settings.office_lat);
  const officeLng     = parseFloat(settings.office_lng);
  const strictRadius  = parseFloat(settings.geofence_strict_radius) || 25;
  const bufferRadius  = parseFloat(settings.geofence_buffer_radius) || 50;
  const maxAccuracy   = parseFloat(settings.geofence_max_accuracy)  || 50;

  // ── 1. Accuracy gate ────────────────────────────────────────────────────────
  if (accuracy > maxAccuracy) {
    return {
      allowed:           false,
      zone:              'unknown',
      distance:          null,
      effectiveDistance: null,
      isBoundaryCheckin: false,
      checkinVerified:   false,
      reason:            'low_accuracy',
      message:           `GPS signal too weak (±${Math.round(accuracy)}m). Move to an open area and try again.`,
    };
  }

  // ── 2. Distance + effective distance ────────────────────────────────────────
  const distance          = getDistance(lat, lng, officeLat, officeLng);
  const effectiveDistance = Math.max(0, distance - accuracy);

  // ── 3. Zone classification ───────────────────────────────────────────────────
  let zone;
  if (effectiveDistance <= strictRadius) {
    zone = 'strict';
  } else if (effectiveDistance <= bufferRadius) {
    zone = 'buffer';
  } else {
    zone = 'outside';
  }

  if (zone === 'outside') {
    return {
      allowed:           false,
      zone,
      distance:          Math.round(distance),
      effectiveDistance: Math.round(effectiveDistance),
      isBoundaryCheckin: false,
      checkinVerified:   false,
      reason:            'outside_zone',
      message:           `You are outside the allowed office location (${Math.round(distance)}m away).`,
    };
  }

  const isBoundaryCheckin = zone === 'buffer';
  const checkinVerified   = zone === 'strict';

  return {
    allowed:           true,
    zone,
    distance:          Math.round(distance),
    effectiveDistance: Math.round(effectiveDistance),
    isBoundaryCheckin,
    checkinVerified,
    reason:            null,
    message:           isBoundaryCheckin
      ? 'You are slightly outside office range. Check-in allowed due to GPS variance.'
      : 'Inside office zone.',
  };
}

module.exports = { getDistance, validateLocation };
