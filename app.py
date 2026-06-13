from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import urllib.parse
import json
import os

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"

# ======================
# 登录账号（固定版，最稳定）
# ======================
USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "cleaner": {"password": "cleaner123", "role": "cleaner"}
}

# ======================
# 登录解析
# ======================
def auth(query):
    params = urllib.parse.parse_qs(query)
    u = params.get("user", [""])[0]
    p = params.get("pass", [""])[0]

    if u == "admin" and p == "admin123":
        return "admin"

    if u == "cleaner" and p == "cleaner123":
        return "cleaner"

    return None


# ======================
# HTTP SERVER
# ======================
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = parsed.query

        role = auth(query)

        # ----------------------
        # 登录页
        # ----------------------
        if path == "/login":
            html = """
            <html>
            <body style="font-family:Arial">
                <h2>PMS Login</h2>
                <form action="/owner">
                    User: <input name="user"><br><br>
                    Pass: <input name="pass" type="password"><br><br>
                    <button type="submit">Login</button>
                </form>
            </body>
            </html>
            """
            return self.send_html(html)

        # ----------------------
        # 管理员页面（UI入口）
        # ----------------------
        if path == "/owner":
            if role != "admin":
                return self.send_html("❌ 没有权限或登录失败")

            file_path = STATIC / "index.html"
            if file_path.exists():
                return self.send_file(file_path)

            return self.send_html("❌ UI不存在：static/index.html")

        # ----------------------
        # 保洁页面
        # ----------------------
        if path == "/cleaner":
            if role not in ["cleaner", "admin"]:
                return self.send_html("❌ 没有权限")

            return self.send_html("<h2>🧹 Cleaner Dashboard</h2>")

        # ----------------------
        # API
        # ----------------------
        if path == "/health":
            return self.send_html("PMS OK")

        return self.send_html("404 NOT FOUND")

    # ======================
    # 工具函数
    # ======================
    def send_html(self, content):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(content.encode())

    def send_file(self, path):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(path.read_bytes())


# ======================
# 启动
# ======================
PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("PMS FINAL RUNNING")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
