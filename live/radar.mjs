const normalize = value => String(value || '').trim().normalize('NFKC').toLowerCase();
const radians = degrees => degrees * Math.PI / 180;
const fresh = row => row && Date.now() - row.at < 86400000;
function distance(a, b) {
  const lat = radians(b.lat - a.lat), lon = radians(b.lon - a.lon);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function searchRadar(db, address, filters) {
  const ownRow = db.prepare('SELECT body FROM profiles WHERE address=?').get(address);
  const own = ownRow ? JSON.parse(ownRow.body) : {};
  const ownLocation = db.prepare('SELECT lat,lon,at FROM radar_locations WHERE address=?').get(address);
  const hasLocation = Boolean(fresh(ownLocation));
  if (filters.radius && !hasLocation) throw Object.assign(new Error('请先主动开启附近定位，或选择不限距离。'), {status:409});
  const interests = new Set((own.interests || []).map(normalize));
  const saved = new Set(db.prepare('SELECT target FROM radar_saved WHERE owner=?').all(address).map(row => row.target));
  const rows = db.prepare('SELECT p.address,p.body,l.lat,l.lon,l.at FROM profiles p LEFT JOIN radar_locations l ON l.address=p.address WHERE p.address != ? AND NOT EXISTS(SELECT 1 FROM connection_blocks b WHERE (b.owner=? AND b.target=p.address) OR (b.owner=p.address AND b.target=?))').all(address,address,address);
  const candidates = [];
  for (const row of rows) {
    const profile = JSON.parse(row.body);
    if (!profile.discoverable) continue;
    if (filters.city && normalize(profile.city) !== normalize(filters.city)) continue;
    if (filters.intention && normalize(profile.intention) !== normalize(filters.intention)) continue;
    // Gender and age are self-reported free-text fields; the audience filter only
    // keeps candidates whose declared values satisfy the range, never guessing.
    if (filters.gender && normalize(profile.gender) !== normalize(filters.gender)) continue;
    const declaredAge = /^\d{1,3}$/.test(String(profile.age ?? '').trim()) ? Number(String(profile.age).trim()) : Number(/^\s*(\d{1,3})\D?/.exec(String(profile.age ?? ''))?.[1] ?? NaN);
    if (filters.ageMin > 0 && !(Number.isInteger(declaredAge) && declaredAge >= filters.ageMin)) continue;
    if (filters.ageMax > 0 && !(Number.isInteger(declaredAge) && declaredAge <= filters.ageMax)) continue;
    const km = hasLocation && fresh(row) ? distance(ownLocation, row) : null;
    if (filters.radius && (km === null || km > filters.radius)) continue;
    const common = [...new Map(profile.interests.filter(i => interests.has(normalize(i))).map(i => [normalize(i), i])).values()];
    const sameIntention = Boolean(normalize(own.intention) && normalize(own.intention) === normalize(profile.intention));
    const sameCity = Boolean(normalize(own.city) && normalize(own.city) === normalize(profile.city));
    // Nearby resonance: coarse-grid distance becomes a first-class scoring
    // factor so "附近最合适" is real ranking, not a tie-breaker afterthought.
    const bands = [[20, 6, '约 20 km 内'], [50, 4, '约 50 km 内'], [100, 2, '约 100 km 内']];
    const band = km !== null && km !== undefined ? bands.find(([limit]) => km <= limit) : null;
    const reasons = [...(common.length ? ['共同兴趣：' + common.join('、')] : []), ...(sameIntention ? ['关系意向一致'] : []), ...(band ? ['附近 · ' + band[2] + '（粗略区域估算）'] : sameCity ? ['资料填写了同一城市'] : [])];
    const nearbyScore = band ? band[1] : 0;
    candidates.push({address:row.address,name:profile.name,city:profile.city,age:profile.age,interests:profile.interests,statement:profile.statement,intention:profile.intention,avatarUrl:profile.avatarUrl||'',occupation:profile.occupation||'',common,reasons:reasons.length?reasons:['公开资料候选，暂未发现共同偏好'],distanceKm:km===null?null:Math.round(km/10)*10,saved:saved.has(row.address),score:common.length*4+nearbyScore+Number(sameIntention)*3+Number(sameCity)*2,_distance:km??Infinity});
  }
  candidates.sort((a,b)=>b.score-a.score||a._distance-b._distance||a.address.localeCompare(b.address));
  return {candidates:candidates.slice(0,100).map(({_distance,score,...candidate})=>candidate),total:candidates.length,hasLocation,limited:candidates.length>100,method:'shared-interests-intention-city',filters};
}
