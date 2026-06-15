// 位置情報まわりの純粋ユーティリティ。
// セッション中の GPS 軌跡から移動距離を積算するのに使う（テスト対象）。

export type LatLng = { lat: number; lng: number }

// 2点間の大圏距離（メートル）。Haversine 公式。
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000 // 地球半径(m)
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
