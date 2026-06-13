from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import os
import urllib.parse

# ======================
# 路径
# ======================
BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
DATA = BASE / "data"
STATE_PATH = DATA / "state.json"

# ======================
# 账号
# ======================
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "cleaner": {"password": "cleaner123", "role": "cleaner"}
}

# ======================
# 数据
# ======================
def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"rooms": [], "bookings": []}

def save_state(state):
    DATA.mkdir(exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

# ======================
# 登录
# ======================
def auth(query):
    q = urllib.parse.parse_qs(query)
    u = q.get("user", [""])[0]
    p = q.get("pass", [""])[0]

    user = USERS.get(u)
    if user and user["password"] == p:
        return user["role"]
    return None

# ======================
# Server
# ======================
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        query = urllib.parse.urlparse(self.path).query

        role = auth(query)

        # ======================
        # 登录页
        # ======================
        if path == "/login":
            html = """
            <html>
            <body>
                <h2>PMS Login</h2>
                <form action="/owner">
                    Username: <input name="user"><br>
                    Password: <input name="pass" type="password"><br>
                    <button type="submit">Login</button>
                </form>
            </body>
            </html>
            """
            return self.html(html)

        # ======================
        # 管理员UI（接回你的PMS UI）
        # ======================
        if path == "/owner":
            if role != "admin":
                return self.html("ADMIN ONLY")

            ui = STATIC / "index.html"
            if ui.exists():
                return self.file(ui)
            return self.html("UI NOT FOUND")

        # ======================
        # 保洁UI
        # ======================
        if path == "/cleaner":
            if role not in ["cleaner", "admin"]:
                return self.html("CLEANER ONLY")

            return self.html("""
            <h2>Cleaner Dashboard</h2>
            <p>这里未来显示保洁任务</p>
            """)

        # ======================
        # API
        # ======================
        if path == "/api/state":
            return self.json(load_state())

        return self.html("NOT FOUND")

    # ======================
    # POST保存
    # ======================
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length).decode())

        if self.path == "/api/state":
            save_state(body)
            return self.json({"ok": True})

        return self.json({"ok": False})

    # ======================
    # 工具函数
    # ======================
    def html(self, text):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode())

    def file(self, path):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(path.read_bytes())

    def json(self, data):
        raw = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

# ======================
# 启动
# ======================
PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("PMS FULL UI SYSTEM STARTED")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
