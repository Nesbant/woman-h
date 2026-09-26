"""SPEC §39-40: private complaint drafts, institutional case snapshots and copied case files."""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("timelines", sa.Column("review_items", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table("complaint_drafts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("private_records.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("timeline_revision", sa.Integer(), nullable=False),
        sa.Column("fields_json", sa.JSON(), nullable=False),
        sa.Column("source_map", sa.JSON(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("institutional_cases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.String(20), nullable=False),
        sa.Column("institution_id", sa.String(36), sa.ForeignKey("institutions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_by", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("assignee_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("procedure_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("institution_id", "case_id", name="uq_institutional_cases_case_id"),
        sa.CheckConstraint("status IN ('new', 'in_review', 'follow_up', 'closed')", name="valid_case_status"))
    op.create_index("ix_institutional_cases_institution_id", "institutional_cases", ["institution_id"])
    op.create_table("case_files",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("institutional_cases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_file_id", sa.String(36), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("media_type", sa.String(100), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_case_files_case_id", "case_files", ["case_id"])


def downgrade():
    op.drop_table("case_files")
    op.drop_table("institutional_cases")
    op.drop_table("complaint_drafts")
    with op.batch_alter_table("timelines") as batch:
        batch.drop_column("review_items")
