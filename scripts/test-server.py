from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path=path.replace('/handwriting-memo/', '/', 1)
        return super().translate_path(path)
os.chdir('dist')
ThreadingHTTPServer(('127.0.0.1',4173),Handler).serve_forever()
