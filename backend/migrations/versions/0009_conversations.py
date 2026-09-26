"""Epic #5 (EST-01): private, deletable conversation history and agent-derived state."""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("conversation_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("record_id", sa.String(36), sa.ForeignKey("private_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("client_message_id", sa.String(64), nullable=True),
        sa.Column("attachment_ids", sa.JSON(), nullable=False),
        sa.Column("event_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="valid_conversation_role"),
        sa.UniqueConstraint("record_id", "client_message_id", name="uq_conversation_messages_client_id"))
    op.create_index("ix_conversation_messages_record_id", "conversation_messages", ["record_id"])
    op.create_table("conversation_states",
        sa.Column("record_id", sa.String(36), sa.ForeignKey("private_records.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("goal", sa.String(30), nullable=False),
        sa.Column("people", sa.JSON(), nullable=False),
        sa.Column("missing_information", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("conversation_states")
    op.drop_index("ix_conversation_messages_record_id", table_name="conversation_messages")
    op.drop_table("conversation_messages")
