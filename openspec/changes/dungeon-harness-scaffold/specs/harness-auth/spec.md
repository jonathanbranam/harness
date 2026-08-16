## ADDED Requirements

### Requirement: Dungeon harness routes are session-gated
The auth system SHALL apply the same cookie-session validation to the `dungeon-harness-server` routes and its `/ws` endpoint as it does to the deck and introspection harness routes.

#### Scenario: Dungeon login
- **WHEN** a client POSTs the correct password to `/api/auth/login` on the dungeon harness
- **THEN** the system creates a session, sets the same HttpOnly session cookie, and protects subsequent dungeon harness requests

#### Scenario: Dungeon WebSocket without cookie
- **WHEN** a client attempts to open `/ws` on the dungeon harness without a valid session cookie
- **THEN** the connection is rejected with 401
