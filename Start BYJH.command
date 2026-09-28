#!/bin/zsh
cd "$(dirname "$0")" || exit 1
for byjh_python in "${BYJH_PYTHON:-python3}" /opt/homebrew/bin/python3 /usr/local/bin/python3; do
  if "$byjh_python" -c 'import hashlib,sys; sys.exit(0 if hasattr(hashlib,"scrypt") and sys.version_info >= (3,9) else 1)' 2>/dev/null; then
    exec "$byjh_python" server.py --port 8080
  fi
done
print 'BYJH needs Python 3.9+ with OpenSSL/scrypt support. Install Homebrew Python or set BYJH_PYTHON to a compatible interpreter.'
exit 1
