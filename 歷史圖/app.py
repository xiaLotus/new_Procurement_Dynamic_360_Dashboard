from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import csv, os
from collections import defaultdict

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, 'status_change_log.csv')

_cache = None

def rows():
    global _cache
    if _cache is None:
        with open(CSV_PATH, encoding='utf-8-sig') as f:
            _cache = list(csv.DictReader(f))
    return _cache

def ipg(ip):  return '.'.join(ip.split('.')[:2])
def ips3(ip): return '.'.join(ip.split('.')[:3])
def ipk(ip):
    try: return tuple(int(x) for x in ip.split('.'))
    except: return (999,)*4


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/api/tl/subnet_stats')
def tl_subnet_stats():
    try:
        ip_events = defaultdict(list)
        for r in rows():
            ip = r['IP']
            if len(ip.split('.')) == 4:
                ip_events[ip].append((r['時間'], r['新狀態'], r['設備類型']))

        subnet_stats = defaultdict(lambda: {'alive':0,'dead':0,'total':0,'types':set()})
        for ip, evs in ip_events.items():
            evs.sort()
            last_status = evs[-1][1]
            subnet = ips3(ip)
            subnet_stats[subnet]['total'] += 1
            subnet_stats[subnet][last_status] += 1
            subnet_stats[subnet]['types'].add(evs[-1][2])

        result = []
        for s, st in sorted(subnet_stats.items(),
                             key=lambda x: tuple(int(n) for n in x[0].split('.'))):
            result.append({
                'subnet': s,
                'alive':  st['alive'],
                'dead':   st['dead'],
                'total':  st['total'],
                'types':  list(st['types']),
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tl/subnet_grid')
def tl_subnet_grid():
    try:
        subnet = request.args.get('subnet', '')
        if not subnet:
            return jsonify({'error': 'subnet required'}), 400

        all_times = sorted(r['時間'] for r in rows())
        tmin, tmax = all_times[0], all_times[-1]

        ip_ev, ip_meta = defaultdict(list), {}
        for r in rows():
            parts = r['IP'].split('.')
            if len(parts) == 4 and '.'.join(parts[:3]) == subnet:
                ip_ev[r['IP']].append({
                    't':   r['時間'],
                    'old': r['舊狀態'],
                    'new': r['新狀態'],
                })
                if r['IP'] not in ip_meta:
                    ip_meta[r['IP']] = {
                        'tp':  r['設備類型'],
                        'mid': r['Machine_ID'],
                        'dn':  r['Device_Name'],
                    }

        # 只回傳有資料的 IP（移除空的）
        devs = []
        for oct in range(1, 255):
            ip  = f'{subnet}.{oct}'
            evs = sorted(ip_ev.get(ip, []), key=lambda e: e['t'])
            if not evs:
                continue   # 沒有任何事件 → 跳過

            segs = []
            if evs[0]['t'] > tmin:
                segs.append({'s': tmin, 'e': evs[0]['t'], 'v': evs[0]['old']})
            for i, ev in enumerate(evs):
                segs.append({
                    's': ev['t'],
                    'e': evs[i+1]['t'] if i+1 < len(evs) else tmax,
                    'v': ev['new'],
                })
            meta = ip_meta[ip]
            devs.append({
                'ip':  ip,
                'oct': oct,
                'tp':  meta['tp'],
                'mid': meta['mid'],
                'dn':  meta['dn'],
                'segs': segs,
            })

        return jsonify({'devs': devs, 'tmin': tmin, 'tmax': tmax, 'subnet': subnet})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/tl/data')
def tl_data():
    try:
        dtype  = request.args.get('type', '')
        gfilt  = request.args.get('group', '')
        prefix = request.args.get('prefix', '')
        chonly = request.args.get('changed_only', '1') == '1'

        ip_cnt = defaultdict(int)
        for r in rows(): ip_cnt[r['IP']] += 1

        ip_ev, ip_meta = defaultdict(list), {}
        for r in rows():
            ip = r['IP']
            if dtype  and r['設備類型'] != dtype:           continue
            if gfilt  and ipg(ip) != gfilt:                 continue
            if prefix and not ip.startswith(prefix + '.'):  continue
            if chonly and ip_cnt[ip] <= 1:                   continue
            ip_ev[ip].append((r['時間'], r['新狀態']))
            if ip not in ip_meta:
                ip_meta[ip] = (r['設備類型'], r['Machine_ID'], r['Device_Name'])

        devs, times = [], []
        for ip, evs in ip_ev.items():
            evs.sort()
            times += [e[0] for e in evs]
            segs = [
                {'s': evs[i][0], 'e': evs[i+1][0] if i+1 < len(evs) else None, 'v': evs[i][1]}
                for i in range(len(evs))
            ]
            tp, mid, dn = ip_meta[ip]
            devs.append({
                'ip': ip, 'g': ipg(ip), 'sub': ips3(ip),
                'tp': tp, 'mid': mid, 'dn': dn, 'segs': segs,
            })

        devs.sort(key=lambda d: (ipg(d['ip']), ips3(d['ip']), ipk(d['ip'])))
        return jsonify({
            'devs': devs,
            'tmin': min(times) if times else '',
            'tmax': max(times) if times else '',
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True, use_reloader=False)