# coding style guide

this repository follows these conventions:

## general

- use spaces for indentation (2 spaces)
- end files with a newline
- avoid trailing whitespace
- keep line length under 80 characters when possible
- use semicolons in javascript/typescript

## naming

- use camelCase for variables, functions and methods
- use PascalCase for classes, interfaces, types and enums
- use kebab-case for filenames
- in typescript, use underscore prefix for private field names (e.g. `_privateField`)

## comments

- all comments should be lowercase
- add spaces after comment markers (`// like this`)
- prefer descriptive variable/function names over comments
- comment complex logic or non-obvious solutions

## typescript

- prefer explicit typing over implicit when not obvious
- use interfaces for object typing
- enable strict mode
- avoid `any` type when possible

## astro

- use `.astro` extension for astro components
- include frontmatter section even if empty
- keep component logic in the frontmatter section
- avoid inline styles when possible, prefer tailwind classes

## css

- prefer tailwind utility classes
- when custom css is needed, use component-scoped styles
- use meaningful class names
- follow the "single responsibility" principle for classes

## motion animation library

- use lowercase function names from motion (animate, inView, press, etc.)
- prefer object syntax for animation properties
- use spring animations for natural movement
- set appropriate damping and stiffness values for smooth animations
- use chained animations rather than setTimeout when possible

## astro images

- use the built-in Image component for optimized images
- specify appropriate widths and sizes attributes
- provide descriptive alt text for accessibility
- prefer webp format for optimized images
- use eager loading only for above-the-fold content

## tailwindcss

- follow mobile-first responsive design
- use arbitrary values sparingly
- group related classes together (layout, typography, colors, etc.)
- use @apply in component styles only when necessary
- avoid mixing utility classes with custom css when possible

## performance considerations

- lazy load below-the-fold images
- minimize javascript bundle size with code splitting
- use performance.measure() for critical sections
- avoid layout shifts by setting explicit dimensions for images
- implement staggered animations for large collections of elements

## git

- use conventional commits format
- keep commits small and focused
- write descriptive commit messages
