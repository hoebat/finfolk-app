"""Optional local preview of the static artifact. No API or application backend."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def make_handler(directory):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(directory), **kwargs)

        def do_GET(self):
            if self.headers.get("Host", "").split(":")[0] not in ("localhost", "127.0.0.1"):
                return self.send_error(400, "Local preview accepts loopback hosts only")
            super().do_GET()

        def list_directory(self, path):
            self.send_error(404, "Directory listing is disabled")

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Preview the static Pages artifact")
    parser.add_argument("--directory", type=Path, default=Path("_site"))
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not (args.directory / "index.html").is_file():
        parser.exit(1, "Build the site first: python3 -m depth_explorer build-static\n")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(args.directory.resolve()))
    except OSError as exc:
        parser.exit(1, f"Cannot open local port {args.port}: {exc}. Run from a terminal that permits loopback servers, or choose another --port.\n")
    print(f"Static preview: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
