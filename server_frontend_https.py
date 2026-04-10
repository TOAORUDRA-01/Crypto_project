import ssl
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main() -> None:
    root_dir = Path(__file__).resolve().parent
    cert_file = root_dir / "online" / "backend" / "cert.pem"
    key_file = root_dir / "online" / "backend" / "key.pem"

    if not cert_file.exists() or not key_file.exists():
        raise FileNotFoundError("TLS files not found at online/backend/cert.pem and key.pem")

    handler = partial(SimpleHTTPRequestHandler, directory=str(root_dir))
    server = ThreadingHTTPServer(("0.0.0.0", 8000), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=str(cert_file), keyfile=str(key_file))
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print("Frontend HTTPS server running on https://0.0.0.0:8000")
    print("Serving directory:", root_dir)
    server.serve_forever()


if __name__ == "__main__":
    main()