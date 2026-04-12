import ssl
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class IndexHTTPRequestHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves index.html by default for directories."""
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        return super().end_headers()

    def do_GET(self):
        if self.path.endswith('/'):
            self.path += 'index.html'
        return super().do_GET()


def main() -> None:
    project_root = Path(__file__).resolve().parent
    frontend_dir = project_root / "online" / "frontend"
    cert_file = project_root / "online" / "backend" / "cert.pem"
    key_file = project_root / "online" / "backend" / "key.pem"

    if not frontend_dir.exists():
        raise FileNotFoundError(f"Frontend directory not found: {frontend_dir}")

    if not cert_file.exists() or not key_file.exists():
        raise FileNotFoundError("TLS files not found at online/backend/cert.pem and key.pem")

    handler = partial(IndexHTTPRequestHandler, directory=str(frontend_dir))
    server = ThreadingHTTPServer(("0.0.0.0", 8000), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print("Frontend HTTPS server running on https://0.0.0.0:8000")
    print("Serving directory:", frontend_dir)
    server.serve_forever()


if __name__ == "__main__":
    main()