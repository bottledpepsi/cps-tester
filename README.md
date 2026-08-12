# CPS Tester

A lightweight, accurate Clicks Per Second (CPS) tester for keyboard, mouse, touch, and pen input.

This project is a ground-up rewrite of the original CPS Tester. It uses **HTML5, CSS, and JavaScript**. There are no frameworks, JavaScript libraries, CSS frameworks, package dependencies, or build tools.

## Features

- Accurate fixed-duration CPS testing using `performance.now()`.
- Mouse button testing for left, middle, and right buttons.
- Keyboard testing for any browser-recognised key.
- Touch and pen input support on compatible devices.
- High-resolution timing with `requestAnimationFrame` for live display updates.
- Key-repeat protection so holding a keyboard key does not inflate results.
- Pointer tracking to prevent duplicate pointer events from counting twice.
- Configurable tests from 1 to 60 seconds.
- Persistent local test history using `localStorage`.
- Save, delete, clear, and sort historical results.
- Automatic migration of the original `cpsTests` and `savedTests` storage buckets.
- Responsive layout for desktop, tablet, and mobile screens.
- Keyboard-accessible controls and visible focus states.
- Reduced-motion support.
- No network requests or runtime dependencies.

## Deployment

The project can be deployed directly to any static hosting provider, including GitHub Pages, because it requires no server-side runtime or build process.

For GitHub Pages, publish the repository root as the site source. The included workflow can also deploy the static files automatically.

## Privacy

The tester does not send test data to a server. History is stored in the browser's `localStorage` and remains local to that browser profile unless the user clears it.

## License

GPL-3.0. See `LICENSE`.
