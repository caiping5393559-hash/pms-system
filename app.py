from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import os

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"

class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = self.path.split("?")[0]

        # 首页
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
                self.wfile.write(b"PMS RUNNING (NO UI FILE)")
            return

        # 健康检查
        if path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
            return

        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"NOT FOUND")


PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("SAFE PMS STARTED")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
