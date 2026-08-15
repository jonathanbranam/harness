## Purpose

Gate every deck-harness-server route behind a single-owner password login, reusing track-web's opaque cookie-session-token pattern without needing a database.

## Requirements

### Requirement: Password login
The system SHALL authenticate `POST /api/auth/login` by comparing the request's `password` field against the bcrypt hash configured for the harness.

#### Scenario: Correct password
- **WHEN** a client POSTs the correct password to `/api/auth/login`
- **THEN** the system creates a new session, sets an HttpOnly session cookie, and responds 200 with `{ ok: true }`

#### Scenario: Incorrect password
- **WHEN** a client POSTs an incorrect password
- **THEN** the system responds 401 and does not set a session cookie

#### Scenario: Missing password field
- **WHEN** a client POSTs a body without a string `password` field
- **THEN** the system responds 400

### Requirement: Session-gated routes
The system SHALL reject requests to protected routes (`/api/auth/me`, `/ws`, and any future protected route) that lack a valid session cookie.

#### Scenario: No cookie
- **WHEN** a client requests a protected route without a session cookie
- **THEN** the system responds 401

#### Scenario: Expired session
- **WHEN** a client requests a protected route using a cookie whose session has passed its expiry
- **THEN** the system responds 401 and removes the expired session from the session store

### Requirement: Session expiry
Sessions SHALL expire 30 days after creation.

#### Scenario: Session still within its 30-day window
- **WHEN** a client requests a protected route before its session's 30-day expiry
- **THEN** the request is authenticated

### Requirement: Logout invalidates the session
`POST /api/auth/logout` SHALL invalidate the caller's session, clear the session cookie, and release any pi `AgentSession` associated with that session token.

#### Scenario: Logout while idle or streaming
- **WHEN** a client logs out, regardless of whether their `AgentSession` is idle or mid-stream
- **THEN** the session is invalidated, the cookie is cleared, the `AgentSession` is disposed, and subsequent requests using the old cookie are unauthorized

### Requirement: Session cookie attributes
The session cookie SHALL always be set `HttpOnly` and `SameSite=Lax`, and SHALL be set `Secure` only when the harness is configured to run behind TLS.

#### Scenario: Plain-HTTP local/LAN deployment
- **WHEN** the harness is configured without TLS (the default)
- **THEN** the session cookie is set without the `Secure` attribute, so it still works over plain HTTP

#### Scenario: TLS-terminated deployment
- **WHEN** the harness is configured to run behind TLS
- **THEN** the session cookie is set with the `Secure` attribute
