"""The label set for rental-complaint classification, tied to statute.

Every label names a provision of Ghanaian law. A classifier that predicts a
label the law does not recognise is useless for this purpose, and a label
without a citation cannot be shown to a tenant who is about to act on it.

ADVANCE is deliberately present but marked `requires_quantity`: whether a
demand for advance is lawful depends on the number of months, and that is
arithmetic against the s.25 six-month limit, not a judgement a classifier
should make. The model says "this complaint is about rent advance"; the
deterministic layer in the API decides whether it is a violation.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Label:
    key: str
    title: str
    citation: str
    #: Highest severity this can reach once confirmed.
    severity: str
    #: True when a violation cannot be asserted from the text alone.
    requires_quantity: bool = False


LABELS: tuple[Label, ...] = (
    Label(
        key="excessive_advance",
        title="Rent advance demand",
        citation="Rent Act, 1963 (Act 220), Section 25",
        severity="high",
        requires_quantity=True,
    ),
    Label(
        key="illegal_eviction",
        title="Eviction without a court order",
        citation="Rent Act, 1963 (Act 220), Sections 17-20",
        severity="high",
    ),
    Label(
        key="illegal_rent_increase",
        title="Rent increase outside the lawful process",
        citation="Rent Act, 1963 (Act 220), Section 25(2)",
        severity="medium",
    ),
    Label(
        key="deposit_withholding",
        title="Security deposit withheld",
        citation="Rent Act, 1963 (Act 220), Section 25",
        severity="medium",
    ),
    Label(
        key="utility_disconnection",
        title="Utilities cut to force a tenant out",
        citation="Rent Act, 1963 (Act 220), Sections 17-20",
        severity="high",
    ),
    Label(
        key="entry_without_notice",
        title="Entry without notice or consent",
        citation="Rent Act, 1963 (Act 220) — quiet enjoyment",
        severity="medium",
    ),
    Label(
        key="receipt_refusal",
        title="Refusal to issue a rent receipt",
        citation="Rent Act, 1963 (Act 220), Section 23",
        severity="low",
    ),
    Label(
        key="repairs_neglect",
        title="Failure to maintain the premises",
        citation="Rent Act, 1963 (Act 220), Section 12",
        severity="medium",
    ),
    Label(
        key="harassment",
        title="Harassment, threats or intimidation",
        citation="Rent Act, 1963 (Act 220) — quiet enjoyment; Criminal Offences Act 1960",
        severity="high",
    ),
    Label(
        key="discrimination",
        title="Discrimination in letting",
        citation="Constitution of Ghana, Article 17; CHRAJ mandate",
        severity="high",
    ),
)

LABEL_KEYS: tuple[str, ...] = tuple(label.key for label in LABELS)
BY_KEY: dict[str, Label] = {label.key: label for label in LABELS}
