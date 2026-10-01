# Cursor Developer Instructions — Fix Shaky / Jumping UI

## Objective

Some screens, forms, accordions, and popups feel slightly **shaky or jumpy** when users click controls, enter information, expand sections, or open/close popups.

Fix the UI stability issues **without changing any functionality, workflow, business logic, clinical logic, content, or overall visual design**.

---

## Issues to Check and Fix

### 1. Focus / Selected State Layout Shifts

Inputs, buttons, cards, and other controls must not change dimensions when focused, selected, active, or hovered.

Avoid changing border thickness between states.

**Bad:**

```css
input {
  border: 1px solid #ccc;
}

input:focus {
  border: 2px solid #2563eb;
}
```

**Preferred:**

```css
input {
  border: 1px solid #ccc;
}

input:focus {
  border-color: #2563eb;
  outline: 2px solid rgba(37, 99, 235, 0.15);
  outline-offset: 1px;
}
```

Keep the element's width and height identical in all interaction states.

---

### 2. Remove Broad CSS Transitions

Avoid:

```css
transition: all 0.2s ease;
```

Only animate visual properties that do not alter layout.

Example:

```css
transition:
  border-color 0.15s ease,
  box-shadow 0.15s ease,
  background-color 0.15s ease,
  opacity 0.15s ease;
```

Do not animate layout-sensitive properties unless specifically required:

- width
- height
- margin
- padding
- top
- left
- right
- bottom

---

### 3. Reduce Unnecessary React Re-renders

Typing into a single field should not cause the entire:

- page
- consultation screen
- modal
- accordion
- parent form

to re-render unnecessarily.

Review component state placement and memoization where appropriate.

Keep rapidly changing input state as local as practical.

Do not alter existing data handling or form behavior.

---

### 4. Stabilize Popups and Modals

Popups/modals should remain visually fixed while their internal content changes.

They should not:

- recenter after every state update
- change width unexpectedly
- jump vertically when validation appears
- resize repeatedly while users type

Use a stable modal shell such as:

```css
.modal {
  width: min(720px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}
```

Adjust dimensions to match the existing UI design.

Do not redesign the popup.

---

### 5. Prevent Scrollbar-Induced Page Jumping

When opening or closing a modal, ensure the underlying page does not shift horizontally because the browser scrollbar appears/disappears.

Use the project's existing modal/scroll-lock approach where possible.

Consider stable scrollbar handling such as:

```css
html {
  scrollbar-gutter: stable;
}
```

Only apply where compatible with the current application.

---

### 6. Stabilize Auto-Resizing Textareas / Transcript Fields

Review:

- transcript boxes
- dictated-note fields
- typed-note fields
- consultation note areas
- other auto-growing textareas

They should not cause repeated visible layout jumps on every keystroke.

If auto-resizing is required, make the resize smooth and controlled while preserving existing functionality.

---

### 7. Reserve Space for Conditional UI

Where practical, prevent nearby elements from jumping when these appear/disappear:

- validation messages
- helper text
- loading indicators
- status messages
- conditional buttons
- approval controls
- error messages

Use stable containers or reserved minimum heights where appropriate.

Do not leave unnecessary blank space if it harms the existing design.

---

### 8. Stabilize Buttons and Conditional Controls

Buttons should not change surrounding layout when they:

- become enabled/disabled
- change label
- appear/disappear
- enter a loading state
- change icon

Where a button occupies a known location in the workflow, maintain stable spacing and dimensions.

---

### 9. Global Box Sizing

Ensure this exists globally or equivalent behavior is already provided by the UI framework:

```css
*, *::before, *::after {
  box-sizing: border-box;
}
```

Do not duplicate it unnecessarily if already present.

---

## Regression Requirements

This is a **UI stability and frontend performance cleanup only**.

Do NOT change:

- workflow
- navigation
- clinical logic
- business logic
- API behavior
- data structures
- validation rules
- field behavior
- button actions
- labels/content
- permissions
- existing feature behavior
- overall visual design

---

## Acceptance Criteria

After the fix:

- Clicking fields should produce no visible layout jump.
- Typing should feel stable with no flickering or shaking.
- Buttons should not move when their state changes.
- Accordions should expand/collapse smoothly.
- Modals/popups should stay fixed in position and size unless an intentional resize is required.
- Validation/helper messages should not cause distracting movement.
- Opening/closing a modal should not shift the underlying page sideways.
- Existing functionality must behave exactly as before.

Please inspect the affected components and shared UI primitives first so the fix is applied consistently rather than patched screen-by-screen.
