import http.server
import socketserver

PORT = 8080


class DemoHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='.', **kwargs)

    def guess_type(self, path):
        if path.endswith('.js') or path.endswith('.mjs'):
            return 'application/javascript'
        return super().guess_type(path)

    def end_headers(self):
        # COOP/COEP 响应头，启用 WebGPU 所需的跨域隔离
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()


if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), DemoHTTPHandler) as httpd:
        print(f"Demo server running at http://127.0.0.1:{PORT}/")
        print("Press Ctrl+C to stop.")
        httpd.serve_forever()
