/**
 * Tọa độ trung tâm hành chính của 63 tỉnh/thành Việt Nam (trùng với
 * `VIETNAM_PROVINCES` trong `src/constants/bookingFilters.ts`).
 *
 * Dùng để FALLBACK tính khoảng cách giữa khách & KTV khi KTV chưa có
 * `currentLatitude/currentLongitude` chính xác. Sai số khoảng vài km
 * — đủ để sort "Gần tôi" hợp lý và hiển thị thay cho "Đang cập nhật".
 *
 * Nguồn: tọa độ thủ phủ tỉnh (Wikipedia/Google Maps), làm tròn 4 chữ số.
 */
export const VIETNAM_PROVINCE_CENTROIDS: Readonly<Record<string, { latitude: number; longitude: number }>> = {
  'Hà Nội':                { latitude: 21.0285, longitude: 105.8542 },
  'TP.HCM':                { latitude: 10.7769, longitude: 106.7009 },
  'Đà Nẵng':               { latitude: 16.0544, longitude: 108.2022 },
  'Hải Phòng':             { latitude: 20.8449, longitude: 106.6881 },
  'Cần Thơ':               { latitude: 10.0452, longitude: 105.7469 },
  'An Giang':              { latitude: 10.5216, longitude: 105.1259 },
  'Bà Rịa - Vũng Tàu':     { latitude: 10.5417, longitude: 107.2429 },
  'Bạc Liêu':              { latitude: 9.2940,  longitude: 105.7216 },
  'Bắc Giang':             { latitude: 21.2731, longitude: 106.1946 },
  'Bắc Kạn':               { latitude: 22.1474, longitude: 105.8348 },
  'Bắc Ninh':              { latitude: 21.1861, longitude: 106.0763 },
  'Bến Tre':               { latitude: 10.2433, longitude: 106.3756 },
  'Bình Dương':            { latitude: 11.3254, longitude: 106.4770 },
  'Bình Định':             { latitude: 13.7820, longitude: 109.2192 },
  'Bình Phước':            { latitude: 11.7512, longitude: 106.7235 },
  'Bình Thuận':            { latitude: 10.9333, longitude: 108.1000 },
  'Cà Mau':                { latitude: 9.1768,  longitude: 105.1500 },
  'Cao Bằng':              { latitude: 22.6657, longitude: 106.2570 },
  'Đắk Lắk':               { latitude: 12.7100, longitude: 108.2378 },
  'Đắk Nông':              { latitude: 12.2646, longitude: 107.6098 },
  'Điện Biên':             { latitude: 21.3859, longitude: 103.0179 },
  'Đồng Nai':              { latitude: 10.9447, longitude: 106.8243 },
  'Đồng Tháp':             { latitude: 10.4938, longitude: 105.6882 },
  'Gia Lai':               { latitude: 13.9833, longitude: 108.0000 },
  'Hà Giang':              { latitude: 22.8233, longitude: 104.9784 },
  'Hà Nam':                { latitude: 20.5836, longitude: 105.9230 },
  'Hà Tĩnh':               { latitude: 18.3559, longitude: 105.8877 },
  'Hải Dương':             { latitude: 20.9373, longitude: 106.3146 },
  'Hậu Giang':             { latitude: 9.7579,  longitude: 105.6413 },
  'Hòa Bình':              { latitude: 20.8133, longitude: 105.3380 },
  'Hưng Yên':              { latitude: 20.6464, longitude: 106.0511 },
  'Khánh Hòa':             { latitude: 12.2388, longitude: 109.1967 },
  'Kiên Giang':            { latitude: 10.0125, longitude: 105.0809 },
  'Kon Tum':               { latitude: 14.3500, longitude: 108.0000 },
  'Lai Châu':              { latitude: 22.3964, longitude: 103.4583 },
  'Lâm Đồng':              { latitude: 11.9404, longitude: 108.4583 },
  'Lạng Sơn':              { latitude: 21.8537, longitude: 106.7610 },
  'Lào Cai':               { latitude: 22.4856, longitude: 103.9707 },
  'Long An':               { latitude: 10.5439, longitude: 106.4108 },
  'Nam Định':              { latitude: 20.4380, longitude: 106.1620 },
  'Nghệ An':               { latitude: 18.6790, longitude: 105.6813 },
  'Ninh Bình':             { latitude: 20.2506, longitude: 105.9744 },
  'Ninh Thuận':            { latitude: 11.5645, longitude: 108.9899 },
  'Phú Thọ':               { latitude: 21.3989, longitude: 105.2210 },
  'Phú Yên':               { latitude: 13.0882, longitude: 109.0929 },
  'Quảng Bình':            { latitude: 17.4682, longitude: 106.6223 },
  'Quảng Nam':             { latitude: 15.8794, longitude: 108.3350 },
  'Quảng Ngãi':            { latitude: 15.1213, longitude: 108.8044 },
  'Quảng Ninh':            { latitude: 20.9595, longitude: 107.0816 },
  'Quảng Trị':             { latitude: 16.7404, longitude: 107.1854 },
  'Sóc Trăng':             { latitude: 9.6037,  longitude: 105.9800 },
  'Sơn La':                { latitude: 21.3256, longitude: 103.9188 },
  'Tây Ninh':              { latitude: 11.3105, longitude: 106.0980 },
  'Thái Bình':             { latitude: 20.4500, longitude: 106.3400 },
  'Thái Nguyên':           { latitude: 21.5942, longitude: 105.8480 },
  'Thanh Hóa':             { latitude: 19.8068, longitude: 105.7851 },
  'Thừa Thiên Huế':        { latitude: 16.4637, longitude: 107.5909 },
  'Tiền Giang':            { latitude: 10.3590, longitude: 106.3621 },
  'Trà Vinh':              { latitude: 9.9347,  longitude: 106.3453 },
  'Tuyên Quang':           { latitude: 21.8230, longitude: 105.2140 },
  'Vĩnh Long':             { latitude: 10.2536, longitude: 105.9722 },
  'Vĩnh Phúc':             { latitude: 21.3089, longitude: 105.6049 },
  'Yên Bái':               { latitude: 21.7228, longitude: 104.9114 },
};

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const NORMALIZED_LOOKUP: Record<string, { latitude: number; longitude: number }> = (() => {
  const out: Record<string, { latitude: number; longitude: number }> = {};
  for (const [name, coord] of Object.entries(VIETNAM_PROVINCE_CENTROIDS)) {
    out[normalizeKey(name)] = coord;
  }
  // Aliases tiếng Anh / portal phổ biến.
  out[normalizeKey('Ho Chi Minh')] = VIETNAM_PROVINCE_CENTROIDS['TP.HCM'];
  out[normalizeKey('Ho Chi Minh City')] = VIETNAM_PROVINCE_CENTROIDS['TP.HCM'];
  out[normalizeKey('HCMC')] = VIETNAM_PROVINCE_CENTROIDS['TP.HCM'];
  out[normalizeKey('Saigon')] = VIETNAM_PROVINCE_CENTROIDS['TP.HCM'];
  out[normalizeKey('Hanoi')] = VIETNAM_PROVINCE_CENTROIDS['Hà Nội'];
  out[normalizeKey('Da Nang')] = VIETNAM_PROVINCE_CENTROIDS['Đà Nẵng'];
  out[normalizeKey('Hai Phong')] = VIETNAM_PROVINCE_CENTROIDS['Hải Phòng'];
  out[normalizeKey('Can Tho')] = VIETNAM_PROVINCE_CENTROIDS['Cần Thơ'];
  out[normalizeKey('Hue')] = VIETNAM_PROVINCE_CENTROIDS['Thừa Thiên Huế'];
  return out;
})();

/** Trả về tọa độ trung tâm tỉnh nếu match (hỗ trợ alias EN & dấu/không dấu). */
export function getProvinceCentroid(name: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!name) return null;
  const direct = VIETNAM_PROVINCE_CENTROIDS[name];
  if (direct) return direct;
  const key = normalizeKey(name);
  if (!key) return null;
  return NORMALIZED_LOOKUP[key] ?? null;
}
