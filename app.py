from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import os

# ======================
# 路径
# ======================
BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"

# ======================
# HTTP 服务
# ======================
class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = self.path.split("?")[0]

        # 首页（关键：加载你的UI）
        if path == "/" or path == "/owner":
            file_path = STATIC / "index.html"

            if file_path.exists():
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(file_path.read_bytes())
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"index.html not found")
            return

        # 简单健康检查
        if path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK PMS RUNNING")
            return

        # 静态文件（css/js）
        file_path = STATIC / path.lstrip("/")
        if file_path.exists():
            self.send_response(200)
            self.end_headers()
            self.wfile.write(file_path.read_bytes())
            return

        # 404
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"NOT FOUND")


# ======================
# Render 启动关键
# ======================
PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("PMS STARTED ON PORT:", PORT)
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
