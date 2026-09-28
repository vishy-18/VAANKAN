"""Create the initial VAANKAN PostgreSQL/PostGIS schema."""

from alembic import op

from backend.models import Base

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    later_tables = {"ground_observations", "citizen_activities"}
    initial_tables = [table for table in Base.metadata.sorted_tables if table.name not in later_tables]
    Base.metadata.create_all(bind=op.get_bind(), tables=initial_tables)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())