// Ensures TanStack Start's module augmentation is loaded for all route files.
// Without this, CI typechecks can see `createFileRoute({ server: ... })` before
// `@tanstack/react-start` augments TanStack Router's file-route options.
import "@tanstack/react-start";
