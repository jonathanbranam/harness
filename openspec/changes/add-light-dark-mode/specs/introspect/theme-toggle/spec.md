## Purpose

Lets a user of client-introspect's UI switch the app between light and dark appearance, and have that choice remembered across visits.

## ADDED Requirements

### Requirement: Theme toggle control
The system SHALL provide a control in client-introspect's UI chrome that lets the user switch between light and dark theme.

#### Scenario: User switches theme via the toggle
- **WHEN** the user activates the theme toggle control
- **THEN** the UI (chat panel, session/apparatus views, page shell) immediately re-renders in the newly selected theme without a page reload

### Requirement: Theme persists across sessions
The system SHALL persist the user's selected theme in the browser's `localStorage`, scoped to client-introspect, and SHALL restore it on subsequent page loads.

#### Scenario: Returning after selecting dark theme
- **WHEN** the user selected dark theme in a previous visit and reloads or reopens client-introspect
- **THEN** the UI renders in dark theme without requiring the user to re-select it

#### Scenario: Returning after selecting light theme
- **WHEN** the user selected light theme in a previous visit and reloads or reopens client-introspect
- **THEN** the UI renders in light theme without requiring the user to re-select it

### Requirement: OS preference as default
When no theme has been previously selected and stored for client-introspect, the system SHALL default to the browser/OS `prefers-color-scheme` setting.

#### Scenario: First visit with OS dark mode enabled
- **WHEN** a user with no stored client-introspect theme preference loads the app and their OS is set to dark mode
- **THEN** the UI renders in dark theme

#### Scenario: First visit with OS light mode enabled
- **WHEN** a user with no stored client-introspect theme preference loads the app and their OS is set to light mode
- **THEN** the UI renders in light theme

### Requirement: Independent from client-deck's theme preference
The system SHALL store and resolve client-introspect's theme preference independently of client-deck's, since the two are separate applications that may run for the same user at the same time.

#### Scenario: Different themes selected in each app
- **WHEN** the user selects dark theme in client-introspect and light theme in client-deck
- **THEN** each app continues to render in its own independently selected theme on subsequent loads
