"""Persist report submission state and link citizen alerts to reports."""

from alembic import op
import sqlalchemy as sa


revision = "0005_report_submission_alerts"
down_revision = "0004_citizen_government_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS submitted BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ")
    op.execute("CREATE INDEX IF NOT EXISTS ix_reports_submitted ON reports (submitted)")
    op.execute("ALTER TABLE alerts ADD COLUMN IF NOT EXISTS source_report_id UUID")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'alerts'::regclass
                  AND contype = 'f'
                  AND pg_get_constraintdef(oid) ILIKE '%source_report_id%reports%'
            ) THEN
                ALTER TABLE alerts
                ADD CONSTRAINT fk_alerts_source_report_id_reports
                FOREIGN KEY (source_report_id) REFERENCES reports(id) ON DELETE CASCADE;
            END IF;
        END $$;
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_alerts_source_report_id ON alerts (source_report_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_alerts_source_report_id")
    op.execute("ALTER TABLE alerts DROP CONSTRAINT IF EXISTS fk_alerts_source_report_id_reports")
    op.execute("ALTER TABLE alerts DROP COLUMN IF EXISTS source_report_id")
    op.execute("DROP INDEX IF EXISTS ix_reports_submitted")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS submitted_at")
    op.execute("ALTER TABLE reports DROP COLUMN IF EXISTS submitted")