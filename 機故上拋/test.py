import requests

# 若伺服器在其他電腦，將 localhost 換成該電腦 IP
URL = "http://localhost:8900/upload_message"

# (System, Place, AlarmCode, AlarmMessage, 預期等級)
# 前三筆是原本的測試；後面幾筆用來測 Group 下拉篩選 (不同棟別/樓層) 與不推送的等級
# 所有 AlarmCode 都是 query_result.csv 裡真實存在的
tests = [
    # --- 原本三筆：K21-8F → Group「K21-8F&9F」 ---
    ("K21-8F-3390",  "K21-8F-3390",  "RB1129",      "F1129_RB上夾持氣缸的IO狀態異常",          "A"),
    ("K21-8F-3390",  "K21-8F-3390",  "RB1191",      "F1191_ST1有帳無料",                       "B"),
    ("K21-8F-3390",  "K21-8F-3390",  "RB1147",      "F1147_RB",                                "C"),

    # --- Group 篩選用 ---
    ("K115F_3390",   "K11-5F-3390",  "1003",        "Robot防撞Sensor觸發",                     "A"),   # K11-3~6F
    ("K225F_3390",   "K22-5F-3390",  "A011F0B",     "(A.1F0B) 機台EMO-1觸發(X60A未OFF)",        "B"),   # K22-5F&8F
    ("K18-11F-3390", "K18-11F-3390", "ROBOT_A0001", "F1_全機原點復歸失敗",                     "A"),   # K18

    # --- Level D：應回 success_stored_only，不會出現在前端 ---
    ("K21-8F-3390",  "K21-8F-3390",  "VA13810001",  "警告 - 機台 : 功能 - 蜂鳴器關閉! (R1004.0)", "D"),
]

ok = 0
for system, place, code, message, expected in tests:
    plant, site = place.split("-")[0], place.split("-")[1]
    payload = {
        "System": system,
        "Mechanism": "TEST",
        "ClassName": "TEST",
        "Plant": plant,
        "Site": site,
        "Place": place,
        "AlarmCode": code,
        "AlarmMessage": f"[測試發送] {message}",
        "Flag": "1",
    }

    print(f"\n發送 {code} ({place})，預期等級：{expected}")

    try:
        response = requests.post(URL, json=payload, timeout=15)
        print(f"HTTP {response.status_code}")
        print(response.text)
        response.raise_for_status()
        got = response.json().get("level")
        print("✔ 等級正確" if got == expected else f"✘ 等級不符：實際 {got}")
        ok += got == expected
    except requests.RequestException as exc:
        print(f"發送失敗：{exc}")

print(f"\n===== {ok}/{len(tests)} 筆等級符合預期 =====")
print("前端應顯示 6 張卡片 (D 級不顯示)；Group 下拉可逐一切換 K11-3~6F / K22-5F&8F / K21-8F&9F / K18 確認篩選。")