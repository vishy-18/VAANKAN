"""Add PostGIS-backed citizen profile points and verified ground observations."""

from alembic import op

revision = "0002_ground_observations"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE citizen_profiles "
        "ADD COLUMN IF NOT EXISTS location geometry(POINT,4326)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_citizen_profiles_location "
        "ON citizen_profiles USING gist (location)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_citizen_profiles_location_geography "
        "ON citizen_profiles USING gist ((location::geography))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_reports_location_geography "
        "ON reports USING gist ((location::geography))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_weather_stations_location_geography "
        "ON weather_stations USING gist ((location::geography))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_weather_events_geometry_geography "
        "ON weather_events USING gist ((geometry::geography))"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ground_observations (
            id UUID PRIMARY KEY,
            observation_id VARCHAR(128) NOT NULL UNIQUE,
            report_id UUID NOT NULL UNIQUE REFERENCES reports(id) ON DELETE CASCADE,
            source VARCHAR(32) NOT NULL DEFAULT 'ADMIN_REVIEW',
            event_type VARCHAR(48) NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            location geometry(POINT,4326),
            city VARCHAR(120) NOT NULL,
            district VARCHAR(120) NOT NULL,
            state VARCHAR(120) NOT NULL,
            verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED',
            verification_method VARCHAR(32) NOT NULL DEFAULT 'admin',
            verification_confidence DOUBLE PRECISION,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ground_observations_location "
        "ON ground_observations USING gist (location)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ground_observations_location_geography "
        "ON ground_observations USING gist ((location::geography))"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_ground_observations_event_type ON ground_observations(event_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ground_observations_district ON ground_observations(district)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ground_observations_state ON ground_observations(state)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ground_observations_timestamp ON ground_observations(timestamp)")
    op.execute(
        "UPDATE citizen_profiles SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) "
        "WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ground_observations")
    # Keep the additive citizen point column/index for compatibility with 0001
    # databases that were initialized with the newer ORM metadata.