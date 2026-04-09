"""Dev launcher — ensures KICAD_SYMBOL_DIR + UTF-8 stdout before uvicorn starts."""
import os
import sys

os.environ["KICAD_SYMBOL_DIR"] = r"C:\Program Files\KiCad\10.99\share\kicad\symbols"
os.environ["PYTHONUTF8"] = "1"
os.environ["PYTHONIOENCODING"] = "utf-8"

# Force UTF-8 on stdout/stderr so circuit_synth's emoji-laden logs don't crash
# under Windows cp1252.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# circuit_synth opens files with the platform default encoding (cp1252 on
# Windows) and then tries to write emoji characters into them, which crashes.
# Monkey-patch builtins.open so every call defaults to utf-8 unless the caller
# explicitly passed encoding=.
import builtins as _builtins
_real_open = _builtins.open

def _utf8_open(file, mode="r", buffering=-1, encoding=None, errors=None, newline=None,
               closefd=True, opener=None):
    if encoding is None and "b" not in mode:
        encoding = "utf-8"
    return _real_open(file, mode, buffering, encoding, errors, newline, closefd, opener)

_builtins.open = _utf8_open

sys.stderr.write(f"[run_dev] KICAD_SYMBOL_DIR = {os.environ['KICAD_SYMBOL_DIR']}\n")
sys.stderr.write(f"[run_dev] utf8_mode={sys.flags.utf8_mode} default_encoding={sys.getdefaultencoding()} locale={__import__('locale').getpreferredencoding(False)}\n")
sys.stderr.flush()
try:
    import circuit_synth  # noqa: F401
    sys.stderr.write(
        f"[run_dev] circuit_synth = {getattr(circuit_synth, '__version__', 'installed')}\n"
    )
    sys.stderr.flush()
except ImportError as e:
    sys.stderr.write(f"[run_dev] circuit_synth NOT installed: {e}\n")
    sys.exit(1)

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8766,
        app_dir="services/kicad",
        reload=False,
    )
