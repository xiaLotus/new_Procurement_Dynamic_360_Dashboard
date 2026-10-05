import requests

# 若伺服器在其他電腦，將 localhost 換成該電腦 IP
URL = "http://localhost:8900/upload_message"

# 模擬資料：System + AlarmCode 都取自 query_result.csv 的真實 Level A / B / C 組合
# 每筆 ClassName 都不同；同一份再執行一次，A~C 級應全部回 duplicate_skipped
# (System, Mechanism, ClassName, Plant, Site, Place, AlarmCode, AlarmMessage, 預期等級)
tests = [
    # --- K21-8F → Group「K21-8F&9F」 ---
    ("K21-8F-3390",  "Robot_PLC",  "A57-ROBOT",                      "A3-F1",  "3390", "K21-8F",  "RB1129",      "F1129_RB上夾持氣缸的IO狀態異常",                         "A"),
    ("K21-8F-3390",  "Robot_PLC",  "A59-ROBOT",                      "A3-F1",  "3390", "K21-8F",  "RB1191",      "F1191_ST1有帳無料",                                      "B"),
    ("K21-8F-3390",  "Robot_PLC",  "A60-ROBOT",                      "A3-F1",  "3390", "K21-8F",  "RB1147",      "F1147_RB",                                               "C"),
    ("K21-8F-2900",  "UDROBOT",    "K21-8F_ASEF1-2900-A03F_UDROBOT", "A3-F1",  "2900", "K21-8F",  "VST1020019",  "異常 - 機台 : (R1013.2)",                                "A"),

    # --- K11-8F → Group「K11-8F」 ---
    ("K118F_3800",   "K118F_3800", "ASEF3-K11-8F-3800-T41_UDLIFT",   "A3-F23", "3800", "K11-8F",  "VA12000037",  "異常 - 機台 : CClink Master 連線異常 (R1014.4)",         "A"),
    ("K118F_3800",   "K118F_3800", "ASEF3-K11-8F-3800-T42_UDLIFT",   "A3-F23", "3800", "K11-8F",  "VA12000501",  "異常 - 倉儲系統 : 通訊異常 (R2006.0)",                   "B"),

    # --- K22-8F / K22-5F → Group「K22-5F&8F」 ---
    ("K22_8F_3390",  "Plasma",     "ASEF1-K22-8F-3390-A57",          "A3-F1",  "3390", "K22-8F",  "A021A04",     "BUBU_A (A.1A04) Robot 動作中Fork1過壓檢知(X1006)觸發異常", "A"),
    ("K22_8F_3390",  "Plasma",     "ASEF1-K22-8F-3390-A58",          "A3-F1",  "3390", "K22-8F",  "A011000",     "BUBU_A PLC Disconnect",                                  "C"),
    ("K225F_3390",   "Robot",      "ASEF1-K22-5F-3390-A11",          "A3-F1",  "3390", "K22-5F",  "A011F0B",     "(A.1F0B) 機台EMO-1觸發(X60A未OFF)",                      "B"),

    # --- K11-5F → Group「K11-3~6F」 ---
    ("K115F_3390",   "Robot",      "ASEF1-K11-5F-3390-A21",          "A3-F1",  "3390", "K11-5F",  "1003",        "Robot防撞Sensor觸發",                                    "A"),
    ("K115F_3390",   "Robot",      "ASEF1-K11-5F-3390-A22",          "A3-F1",  "3390", "K11-5F",  "1000",        "Robot重大異常",                                          "C"),

    # --- K18-11F → Group「K18」 ---
    ("K18-11F-3390", "Robot",      "ASEF2-K18-11F-3390-A31",         "A3-F2",  "3390", "K18-11F", "ROBOT_A0001", "F1_全機原點復歸失敗",                                    "A"),
    ("K18-11F-3390", "Robot",      "ASEF2-K18-11F-3390-A33",         "A3-F2",  "3390", "K18-11F", "ROBOT_A0051", "F51_靜電Bar1狀態警報",                                   "B"),
    ("K18-11F-3390", "Robot",      "ASEF2-K18-11F-3390-A36",         "A3-F2",  "3390", "K18-11F", "ROBOT_A0051", "F51_靜電Bar1狀態警報",                                     "B"), 
]

ok = 0
for system, mech, cls, plant, site, place, code, message, expected in tests:
    payload = {
        "System": system,
        "Mechanism": mech,
        "ClassName": cls,
        "Plant": plant,
        "Site": site,
        "Place": place,
        "AlarmCode": code,
        "AlarmMessage": message,
        "Flag": "1",
    }

    try:
        data = requests.post(URL, json=payload, timeout=15).json()
        level, status = data.get("level"), data.get("status")
        mark = "✔" if level == expected else "✘"
        ok += level == expected
        print(f"{mark} {place:<8} {cls:<32} {code:<12} 等級 {level} (預期 {expected}) → {status}")
    except requests.RequestException as exc:
        print(f"✘ {place:<8} {cls:<32} {code:<12} 發送失敗：{exc}")

print(f"\n===== {ok}/{len(tests)} 筆等級符合預期 =====")
print("第 1 次執行：status 應為 success，前端出現 13 張卡片 (A×6、B×4、C×3)")
print("第 2 次執行：status 應全部為 duplicate_skipped，前端仍是 13 張")