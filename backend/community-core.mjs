export const SHARING = ['visits', 'months', 'dives', 'time', 'depth'];
export const ACTIVITIES = ['freediving', 'ocean-swimming', 'spearfishing'];
export function localDay(now, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function windowFor(now, zone) {
  const today = localDay(now, zone),
    date = new Date(today + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 29);
  return { today, start: date.toISOString().slice(0, 10) };
}
export function visitCount(days, now, zone) {
  const { start, today } = windowFor(now, zone);
  return new Set(days.filter((d) => d >= start && d <= today)).size;
}
export function tierFor({
  viewer,
  owner,
  viewerDays = [],
  ownerDays = [],
  connection,
  blocked = false,
  now = new Date(),
  zone = 'Australia/Sydney',
}) {
  if (blocked) return -1;
  if (viewer === owner || connection === 'accepted') return 2;
  if (!viewer?.open || !owner?.open) return 0;
  const count = Math.min(
    visitCount(viewerDays, now, zone),
    visitCount(ownerDays, now, zone),
  );
  return count >= 5 ? 2 : count >= 3 ? 1 : 0;
}
export function visibleStats(stats, sharing, tier) {
  const result = {};
  if (tier >= 1) {
    if (sharing?.visits) result.visits = stats.visits;
    if (sharing?.months) result.months = stats.months;
  }
  if (tier >= 2) {
    if (sharing?.dives) result.dives = stats.dives;
    if (sharing?.time) result.minutes = stats.minutes;
    if (sharing?.depth) result.typicalDepth = stats.typicalDepth;
  }
  return result;
}
export function preferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid profile.');
  const text = (v, n) =>
      String(v || '')
        .trim()
        .slice(0, n),
    list = (v, allowed) =>
      Array.isArray(v)
        ? [...new Set(v)].filter((x) => allowed.includes(x))
        : [];
  const link = (value, platform) => {
    if (!value) return '';
    let u;
    try {
      u = new URL(value);
    } catch {
      throw Error(`Enter a full ${platform} profile URL.`);
    }
    const host = u.hostname.replace(/^www\./, '');
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      host !== platform + '.com' ||
      !(
        platform === 'instagram'
          ? /^\/[A-Za-z0-9._]{1,30}\/?$/
          : /^\/@[A-Za-z0-9._]{1,30}\/?$/
      ).test(u.pathname)
    )
      throw Error(`Enter a ${platform} profile link.`);
    return `https://www.${platform}.com${u.pathname.replace(/\/$/, '')}/`;
  };
  return {
    displayName: text(value.displayName, 80) || 'Diver',
    bio: text(value.bio, 500),
    instagram: link(value.instagram, 'instagram'),
    tiktok: link(value.tiktok, 'tiktok'),
    open: value.open === true,
    sharing: Object.fromEntries(
      SHARING.map((k) => [k, value.sharing?.[k] === true]),
    ),
    beaches: Array.isArray(value.beaches)
      ? [...new Set(value.beaches)]
          .filter((x) => typeof x === 'string')
          .slice(0, 20)
      : [],
    activities: list(value.activities, ACTIVITIES),
    availability: list(value.availability, [
      'weekday mornings',
      'weekday afternoons',
      'weekend mornings',
      'weekend afternoons',
    ]),
    experience: ['new', 'comfortable', 'experienced'].includes(value.experience)
      ? value.experience
      : '',
    depthGoal:
      Number.isFinite(value.depthGoal) &&
      value.depthGoal > 0 &&
      value.depthGoal <= 100
        ? value.depthGoal
        : null,
  };
}
export function compatibility(a, b) {
  const reasons = [],
    same = (key) => a[key]?.some((v) => b[key]?.includes(v));
  let score = 0;
  if (same('beaches')) {
    score += 8;
    reasons.push('Shared beach');
  }
  if (same('activities')) {
    score += 4;
    reasons.push('Shared water activities');
  }
  if (same('availability')) {
    score += 3;
    reasons.push('Similar usual times');
  }
  if (a.experience && a.experience === b.experience) {
    score++;
    reasons.push('Similar self-described experience');
  }
  if (a.depthGoal && b.depthGoal && Math.abs(a.depthGoal - b.depthGoal) <= 5) {
    score++;
    reasons.push('Similar depth goals');
  }
  return { score, reasons };
}
export function socialPost(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw Error('Enter a full post URL.');
  }
  const host = u.hostname.replace(/^www\./, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port)
    throw Error('Use an HTTPS post link.');
  if (
    host === 'instagram.com' &&
    /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
  )
    return `https://www.instagram.com${u.pathname}`;
  if (
    host === 'tiktok.com' &&
    /^\/@[A-Za-z0-9._]+\/video\/\d+\/?$/.test(u.pathname)
  )
    return `https://www.tiktok.com${u.pathname}`;
  throw Error('Use an Instagram post/Reel or a full TikTok video link.');
}

export function nextDayAt(now, zone) {
  const today = localDay(now, zone);
  let lo = now.getTime(),
    hi = lo + 27 * 3600000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDay(new Date(mid), zone) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}
