"""VERA conversacional (epic #5). FASE 0 only freezes the contract in `contracts.py`; the turn
orchestrator, tool executor and brains (`llm.py` / `scripted.py`) land in later phases (EST-01…EST-06)."""
from .contracts import (BrainMode, CaseCounts, CaseEvent, CaseState, ChatMessage, ChatTurn, ChatTurnRequest,
                        ChatTurnResponse, ConversationView, DateInfo, EventStatus, EvidenceItem, Goal, Intent,
                        MissingInfo, Origin, Person, PersonRole, SourceKind, SourceRef, SuggestedAction,
                        SuggestedActionType)

__all__ = ["BrainMode", "CaseCounts", "CaseEvent", "CaseState", "ChatMessage", "ChatTurn", "ChatTurnRequest",
          "ChatTurnResponse", "ConversationView", "DateInfo", "EventStatus", "EvidenceItem", "Goal", "Intent",
          "MissingInfo", "Origin", "Person", "PersonRole", "SourceKind", "SourceRef", "SuggestedAction",
          "SuggestedActionType"]
