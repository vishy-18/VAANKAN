from __future__ import annotations

import os
from collections.abc import Generator
from functools import lru_cache

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine, make_url, text
from sqlalchemy.orm import Session, sessionmaker

load_dotenv()


def get_database_url() -> str | None:
    """Return explicit database configuration; unset means demo-memory mode."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return None
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    return url


def create_database_engine(database_url: str | None = None) -> Engine | None:
    url = database_url if database_url is not None else get_database_url()
    if not url:
        return None
    options: dict[str, object] = {"pool_pre_ping": True}
    if make_url(url).get_backend_name() == "postgresql":
        options.update(
            pool_size=int(os.getenv("DATABASE_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("DATABASE_MAX_OVERFLOW", "10")),
            pool_timeout=int(os.getenv("DATABASE_POOL_TIMEOUT", "30")),
        )
    return create_engine(url, **options)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session(factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_storage_backend() -> str:
    return os.getenv("STORAGE_BACKEND", "memory").strip().lower()


@lru_cache(maxsize=1)
def get_configured_engine() -> Engine | None:
    if get_storage_backend() != "postgres":
        return None
    database_url = get_database_url()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required when STORAGE_BACKEND=postgres")
    return create_database_engine(database_url)


@lru_cache(maxsize=1)
def get_configured_session_factory() -> sessionmaker[Session] | None:
    engine = get_configured_engine()
    return create_session_factory(engine) if engine else None


def get_database_session() -> Generator[Session | None, None, None]:
    factory = get_configured_session_factory()
    if factory is None:
        yield None
        return
    yield from get_session(factory)


def check_database_readiness(engine: Engine) -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        postgis_version = connection.execute(text("SELECT PostGIS_Full_Version()")).scalar_one()
    return {"database": "connected", "postgis": str(postgis_version)}