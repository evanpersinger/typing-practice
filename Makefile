# Local dev shortcuts. Run each in its own terminal:
#
#   make backend    -> http://localhost:8016
#   make frontend   -> http://localhost:3005   (the one you actually open)
#
# The two ports are coupled: the frontend proxies /api to the backend, and the
# target is set in frontend/vite.config.ts. Change the backend port here and you
# have to change it there too.

.PHONY: backend frontend install backup

backend:
	uv run uvicorn backend.main:app --reload --port 8016

frontend:
	cd frontend && pnpm run dev

install:
	uv sync
	cd frontend && pnpm install

# Timestamped copy of the databases and session transcripts into backups/.
# Databases go through sqlite's own backup API, so a copy taken while the
# server is writing is still consistent; a plain cp could catch it mid-write.
backup:
	@dest=backups/$$(date +%Y%m%d-%H%M%S); mkdir -p $$dest; \
	for f in *.db; do [ -e "$$f" ] && uv run python -c \
	  'import sqlite3,sys; s=sqlite3.connect(sys.argv[1]); d=sqlite3.connect(sys.argv[2]); s.backup(d)' \
	  "$$f" "$$dest/$$f"; done; \
	for d in sessions sessions_test; do [ -d "$$d" ] && cp -r "$$d" "$$dest/"; done; \
	echo "Backed up to $$dest"
