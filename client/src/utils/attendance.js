export function mapAttendance(data) {
  if (!data || Object.keys(data).length === 0) return null;
  const attendance = {
    ...data,
    status: data.status ? data.status.toLowerCase() : undefined,
    id: data.id,
    userId: data.user_id || data.userId,
    checkIn: data.check_in || data.checkIn,
    checkOut: data.check_out || data.checkOut,
    lat: data.lat,
    lng: data.lng,
    date: data.date,
    // Geo-fence: check-in
    checkinZone:          data.checkin_zone        ?? data.checkinZone        ?? null,
    checkinDistance:      data.checkin_distance    ?? data.checkinDistance    ?? null,
    checkinAccuracy:      data.checkin_accuracy    ?? data.checkinAccuracy    ?? null,
    isBoundaryCheckin:    data.is_boundary_checkin ?? data.isBoundaryCheckin  ?? false,
    checkinVerified:      data.checkin_verified    ?? data.checkinVerified    ?? false,
    // Geo-fence: checkout
    checkoutLat:          data.checkout_lat        ?? data.checkoutLat        ?? null,
    checkoutLng:          data.checkout_lng        ?? data.checkoutLng        ?? null,
    checkoutZone:         data.checkout_zone       ?? data.checkoutZone       ?? null,
    checkoutDistance:     data.checkout_distance   ?? data.checkoutDistance   ?? null,
    checkoutOutsideZone:  data.checkout_outside_zone ?? data.checkoutOutsideZone ?? false,
    hours_worked:         data.hours_worked ?? 0,
  };

  // Ensure status is calculated if missing (helpful for dashboard consistency)
  if (!attendance.status) {
    if (attendance.checkOut) attendance.status = 'completed';
    else if (attendance.checkIn) attendance.status = 'working';
    else attendance.status = 'absent';
  }

  return attendance;
}
