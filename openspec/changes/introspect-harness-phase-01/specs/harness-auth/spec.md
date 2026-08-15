## ADDED Requirements

### Requirement: Introspection harness routes are session-gated
The auth system SHALL apply the same cookie-session validation to the introspection-harness-server routes and its `/ws` endpoint as it does to the deck-harness-server routes.

#### Scenario: Introspection login
- **WHEN** a client POSTs the correct password to `/api/auth/login` on the introspection harness
- **THEN** the system creates a session, sets the same HttpOnly session cookie, and protects subsequent introspection harness requests

#### Scenario: Introspection WebSocket without cookie
- **WHEN** a client attempts to open `/ws` on the introspection harness without a valid session cookie
- **THEN** the connection is rejected with 401
