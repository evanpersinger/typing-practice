# Local dev shortcuts:
#
#   make dev        -> both servers in one terminal, open http://localhost:3005 (Ctrl-C stops both)
#   make serve      -> build the frontend and serve everything from http://localhost:8016, no Vite
#
# or run each in its own terminal:
#
#   make backend    -> http://localhost:8016
#   make frontend   -> http://localhost:3005   (the one you actually open)
#
# The two ports are coupled: the frontend proxies /api to the backend, and the
# target is set in frontend/vite.config.ts. Change the backend port here and you
# have to change it there too.

.PHONY: backend frontend install dev build serve

backend:
	uv run uvicorn backend.main:app --reload --port 8016

frontend:
	cd frontend && pnpm run dev

install:
	uv sync
	cd frontend && pnpm install

# Both dev servers from one terminal. The trap stops the other one when either exits or on Ctrl-C.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

build:
	cd frontend && pnpm run build

# The backend serves frontend/dist itself, so there is one port and no dev proxy.
serve: build
	uv run uvicorn backend.main:app --port 8016
