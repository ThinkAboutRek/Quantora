# Data retention: portfolio archive and permanent delete

This document describes the portfolio lifecycle behaviour that exists today
(introduced in Phase 9). It documents only what the system currently does; it
makes no commitments about behaviour that has not been built.

## Archive

* Archiving a portfolio is **reversible**. It sets a single flag on the record;
  nothing is removed.
* Archived portfolios are **excluded from the default active list**. They are
  visible through the archived view and remain directly retrievable by their
  owner.
* An archived portfolio **can be restored** (unarchived) at any time, returning
  it to the active list.
* An archived portfolio cannot be renamed; it must be restored first.

## Permanent delete

* Permanent deletion is available **only after a portfolio has been archived**.
  An active portfolio cannot be permanently deleted; the request is rejected.
* In the interface, permanent deletion additionally requires an explicit
  confirmation step.
* Permanent deletion **removes the current portfolio record**.
* **Permanent deletion cannot be undone.** There is no restore path for a
  deleted portfolio.

## Review note for later phases

Today a portfolio is a standalone record: no other stored data depends on it.
Later phases are expected to introduce dependent portfolio records (for
example, transactions or holdings). **Deletion semantics must be reviewed
before any dependent portfolio records are introduced** — what permanent
deletion should do to dependent data is an open decision, and nothing in this
document should be read as a commitment either way.
