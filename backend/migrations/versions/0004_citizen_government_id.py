"""Persist citizen identity details and require explicit location consent."""

from alembic import op
import sqlalchemy as sa

revision = "0004_citizen_government_id"
down_revision = "0003_citizen_activities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE citizen_profiles ADD COLUMN IF NOT EXISTS government_id VARCHAR(80)")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE tablename = 'citizen_profiles' AND indexdef ILIKE 'CREATE UNIQUE INDEX%government_id%'
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'citizen_profiles'::regclass
                  AND contype = 'u'
                  AND pg_get_constraintdef(oid) ILIKE '%government_id%'
            ) THEN
                ALTER TABLE citizen_profiles
                ADD CONSTRAINT uq_citizen_profiles_government_id UNIQUE (government_id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE citizen_profiles DROP CONSTRAINT IF EXISTS uq_citizen_profiles_government_id")
    op.execute("ALTER TABLE citizen_profiles DROP COLUMN IF EXISTS government_id")