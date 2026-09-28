from __future__ import annotations

import os
import secrets
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from geoalchemy2.elements import WKBElement
from sqlalchemy import MetaData, Table, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from .database import get_database_session, get_storage_backend
from .models import AuditLog, Base


router = APIRouter(prefix="/api/admin/database", tags=["admin database"])
_NON_DELETABLE_TABLES = {"alembic_version", "audit_logs", "spatial_ref_sys"}
_REDACTED = "[REDACTED]"


def _authorized_session(
    x_admin_database_key: str | None = Header(default=None),
    session: Session | None = Depends(get_database_session),
) -> Session:
    configured_key = os.getenv("VAANKAN_ADMIN_DATABASE_KEY", "")
    if not configured_key:
        raise HTTPException(status_code=503, detail="Database admin access is not configured on the server")
    if not x_admin_database_key or not secrets.compare_digest(x_admin_database_key, configured_key):
        raise HTTPException(status_code=401, detail="Invalid database admin key")
    if get_storage_backend() != "postgres" or session is None:
        raise HTTPException(status_code=503, detail="Persistent database storage is not available")
    return session


def _database_tables(session: Session) -> tuple[list[str], Any]:
    bind = session.get_bind()
    return inspect(bind).get_table_names(), bind


def _table(name: str, bind: Any, available_tables: list[str]) -> Table:
    if name not in available_tables:
        raise HTTPException(status_code=404, detail="Database table not found")
    return Table(name, MetaData(), autoload_with=bind)


def _serialize(value: Any, field_name: str) -> Any:
    if any(secret_word in field_name.casefold() for secret_word in ("password", "secret", "token", "credential")):
        return _REDACTED
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, WKBElement):
        return "[spatial data]"
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"[binary data: {len(value)} bytes]"
    if isinstance(value, dict):
        return {str(key): _serialize(item, str(key)) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item, field_name) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


@router.get("/tables")
def list_database_tables(session: Session = Depends(_authorized_session)) -> dict[str, object]:
    names, bind = _database_tables(session)
    tables = []
    for name in sorted(names):
        table = _table(name, bind, names)
        primary_key = [column.name for column in table.primary_key.columns]
        count = session.scalar(select(func.count()).select_from(table)) or 0
        tables.append(
            {
                "name": name,
                "row_count": count,
                "columns": [
                    {
                        "name": column.name,
                        "type": str(column.type),
                        "nullable": column.nullable,
                        "primary_key": column.primary_key,
                    }
                    for column in table.columns
                ],
                "primary_key": primary_key,
                "deletable": bool(primary_key) and name in Base.metadata.tables and name not in _NON_DELETABLE_TABLES,
            }
        )
    return {"tables": tables, "storage": "postgres"}


@router.get("/tables/{table_name}/rows")
def list_table_rows(
    table_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(_authorized_session),
) -> dict[str, object]:
    names, bind = _database_tables(session)
    table = _table(table_name, bind, names)
    primary_key = list(table.primary_key.columns)
    statement = select(table)
    if primary_key:
        statement = statement.order_by(*primary_key)
    result = session.execute(statement.limit(limit).offset(offset))
    rows = [
        {key: _serialize(value, key) for key, value in row.items()}
        for row in result.mappings()
    ]
    total = session.scalar(select(func.count()).select_from(table)) or 0
    return {
        "table": table_name,
        "columns": [column.name for column in table.columns],
        "primary_key": [column.name for column in primary_key],
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/tables/{table_name}/rows")
def delete_table_row(
    table_name: str,
    primary_key_values: dict[str, Any],
    session: Session = Depends(_authorized_session),
) -> dict[str, object]:
    names, bind = _database_tables(session)
    table = _table(table_name, bind, names)
    primary_key = list(table.primary_key.columns)
    expected_keys = {column.name for column in primary_key}
    if not primary_key or table_name not in Base.metadata.tables or table_name in _NON_DELETABLE_TABLES:
        raise HTTPException(status_code=409, detail="Rows in this table cannot be deleted from the dashboard")
    if set(primary_key_values) != expected_keys:
        raise HTTPException(status_code=422, detail="The complete primary key is required")

    criteria = []
    for column in primary_key:
        value = primary_key_values[column.name]
        try:
            python_type = column.type.python_type
            if python_type is UUID and not isinstance(value, UUID):
                value = UUID(str(value))
            elif python_type is datetime and isinstance(value, str):
                value = datetime.fromisoformat(value)
            elif python_type is date and isinstance(value, str):
                value = date.fromisoformat(value)
            elif python_type in (int, float, str, bool) and not isinstance(value, python_type):
                value = python_type(value)
        except (TypeError, ValueError, NotImplementedError) as error:
            raise HTTPException(status_code=422, detail=f"Invalid primary key value for {column.name}") from error
        criteria.append(column == value)

    try:
        result = session.execute(delete(table).where(*criteria))
        if not result.rowcount:
            raise HTTPException(status_code=404, detail="Database row not found")
        if "audit_logs" in names:
            session.add(
                AuditLog(
                    action="DATABASE_ROW_DELETED",
                    entity_type=table_name,
                    entity_id=",".join(str(primary_key_values[column.name]) for column in primary_key),
                    details={"primary_key": primary_key_values},
                )
            )
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="This row is referenced by other records and cannot be deleted yet") from error

    return {"deleted": True, "table": table_name, "primary_key": primary_key_values}