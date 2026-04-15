## Folder Structure

### Components

Intended for fully reusable generic components & shadcn-ui components.

### Hooks

Generic utility hooks

### Integrations

3rd party integration configurations, e.g. Convex, Tanstack Query

### Lib

Common utilities

### Layouts

App-specific shared page shells and layouts.

### Routes

Tanstack Start router entry point. It is preferred, to keep the route files simple.

### Spaces

Files specific to a certain "space". Each space refers to a single route entry point. Follows the same pattern as the rest of the repo, but on a smaller scale. Components, lib, hooks are still meant to be reusable within the space. Each space should have a page.tsx file. Example:

```
spaces
  <page-1>
    components
    hooks
    lib
    page.tsx
  <page-2>
    components
    hooks
    lib
    page.tsx
```

## Preferences

Reusable units of code should be composed together at the place of usage.
