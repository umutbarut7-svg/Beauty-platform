# Service catalog cards — 4 November 2026

Customer catalog and business management share a service choice card with a decorative mark, name, localized price, optional positive duration and explicit selection state. Existing accessible button names and booking selection resets are preserved. Cut, color, extensions, styling and care marks use native Views; unknown services use a neutral mark. Name-based marks are presentation only and never determine compatibility or provider actions. No dependencies or schema changes.

Prices remain authoritative API values, formatted with the existing currency helper; no demo price, stock value or inferred availability is inserted. Business selection still populates the existing service/price/currency inputs without saving. Missing duration is omitted. Price rows wrap on narrow screens.

Validation: local mobile typecheck, changed-source lint/format, 39 existing client tests and web export passed. New isolated Chromium/WebKit acceptance covers 320/390/768px, six service marks, long names, large/decimal/zero prices, missing duration, selection and management input preservation. All non-local requests are intercepted; it rejects unexpected requests and service writes. CI and screenshot review are pending at creation.

This is a prepared UI change, not a new TestFlight delivery. TestFlight 1131 remains the latest accepted build. No live AI request, index update, catalog write, credential/quota change or store submission. Service/product inventory and B2B are separate unfinished work. Stage 33 remains NOT PASS.
