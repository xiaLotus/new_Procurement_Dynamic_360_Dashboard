import requests

# 若伺服器在其他電腦，將 localhost 換成該電腦 IP
URL = "http://localhost:8900/upload_message"

tests = [
    ("RB1129", "F1129_RB上夾持氣缸的IO狀態異常", "A"),
    ("RB1191", "F1191_ST1有帳無料", "B"),
    ("RB1147", "F1147_RB", "C"),
]

for code, message, expected in tests:
    payload = {
        "System": "K21-8F-3390",
        "Mechanism": "TEST",
        "ClassName": "TEST",
        "Plant": "K21",
        "Site": "8F",
        "Place": "K21-8F-3390",
        "AlarmCode": code,
        "AlarmMessage": f"[測試發送] {message}",
        "Flag": "1",
    }

    print(f"\n發送 {code}，預期等級：{expected}")

    try:
        response = requests.post(URL, json=payload, timeout=15)
        print(f"HTTP {response.status_code}")
        print(response.text)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"發送失敗：{exc}")