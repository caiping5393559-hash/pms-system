from http.server import HTTPServer, BaseHTTPRequestHandler
import os
import json

# ======================
# PMS 超简稳定版（Render专用）
# ======================

def load_state():
    return {
        "rooms": [
            {"id": "room1", "name": "Room A"},
            {"id": "room2", "name": "Room B"}
        ],
        "bookings": [
            {"room_id": "room1", "guest": "test", "date": "2026-01-01"}
        ]
    }


class Handler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = self.path.split("?")[0]

        # 首页
        if path == "/":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"PMS RUNNING OK")
            return

        # 房源接口
        if path == "/api/rooms":
            data = load_state()["rooms"]
            self.send_json(data)
            return

        # 订单接口
        if path == "/api/bookings":
            data = load_state()["bookings"]
            self.send_json(data)
            return

        # 默认
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b"NOT FOUND")

    def send_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))


# ======================
# Render 启动关键点
# ======================
PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("PMS STARTED ON PORT:", PORT)
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
