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
backup:
	mkdir -p backups/$$(date +%Y%m%d-%H%M%S)
	for f in *.db; do [ -e "$$f" ] && cp "$$f" backups/$$(ls backups | tail -1)/; done; true
	[ -d sessions ] && cp -r sessions backups/$$(ls backups | tail -1)/ || true
