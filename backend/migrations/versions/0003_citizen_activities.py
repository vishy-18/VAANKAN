"""Persist citizen-facing report and alert activity."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_citizen_activities"
down_revision = "0002_ground_observations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "citizen_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("citizen_id", sa.String(length=320), nullable=False),
        sa.Column("activity_type", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("related_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_citizen_activities_citizen_id", "citizen_activities", ["citizen_id"])
    op.create_index("ix_citizen_activities_activity_type", "citizen_activities", ["activity_type"])
    op.create_index("ix_citizen_activities_related_id", "citizen_activities", ["related_id"])
    op.create_index("ix_citizen_activities_status", "citizen_activities", ["status"])
    op.create_index("ix_citizen_activities_occurred_at", "citizen_activities", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("citizen_activities")