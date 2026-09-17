import requests
import random
import time
import threading
from datetime import datetime

# ==========================================
# 設定
# ==========================================
API_URL = "http://localhost:8900/upload_message"
RATE_PER_SEC = 5          # 每秒送幾筆
DURATION_SEC = 60         # 跑幾秒；設 0 = 一直跑到 Ctrl+C
TIMEOUT = 5

BUILDINGS = ["K11", "K18", "K21", "K22", "K25"]
FLOORS = ["1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "9F", "10F", "11F", "12F"]
LEVELS = ["A", "B", "C", "D", "E"]          # D/E 會被後端過濾掉，用來確認過濾正常
LEVEL_WEIGHTS = [2, 3, 4, 1, 1]

# 混合三種情境：直接命中 AlarmCode / 括號代號命中 / Not Found
ALARM_SAMPLES = [
    # (AlarmCode, AlarmMessage)
    ("LIFT_4271", "01096 異常-手臂.手臂_異常_預留(R5017.F)"),
    ("LIFT_4272", "01097 異常-手臂.手臂_異常_手臂機構-Y1軸硬體異常(R5018.0)"),
    ("DRYA0146", "L01_出料端_上_頂升_上升_異常(L145)"),
    ("OHT_WD7093C", "008_在路段:1-C11R_[L145] OHT前方障礙檢_近_位置_519197"),
    ("STRESS_NOCODE", "L02_進料端_下_頂升_下降_異常(L145)"),          # AlarmCode 不在 CSV，走括號提取
    ("UNKNOWN_CODE_999", "這是一個完全未知的警報訊息，沒有任何括號。"),   # Not Found
    ("29502", "與中控失去連線。The shuttle lost its connection with postgreSQL."),
]

# ==========================================
# 統計
# ==========================================
stats = {"sent": 0, "ok": 0, "fail": 0, "posted": 0, "filtered": 0, "err": 0}
stats_lock = threading.Lock()


def build_payload(seq: int) -> dict:
    building = random.choice(BUILDINGS)
    floor = random.choice(FLOORS)
    code, msg = random.choice(ALARM_SAMPLES)
    level = random.choices(LEVELS, weights=LEVEL_WEIGHTS, k=1)[0]
    return {
        "System": f"{building}-{floor}-OHT",
        "Mechanism": "OTHER",
        "ClassName": f"{building}-{floor}_ASEF1-OHT-MOHT_CAR-{seq % 20:03d}",
        "Plant": "A3-F1",
        "Site": "OHT",
        "Place": f"{building}-{floor}",
        "AlarmCode": code,
        "AlarmMessage": f"[#{seq}] {msg}",
        "Flag": "1",
        "Level": level,
    }


def send_one(seq: int):
    payload = build_payload(seq)
    with stats_lock:
        stats["sent"] += 1
    try:
        r = requests.post(API_URL, json=payload, timeout=TIMEOUT)
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        with stats_lock:
            if r.status_code == 200:
                stats["ok"] += 1
                if body.get("status") == "success":
                    stats["posted"] += 1
                else:
                    stats["filtered"] += 1
            else:
                stats["fail"] += 1
        print(f"#{seq:05d} {payload['Place']:<8} Lv={payload['Level']} Code={payload['AlarmCode']:<18} "
              f"→ {r.status_code} {body.get('status', '')} / {body.get('match_result', {}).get('Match_Method', '')}")
    except Exception as e:
        with stats_lock:
            stats["err"] += 1
        print(f"#{seq:05d} ❌ {e}")


def main():
    interval = 1.0 / RATE_PER_SEC
    start = time.time()
    seq = 0
    print(f"🚀 壓力測試開始：每秒 {RATE_PER_SEC} 筆，"
          f"{'持續到 Ctrl+C' if DURATION_SEC == 0 else f'共 {DURATION_SEC} 秒'}  → {API_URL}")

    try:
        next_tick = time.time()
        while DURATION_SEC == 0 or time.time() - start < DURATION_SEC:
            seq += 1
            # 用 thread 送，避免單筆慢拖累節奏
            threading.Thread(target=send_one, args=(seq,), daemon=True).start()
            next_tick += interval
            sleep_for = next_tick - time.time()
            if sleep_for > 0:
                time.sleep(sleep_for)
    except KeyboardInterrupt:
        print("\n⏹ 手動停止")

    time.sleep(TIMEOUT)  # 等最後幾筆回來
    elapsed = time.time() - start
    print("\n" + "=" * 50)
    print(f"⏱ 耗時 {elapsed:.1f}s，實際速率 {stats['sent'] / elapsed:.2f} 筆/秒")
    print(f"📤 送出 {stats['sent']}  ✅ 成功 {stats['ok']}  ❌ HTTP失敗 {stats['fail']}  💥 連線錯誤 {stats['err']}")
    print(f"📥 推送前端(A/B/C) {stats['posted']}  ⏭ 被過濾(D/E) {stats['filtered']}")
    print("=" * 50)


if __name__ == "__main__":
    main()