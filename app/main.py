"""
fingDB - Main Application Entry Point

This is the main entry point for the fingDB API. It configures the FastAPI
application, sets up middleware, and registers all API routers.

Key Concepts:
- FastAPI: Modern Python web framework for building APIs
- Async/Await: Python's way of handling asynchronous operations
- Lifespan: Manages application startup and shutdown
- CORS: Cross-Origin Resource Sharing for browser requests
- Routers: Modular way to organize API endpoints
"""

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from contextlib import asynccontextmanager
import os
import mimetypes
import httpx

from app.crud.materia import (
    materia_router,
    carrera_router,
    perfil_router,
    instituto_router,
)
from app.core.database import engine, Base
from app.auth import login, logout, verify_token, LoginRequest


# ============================================================================
# APPLICATION LIFECYCLE
# ============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application startup and shutdown.

    This runs when the application starts:
    - Creates all database tables if they don't exist

    The 'yield' marks where the application runs.
    Any code after yield would run on shutdown.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


# ============================================================================
# APPLICATION SETUP
# ============================================================================

app = FastAPI(
    title="FingDB API",
    description="API para gestionar materias y sus previas",
    version="1.0.0",
)

# CORS middleware allows browsers to make requests to this API
# In production, you'd want to restrict this to specific origins
# For development, we allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# ROUTER REGISTRATION
# ============================================================================

# Include all the API routers for different resources
app.include_router(materia_router)  # Course endpoints
app.include_router(carrera_router)  # Career endpoints
app.include_router(perfil_router)  # Profile endpoints
app.include_router(instituto_router)  # Institute endpoints


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================


@app.post("/auth/login")
async def auth_login(request: Request, login_data: LoginRequest):
    """
    Handle user login.

    Returns a token if credentials are valid.
    """
    return await login(request, login_data)


@app.post("/auth/logout")
async def auth_logout(request: Request):
    """
    Handle user logout.

    Invalidates the session token.
    """
    auth_header = request.headers.get("Authorization", "")
    token = (
        auth_header.replace("Bearer ", "")
        if auth_header.startswith("Bearer ")
        else None
    )
    return logout(token)


@app.get("/auth/verify")
async def auth_verify(request: Request):
    """
    Verify if a token is valid.

    Used by frontend to check if user is logged in.
    """
    auth_header = request.headers.get("Authorization", "")
    token = (
        auth_header.replace("Bearer ", "")
        if auth_header.startswith("Bearer ")
        else None
    )
    username = verify_token(token)
    if username:
        return {"valid": True, "username": username}
    return {"valid": False}


METRICS_EVENTS_URL = os.getenv(
    "METRICS_EVENTS_URL", "https://api.eclipselabs.com.uy/metrics/event"
)
METRICS_VIEWS_URL = os.getenv(
    "METRICS_VIEWS_URL", "https://api.eclipselabs.com.uy/metrics/views"
)
METRICS_API_KEY = os.getenv("METRICS_API_KEY", "")


class MetricsEvent(BaseModel):
    event_type: str
    metadata: Optional[dict] = None


class ViewEvent(BaseModel):
    path: str
    referrer: Optional[str] = None
    user_agent: Optional[str] = None
    viewport: Optional[str] = None
    document_title: Optional[str] = None


@app.post("/api/metrics/event")
async def track_event(event: MetricsEvent):
    """Track click events by forwarding to the metrics API."""
    if not METRICS_API_KEY:
        return {"status": "skipped", "reason": "Metrics not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                METRICS_EVENTS_URL,
                json={"event_type": event.event_type, "metadata": event.metadata or {}},
                headers={"X-API-Key": METRICS_API_KEY},
            )
            if response.status_code == 200:
                return {"status": "ok"}
            return {"status": "error", "detail": response.text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/api/metrics/views")
async def track_view(view: ViewEvent):
    """Track page views by forwarding to the metrics API."""
    if not METRICS_API_KEY:
        return {"status": "skipped", "reason": "Metrics not configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                METRICS_VIEWS_URL,
                json=view.model_dump(exclude_none=True),
                headers={"X-API-Key": METRICS_API_KEY},
            )
            if response.status_code == 200:
                return {"status": "ok"}
            return {"status": "error", "detail": response.text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


# ============================================================================
# FRONTEND SERVING (SPA ROUTING)
# ============================================================================


@app.get("/graph.js")
async def serve_graph_js(request: Request):
    """
    Serve the JavaScript for the prerequisite graph visualization.

    This is used by the frontend to render the course prerequisite graph.
    """
    return FileResponse(
        "app/templates/graph.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )


@app.get("/")
async def root(request: Request):
    """
    Serve the appropriate frontend based on the requested path.

    This implements SPA (Single Page Application) routing:
    - / -> graph visualization
    - /admin -> admin panel
    - /static -> static files
    - Everything else -> main graph page
    """
    path = request.url.path

    if path == "/graph.js" or path.startswith("/graph.js?"):
        return FileResponse(
            "app/templates/graph.js",
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    elif path == "/" or path == "" or path.startswith("/index") or path == "/graph":
        return FileResponse("app/templates/graph.html")
    elif path == "/admin" or path.startswith("/admin/"):
        return FileResponse("app/templates/index.html")
    elif path.startswith("/static/"):
        return FileResponse("app/templates/graph.html")
    else:
        return FileResponse("app/templates/graph.html")


@app.get("/{full_path:path}")
async def catch_all(full_path: str, request: Request):
    """
    Catch-all route for SPA routing.

    Any path not matched by other routes falls through here.
    We serve the main graph.html which handles routing on the client side.
    """
    path = request.url.path

    if path == "/graph.js" or path.startswith("/graph.js?"):
        return FileResponse(
            "app/templates/graph.js",
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    elif path == "/" or path == "" or path.startswith("/index") or path == "/graph":
        return FileResponse("app/templates/graph.html")
    elif path == "/admin" or path.startswith("/admin/"):
        return FileResponse("app/templates/index.html")
    elif path.startswith("/static/"):
        return FileResponse("app/templates/graph.html")
    else:
        return FileResponse("app/templates/graph.html")
