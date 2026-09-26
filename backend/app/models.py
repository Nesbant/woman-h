from datetime import date, datetime
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, JSON, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Institution(Base):
    __tablename__ = "institutions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(150))


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (CheckConstraint("role IN ('reviewer', 'admin')", name="valid_role"),)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20))


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer, index=True)


class PrivateRecord(Base):
    __tablename__ = "private_records"
    __table_args__ = (CheckConstraint("status = 'private_draft'", name="private_draft_only"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30))
    # Private scratch note. Never part of drafts, snapshots or any institutional view.
    private_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Profile(Base):
    """Data the person confirmed about themselves; used to prefill section I of drafts."""
    __tablename__ = "profiles"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    institution_id: Mapped[str | None] = mapped_column(ForeignKey("institutions.id", ondelete="SET NULL"))
    document: Mapped[str | None] = mapped_column(String(200))
    contact: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[str | None] = mapped_column(String(200))
    area: Mapped[str | None] = mapped_column(String(200))
    relationship: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RecordSubmission(Base):
    """Private-side receipt of a submission. Lives with the record; institutions never read this table."""
    __tablename__ = "record_submissions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[str] = mapped_column(String(20))
    institution_name: Mapped[str] = mapped_column(String(150))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    summary: Mapped[dict] = mapped_column(JSON)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (CheckConstraint(
        "(date_kind = 'exact' AND event_date IS NOT NULL AND approximate_date IS NULL) OR "
        "(date_kind = 'approximate' AND event_date IS NULL AND approximate_date IS NOT NULL) OR "
        "(date_kind = 'unknown' AND event_date IS NULL AND approximate_date IS NULL)", name="account_date_consistency"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text)
    date_kind: Mapped[str] = mapped_column(String(20))
    event_date: Mapped[date | None] = mapped_column(Date)
    approximate_date: Mapped[str | None] = mapped_column(String(200))
    place: Mapped[str | None] = mapped_column(String(500))
    mentioned_people: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RecordFile(Base):
    __tablename__ = "record_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000))
    media_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    original_key: Mapped[str] = mapped_column(String(100), unique=True)
    preview_key: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    links: Mapped[list["FileAccount"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class FileAccount(Base):
    __tablename__ = "file_accounts"
    file_id: Mapped[str] = mapped_column(ForeignKey("record_files.id", ondelete="CASCADE"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)


class StartEntry(Base):
    """Clave de reintento de Inicio; el contenido vive en registros y relatos existentes."""
    __tablename__ = "start_entries"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    entry_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), unique=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), unique=True)


class Timeline(Base):
    __tablename__ = "timelines"
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    confirmed_revision: Mapped[int | None] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(30))
    events: Mapped[list] = mapped_column(JSON)
    warnings: Mapped[list] = mapped_column(JSON)
    review_items: Mapped[list] = mapped_column(JSON, default=list)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ComplaintDraft(Base):
    """Private complaint draft. Built only from reviewed information; never visible to institutions."""
    __tablename__ = "complaint_drafts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    record_id: Mapped[str] = mapped_column(ForeignKey("private_records.id", ondelete="CASCADE"), unique=True)
    revision: Mapped[int] = mapped_column(Integer)
    timeline_revision: Mapped[int] = mapped_column(Integer)
    fields_json: Mapped[dict] = mapped_column(JSON)
    source_map: Mapped[dict] = mapped_column(JSON)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


CASE_STATUSES = ("new", "in_review", "follow_up", "closed")


class InstitutionalCase(Base):
    """Frozen snapshot received by an institution. Deliberately has no reference to the private record."""
    __tablename__ = "institutional_cases"
    __table_args__ = (UniqueConstraint("institution_id", "case_id", name="uq_institutional_cases_case_id"),
                      CheckConstraint("status IN ('new', 'in_review', 'follow_up', 'closed')", name="valid_case_status"))
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id: Mapped[str] = mapped_column(String(20))
    institution_id: Mapped[str] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    submitted_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    snapshot_json: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    procedure_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    files: Mapped[list["CaseFile"]] = relationship(cascade="all, delete-orphan", lazy="selectin", order_by="CaseFile.created_at")


class CaseFile(Base):
    """Institutional copy of a selected file. source_file_id is informational, not a foreign key."""
    __tablename__ = "case_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("institutional_cases.id", ondelete="CASCADE"), index=True)
    source_file_id: Mapped[str] = mapped_column(String(36))
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    sha256: Mapped[str] = mapped_column(String(64))
    storage_key: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
