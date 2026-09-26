"""Prototype redesign: confirmed profile, private note and private-side submission receipts."""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("private_records") as batch:
        batch.add_column(sa.Column("private_note", sa.Text(), nullable=True))
    op.create_table("profiles",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("institution_id", sa.String(36), sa.ForeignKey("institutions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document", sa.String(200), nullable=True),
        sa.Column("contact", sa.String(200), nullable=True),
        sa.Column("position", sa.String(200), nullable=True),
        sa.Column("area", sa.String(200), nullable=True),
        sa.Column("relationship", sa.String(200), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("record_submissions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("private_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("case_id", sa.String(20), nullable=False),
        sa.Column("institution_name", sa.String(150), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("summary", sa.JSON(), nullable=False))
    op.create_index("ix_record_submissions_record_id", "record_submissions", ["record_id"])


def downgrade():
    op.drop_table("record_submissions")
    op.drop_table("profiles")
    with op.batch_alter_table("private_records") as batch:
        batch.drop_column("private_note")
