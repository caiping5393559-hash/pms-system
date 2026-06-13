from http.server import HTTPServer, BaseHTTPRequestHandler
import os

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"PMS RUNNING OK")

PORT = int(os.environ.get("PORT", 10000))

if __name__ == "__main__":
    print("PMS STARTING...")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
