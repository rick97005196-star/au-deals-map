#!/usr/bin/env python3
"""雲端「網站每日報告」用的資料整理腳本（不影響網站，不會被部署）。

給雲端排程「網站每日報告（雲端）」用：電腦沒開、桌面版沒寄出每日報告時，
由雲端整理 GitHub 上讀得到的資料（252 超市、255 找優惠），輸出 JSON。
集簽（D1）、Threads 通知、網站是否上線等資料由排程任務另外查。

用法：
  python3 ops/daily-report.py --since 2026-11-17T12:14:00Z [--now 2026-11-18T12:44:00Z]
--since 是上一封每日報告的寄出時間（UTC）。需要 git、gh（au-supermarket-specials 已加入工作階段）。
"""
import argparse
import collections
import datetime as dt
import json
import re
import subprocess
import tempfile
import urllib.error
import urllib.request

OWNER = 'rick97005196-star'
SUPER = 'au-supermarket-specials'
DEALS = 'au-deals-map'
BNE = dt.timezone(dt.timedelta(hours=10))  # 布里斯本沒有夏令時間
DAILY = re.compile(r'^每日更新 (\d+)/(\d+)(?![0-9])[^：:]*[：:]新增')
RUN_NAMES = {'快速部署網頁（只改畫面時使用）': '快速部署網頁'}
COLES_DEPS = {
    'fruit-vegetables': '水果蔬菜', 'meat-seafood': '肉品海鮮', 'dairy-eggs-fridge': '乳製品與冷藏',
    'bakery': '麵包烘焙', 'deli': '熟食', 'pantry': '食品雜貨', 'drinks': '飲料', 'frozen': '冷凍食品',
    'household': '家用品', 'health-beauty': '健康美容', 'baby': '嬰兒用品', 'pet': '寵物用品',
    'liquor': '酒類', 'snacks': '零食',
}


def parse_time(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))


def iso(t):
    return t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def md(t):
    return f'{t.month}/{t.day}'


def mdhm(t):
    t = t.astimezone(BNE)
    return f'{t.month}/{t.day} {t:%H:%M}'


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def gh(path):
    r = run(['gh', 'api', path])
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:200])
    return json.loads(r.stdout)


def raw_json(repo, ref, path):
    url = f'https://raw.githubusercontent.com/{OWNER}/{repo}/{ref}/{path}'
    with urllib.request.urlopen(url, timeout=90) as f:
        return json.load(f)


def deals(since, now, out):
    """255 找優惠：每日更新是否完成、過去 7 天漏哪幾天、報告期間有哪些更新。"""
    tmp = tempfile.mkdtemp()
    r = run(['git', 'clone', '-q', '--filter=blob:none', '--no-checkout', '--depth', '300',
             f'https://github.com/{OWNER}/{DEALS}', tmp])
    if r.returncode != 0:
        out['errors'].append(f'255 找優惠：讀不到 GitHub（{r.stderr.strip()[:120]}）')
        return
    log = run(['git', '-C', tmp, 'log', '-n', '300', '--format=%cI%x09%s']).stdout.splitlines()
    commits = [(parse_time(t), s) for t, s in (l.split('\t', 1) for l in log if '\t' in l)]
    commits = [(t, s) for t, s in commits if t <= now]  # 只看報告時間以前的紀錄
    done = {}
    for t, s in commits:  # 由新到舊，第一筆就是那天最後完成的時間
        m = DAILY.match(s)
        if m:
            done.setdefault((int(m.group(1)), int(m.group(2))), t)
    today = now.astimezone(BNE).date()
    last7 = [today - dt.timedelta(days=i) for i in range(6, -1, -1)]
    missed = [d for d in last7 if (d.month, d.day) not in done]
    latest = next((t for t, s in commits if DAILY.match(s)), None)
    if latest:
        days = (now - latest).total_seconds() / 86400
        out['status'].append(f'找優惠每日更新：最近一次 {mdhm(latest)}，距今約 {days:.1f} 天' + ('（過久）' if days > 1.5 else ''))
    else:
        out['status'].append('找優惠每日更新：最近 300 筆紀錄裡沒有每日更新')
    out['status'].append('找優惠每日更新：' + (f'過去 7 天漏 {len(missed)} 天（' + '、'.join(md(d) for d in missed) + '）' if missed else '過去 7 天都有跑'))
    if (today.month, today.day) not in done:
        out['issues'].append(
            f'255 找優惠，找優惠每日更新 {md(today)} 沒有成功執行（過去 7 天共漏 {len(missed)} 天）。'
            '可能的原因／建議：清晨的雲端排程和中午的「每日排程補跑檢查」都沒有成功（常見原因是用量額度用完），'
            '請到 claude.ai 的排程（Routines）頁面看「255 澳洲活動優惠地圖每日更新」的執行紀錄。')
    win = [(t, s) for t, s in commits if since <= t <= now]
    daily = [s for t, s in win if DAILY.match(s)]
    tidy = [s for t, s in win if s.startswith('自動整理')]
    other = [s for t, s in win if not DAILY.match(s) and not s.startswith('自動整理') and not s.startswith('每日更新')]
    parts = []
    if daily:
        parts.append('每日更新 ' + '；'.join(s.split('：', 1)[-1] for s in daily))
    if tidy:
        parts.append(f'自動整理下架已結束項目 {len(tidy)} 次')
    if other:
        parts.append('人手改：' + '；'.join(other[:6]))
    out['updates']['255 找優惠'] = '；'.join(parts) if parts else '沒有更新'


def supermarket(since, now, out):
    """252 超市：自動化執行次數、特價筆數（和上週同時間比）、平常價清單、報告期間的更新。"""
    # 1. GitHub Actions 執行次數
    try:
        runs, page = [], 1
        while True:
            d = gh(f'repos/{OWNER}/{SUPER}/actions/runs?per_page=100&page={page}&created={iso(since)}..{iso(now)}')
            runs += d['workflow_runs']
            if not d['workflow_runs'] or len(runs) >= d['total_count']:
                break
            page += 1
        by = collections.defaultdict(list)
        for r in runs:
            by[RUN_NAMES.get(r['name'], r['name'])].append(r)
        for name, rs in sorted(by.items(), key=lambda kv: -len(kv[1])):
            fails = [r for r in rs if r['conclusion'] in ('failure', 'timed_out', 'startup_failure')]
            line = f'超市：{name}：執行 {len(rs)} 次，失敗 {len(fails)} 次'
            if fails:
                when = '、'.join(mdhm(parse_time(r['created_at'])) for r in fails[:5])
                latest = max(rs, key=lambda r: r['created_at'])
                if latest['conclusion'] in ('failure', 'timed_out', 'startup_failure'):
                    line += f'（{when}，最近一次仍失敗）'
                    out['issues'].append(f'252 超市，「{name}」最近一次執行失敗（{mdhm(parse_time(latest["created_at"]))}）。'
                                         '可能的原因／建議：到 GitHub 的 Actions 頁面看失敗原因。')
                else:
                    line += f'（{when}，已恢復）'
                    out['fyi'].append(f'超市排程「{name}」失敗 {len(fails)} 次（{when}），之後已自動恢復。')
            out['status'].append(line)
        if not runs:
            out['status'].append('超市：報告期間沒有自動化執行紀錄')
            out['issues'].append('252 超市，報告期間 GitHub Actions 完全沒有執行。可能的原因／建議：Cloudflare 定時器和 GitHub 備援排程可能都停了，請到 GitHub 的 Actions 頁面確認。')
    except Exception as e:  # noqa: BLE001
        out['errors'].append(f'252 超市：讀不到 GitHub Actions 紀錄（{e}）')

    # 2. 特價筆數（現在 vs. 上週同時間）
    try:
        def counts_at(until):
            c = gh(f'repos/{OWNER}/{SUPER}/commits?path=static/data/specials.json&until={iso(until)}&per_page=1')
            data = raw_json(SUPER, c[0]['sha'], 'static/data/specials.json')
            return collections.Counter(x.get('store') for x in data)
        a, b = counts_at(now), counts_at(now - dt.timedelta(days=7))
        out['status'].append('特價筆數：' + '、'.join(f'{s} {a[s]} 筆（上週 {b[s]}）' for s in ('Coles', 'Woolworths', 'ALDI')))
        for s in ('Coles', 'Woolworths', 'ALDI'):
            if a[s] == 0:
                out['issues'].append(f'252 超市，{s} 目前特價 0 筆。可能的原因／建議：爬蟲可能被擋或資料被清空，請看 GitHub Actions 紀錄。')
    except Exception as e:  # noqa: BLE001
        out['errors'].append(f'252 超市：讀不到特價資料（{e}）')

    # 3. 平常價清單
    try:
        reg = raw_json(SUPER, 'main', 'static/data/regular.json')
        rw = raw_json(SUPER, 'main', 'static/data/regular-woolworths.json')
        line = (f'平常價清單：比價用清單 {reg.get("updated_at", "?")} 更新、{len(reg.get("items", []))} 筆；'
                f'Woolworths 完整清單 {rw.get("updated_at", "?")}、{len(rw.get("items", []))} 筆；')
        try:
            rc = raw_json(SUPER, 'main', 'static/data/regular-coles.json')
            line += f'Coles 完整清單 {rc.get("updated_at", "?")}、{len(rc.get("items", []))} 筆'
        except urllib.error.HTTPError:
            p = raw_json(SUPER, 'main', 'data/coles_regular_progress.json')
            dep = COLES_DEPS.get(p.get('dep'), p.get('dep', '?'))
            line += f'Coles 完整清單還沒有（讀到{dep}第 {p.get("page", "?")} 頁）'
            out['fyi'].append('Coles 的平常價清單（regular-coles.json）還沒完成過。')
        out['status'].append(line)
    except Exception as e:  # noqa: BLE001
        out['errors'].append(f'252 超市：讀不到平常價清單（{e}）')

    # 4. 報告期間的更新（commit）
    try:
        msgs, page = [], 1
        while True:
            c = gh(f'repos/{OWNER}/{SUPER}/commits?since={iso(since)}&until={iso(now)}&per_page=100&page={page}')
            msgs += [x['commit']['message'].splitlines()[0] for x in c]
            if len(c) < 100:
                break
            page += 1
        bots = ('Auto-update weekly specials', 'Save scraper memory', 'Weekly regular prices')
        auto = sum(m.startswith(bots[0]) for m in msgs)
        mem = sum(m.startswith(bots[1]) for m in msgs)
        reg = sum(m.startswith(bots[2]) for m in msgs)
        other = [m for m in msgs if not m.startswith(bots)]
        parts = []
        if auto or mem:
            parts.append(f'特價自動更新 {auto} 次、記憶存檔 {mem} 次')
        if reg:
            parts.append(f'平常價自動更新 {reg} 次')
        if other:
            parts.append('人手改：' + '；'.join(other[:6]))
        out['updates']['252 超市'] = '；'.join(parts) if parts else '沒有更新'
    except Exception as e:  # noqa: BLE001
        out['errors'].append(f'252 超市：讀不到更新紀錄（{e}）')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', required=True, help='上一封每日報告的寄出時間（UTC ISO）')
    ap.add_argument('--now', help='報告時間（UTC ISO），預設現在')
    a = ap.parse_args()
    now = parse_time(a.now) if a.now else dt.datetime.now(dt.timezone.utc)
    since = parse_time(a.since)
    out = {'window': f'{since.astimezone(BNE):%Y/%-m/%-d %H:%M} ～ {now.astimezone(BNE):%Y/%-m/%-d %H:%M}（布里斯本時間）',
           'status': [], 'updates': {}, 'issues': [], 'fyi': [], 'errors': []}
    supermarket(since, now, out)
    deals(since, now, out)
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
