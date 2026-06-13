from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"PMS RUNNING")

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 10000), Handler)
    server.serve_forever()
