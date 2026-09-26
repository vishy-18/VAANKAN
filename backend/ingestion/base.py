from __future__ import annotations

from typing import Any, Protocol

from .schemas import NormalizedWeatherRecord


class SourceAdapter(Protocol):
    source_id: str
    source_name: str
    status: str

    def fetch(self) -> list[dict[str, Any]]: ...

    def normalize(self, raw_record: dict[str, Any]) -> NormalizedWeatherRecord: ...

    def validate(self, record: NormalizedWeatherRecord) -> NormalizedWeatherRecord: ...

    def get_metadata(self) -> dict[str, str]: ...


class DeterministicAdapter:
    source_id = ""
    source_name = ""
    status = "DEMO"

    def fetch(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def normalize(self, raw_record: dict[str, Any]) -> NormalizedWeatherRecord:
        return NormalizedWeatherRecord.model_validate(raw_record)

    def validate(self, record: NormalizedWeatherRecord) -> NormalizedWeatherRecord:
        return NormalizedWeatherRecord.model_validate(record.model_dump())

    def get_metadata(self) -> dict[str, str]:
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "status": self.status,
            "mode": "DEMO",
        }