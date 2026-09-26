from __future__ import annotations

from typing import Iterable

from .base import SourceAdapter
from .schemas import IngestionBatchResponse, IngestionReceipt, NormalizedWeatherRecord, SourceClass


class IngestionPreviewPipeline:
    """Validate, normalize, classify, and exact-deduplicate adapter output for a demo run."""

    def __init__(self, adapters: Iterable[SourceAdapter]) -> None:
        self.adapters = list(adapters)

    def run(self) -> IngestionBatchResponse:
        receipts: list[IngestionReceipt] = []
        canonical_by_hash: dict[str, str] = {}
        source_states: dict[str, str] = {}

        for adapter in self.adapters:
            source_states[adapter.source_name] = adapter.get_metadata()["status"]
            for raw_record in adapter.fetch():
                normalized = adapter.validate(adapter.normalize(raw_record))
                canonical_id = canonical_by_hash.get(normalized.content_hash)
                duplicate = canonical_id is not None
                if not duplicate:
                    canonical_by_hash[normalized.content_hash] = normalized.record_id
                    canonical_id = normalized.record_id

                trusted = normalized.source_class != SourceClass.untrusted_external
                receipts.append(
                    IngestionReceipt(
                        record_id=normalized.record_id,
                        source_id=normalized.source_id,
                        source_name=normalized.source_name,
                        source_class=normalized.source_class,
                        route="VAYU_METEOROLOGY" if trusted else "VISTA_REVIEW",
                        verification_status="TRUSTED_SOURCE" if trusted else "PENDING",
                        deduplication="EXACT_DUPLICATE" if duplicate else "NEW_RECORD",
                        canonical_record_id=canonical_id,
                        data_quality_flag=normalized.data_quality_flag,
                        provenance_steps=["COLLECTED", "VALIDATED", "NORMALIZED", "EXACT_DEDUPLICATED", "SOURCE_CLASS_ROUTED"],
                        demo=normalized.demo,
                    )
                )

        duplicate_count = sum(receipt.deduplication == "EXACT_DUPLICATE" for receipt in receipts)
        meteorological = sum(receipt.verification_status == "TRUSTED_SOURCE" and receipt.deduplication == "NEW_RECORD" for receipt in receipts)
        pending = sum(receipt.verification_status == "PENDING" and receipt.deduplication == "NEW_RECORD" for receipt in receipts)
        return IngestionBatchResponse(
            source_states=source_states,
            received_count=len(receipts),
            new_record_count=len(receipts) - duplicate_count,
            duplicate_count=duplicate_count,
            trusted_meteorological_count=meteorological,
            vista_pending_count=pending,
            receipts=receipts,
        )