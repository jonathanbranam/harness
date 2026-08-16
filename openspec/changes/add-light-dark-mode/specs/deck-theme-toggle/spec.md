## Purpose

Lets a user of client-deck's editor UI switch the surrounding chrome between light and dark appearance, and have that choice remembered across visits, without altering the rendered deck content itself.

## ADDED Requirements

### Requirement: Theme toggle control
The system SHALL provide a control in client-deck's UI chrome that lets the user switch between light and dark theme.

#### Scenario: User switches theme via the toggle
- **WHEN** the user activates the theme toggle control
- **THEN** the UI chrome (chat panel, deck switcher, page shell) immediately re-renders in the newly selected theme without a page reload

### Requirement: Theme persists across sessions
The system SHALL persist the user's selected theme in the browser's `localStorage`, scoped to client-deck, and SHALL restore it on subsequent page loads.

#### Scenario: Returning after selecting dark theme
- **WHEN** the user selected dark theme in a previous visit and reloads or reopens client-deck
- **THEN** the UI chrome renders in dark theme without requiring the user to re-select it

#### Scenario: Returning after selecting light theme
- **WHEN** the user selected light theme in a previous visit and reloads or reopens client-deck
- **THEN** the UI chrome renders in light theme without requiring the user to re-select it

### Requirement: OS preference as default
When no theme has been previously selected and stored for client-deck, the system SHALL default to the browser/OS `prefers-color-scheme` setting.

#### Scenario: First visit with OS dark mode enabled
- **WHEN** a user with no stored client-deck theme preference loads the app and their OS is set to dark mode
- **THEN** the UI chrome renders in dark theme

#### Scenario: First visit with OS light mode enabled
- **WHEN** a user with no stored client-deck theme preference loads the app and their OS is set to light mode
- **THEN** the UI chrome renders in light theme

### Requirement: Deck content unaffected by theme
The system SHALL NOT apply the selected UI theme to the rendered deck/slide content or to the chrome-free presentation (slideshow) view; both SHALL render exactly as authored regardless of the selected theme.

#### Scenario: Dark theme selected while editing a deck
- **WHEN** the user has dark theme selected and views a slide in the editor canvas
- **THEN** the rendered slide's colors, backgrounds, and styling are unchanged from how they appear in light theme

#### Scenario: Dark theme selected while presenting
- **WHEN** the user has dark theme selected and enters the full-screen presentation view
- **THEN** the presentation view renders the deck exactly as authored, with no dark-theme styling applied to its chrome-free layout
