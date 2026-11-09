// 개인 계정과 스튜디오 계정의 지난 1년 기여를 날짜별로 합쳐 잔디 SVG 두 장(다크·라이트)을 그린다.
// 회사·개인 게임 커밋은 스튜디오 계정에 쌓이므로 프로필 기본 잔디만으로는 활동이 안 보인다.
// GitHub GraphQL 을 먼저 쓰고, 실패하면 공개 잔디 API 로 대신한다. 외부 의존성 없음 (Node 20)
import { writeFileSync } from 'node:fs';

const USERS = ['sungwoonie', 'StarCloudgames-Official'];
const token = process.env.GITHUB_TOKEN;

async function fromGraphQL(login) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'sungwoonie-profile' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || res.status));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }));
}

async function fromPublicApi(login) {
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${login}?y=last`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).contributions.map((d) => ({ date: d.date, count: d.count }));
}

async function load(login) {
  if (token) {
    try { return await fromGraphQL(login); } catch (e) { console.warn(`GraphQL 실패(${login}):`, e.message); }
  }
  return fromPublicApi(login);
}

const perUser = await Promise.all(USERS.map(load));
const byDate = new Map();
for (const days of perUser) for (const d of days) byDate.set(d.date, (byDate.get(d.date) || 0) + d.count);
const days = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-371);
const total = days.reduce((n, [, c]) => n + c, 0);

// 기여가 있던 날들의 사분위로 4단계. 몰아친 하루 때문에 나머지가 다 옅어지지 않게 한다
const nz = days.map(([, c]) => c).filter((c) => c > 0).sort((a, b) => a - b);
const q = (p) => nz[Math.min(nz.length - 1, Math.floor(nz.length * p))] || 0;
const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
const level = (c) => (!c ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4);

const CELL = 11, GAP = 3, STEP = CELL + GAP, LEFT = 30, TOP = 46;
const first = new Date(days[0][0] + 'T00:00:00Z');
const pad = first.getUTCDay();
const weeks = Math.ceil((pad + days.length) / 7);
const W = LEFT + weeks * STEP + 4, H = TOP + 7 * STEP + 30;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const THEMES = {
  dark: { text: '#e6edf3', muted: '#8b949e', empty: '#161b22', fill: '#f59e0b', op: [0, 0.3, 0.5, 0.75, 1] },
  light: { text: '#1f2328', muted: '#59636e', empty: '#ebedf0', fill: '#d97706', op: [0, 0.3, 0.5, 0.75, 1] },
};

function render(t) {
  const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
  let cells = '', months = '', lastMonth = -1;
  days.forEach(([date, count], i) => {
    const idx = i + pad, col = Math.floor(idx / 7), row = idx % 7;
    const x = LEFT + col * STEP, y = TOP + row * STEP, lv = level(count);
    const fill = lv ? `fill="${t.fill}" fill-opacity="${t.op[lv]}"` : `fill="${t.empty}"`;
    cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" ${fill}><title>${date}: ${count}</title></rect>`;
    const m = new Date(date + 'T00:00:00Z').getUTCMonth();
    if (row === 0 && m !== lastMonth && col < weeks - 1) {
      months += `<text x="${x}" y="${TOP - 8}" font-size="10" fill="${t.muted}">${MONTHS[m]}</text>`;
      lastMonth = m;
    }
  });
  const dayLabels = [['Mon', 1], ['Wed', 3], ['Fri', 5]]
    .map(([n, r]) => `<text x="0" y="${TOP + r * STEP + 9}" font-size="10" fill="${t.muted}">${n}</text>`).join('');
  // 범례 폭: Less(30) + 칸 다섯 + 여백 4 + More(28)
  const lx = W - 4 - (30 + 5 * STEP + 4 + 28), ly = H - 16;
  const legend = [0, 1, 2, 3, 4].map((lv, i) => {
    const fill = lv ? `fill="${t.fill}" fill-opacity="${t.op[lv]}"` : `fill="${t.empty}"`;
    return `<rect x="${lx + 30 + i * STEP}" y="${ly}" width="${CELL}" height="${CELL}" rx="2" ${fill}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" ${font}>
<text x="0" y="16" font-size="14" font-weight="600" fill="${t.text}">${total.toLocaleString('en-US')} contributions in the last year</text>
<text x="${W - 4}" y="16" font-size="11" fill="${t.muted}" text-anchor="end">sungwoonie + StarCloudgames-Official</text>
${months}${dayLabels}${cells}
<text x="${lx}" y="${ly + 9}" font-size="10" fill="${t.muted}">Less</text>${legend}<text x="${lx + 30 + 5 * STEP + 4}" y="${ly + 9}" font-size="10" fill="${t.muted}">More</text>
</svg>
`;
}

writeFileSync(new URL('../assets/contributions-dark.svg', import.meta.url), render(THEMES.dark));
writeFileSync(new URL('../assets/contributions-light.svg', import.meta.url), render(THEMES.light));
console.log(`total ${total}, days ${days.length}`);
