from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    admin,
    assessments,
    community,
    health,
    insights,
    moods,
    reminders,
    study,
    suggestions,
    users,
    wellness,
)

settings = get_settings()

app = FastAPI(
    title="CampusWell API",
    description="Backend for CampusWell, the PSUT student well-being platform.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(users.router)
app.include_router(moods.router)
app.include_router(study.router)
app.include_router(assessments.router)
app.include_router(wellness.router)
app.include_router(community.router)
app.include_router(reminders.router)
app.include_router(admin.router)
app.include_router(suggestions.router)
app.include_router(insights.router)
