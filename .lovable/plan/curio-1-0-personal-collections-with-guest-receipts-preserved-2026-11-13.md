# Curio 1.0: personal collections, with guest receipts preserved

## What you’ll get
A mobile-first Curio experience in this existing web project, following the PRD’s 1.0 scope. Accounts unlock a private Library, while “Try the guest version” keeps the current anonymous receipt maker available.

**Platform boundary:** this project supports mobile web, not Expo/React Native or an App Store binary. Native Photos access, native haptics, EAS uploads, and App Store submission are not part of this implementation. Camera capture, downloads, and sharing will use available browser capabilities with honest fallbacks.

## Screens and experience

### Welcome, accounts, and onboarding
- Keep Curio’s supplied character, wordmark, colors, and brief companion voice.
- Offer account creation, sign-in, and an unmistakable guest-version option.
- Email/password and Apple sign-in, as specified in the PRD; email confirmation and password recovery included.
- Create a unique username, display name, and optional profile photo.
- A short, skippable onboarding survey about art interests and visiting habits. Answers are preferences, not restrictions on what users can log.

### Library: match the supplied references
- A dark, uncluttered collection screen with a prominent “My collection” heading and horizontal category filters.
- Two-column folders on mobile, expanding gracefully on larger screens.
- Each category shows a fanned stack of actual receipt previews tucked behind a translucent acrylic pocket, with subtle blur, edge highlights, and four metallic corner rivets. Build the pocket as real interactive UI, not an embedded screenshot.
- Category names and receipt counts beneath each folder; empty collections have a clean first-visit action, not invented personal receipts.
- Opening a folder reveals its receipts as a browsable stack. The detail treatment follows the second reference: a light surface, central pocket/receipt, neighboring previews, title and artist, and an action to open the full visit.
- Filters, draft and want-to-go views, and museum search remain reachable without overcrowding the top row.
- Bottom navigation: Library, a central + action, and Profile. No social feed in 1.0.

### Capture → recognize → reflect → receipt
- Reuse the current camera, upload validation, optional AI identification, correction, crop/reset, half-star rating, emotions, notes, color/B&W dithering, printer animation, and receipt export.
- One artwork per receipt; title required before completion.
- Keep Anthropic identification and best-effort Google Vision hints. Add a conservative category suggestion without guessing unknown genres.
- Signed-in users save completed receipts to their private collection and can reopen, edit, or delete them.
- Drafts save locally as users work, restore after interruption, and retry synchronization when connectivity returns. Show whether a draft is saved locally or synced.
- Retain guest behavior and existing guest visit URLs. Do not automatically import someone’s guest history into an account; any “save this guest receipt” action must verify both the account and ownership of that receipt.

### Museums and want-to-go
- Search museum names using the existing search capability.
- Museum detail: name, known city/country, the account’s visits there, and bookmark toggle.
- Want-to-go list supports opening and removing bookmarks. Never invent location data or opening hours.

### Profile and settings
- Edit username, display name, optional photo, and onboarding preferences.
- Show actual collection statistics: museums visited, visits, average artwork rating, most-logged category and artist; empty states instead of fictional statistics.
- Settings include sign-out, privacy policy, and confirmed account deletion that removes the account’s data and stored media.
- Update privacy copy for private collections and photos sent to Anthropic and optionally Google Vision.
- Do not invent a support email; a contact address remains pending until supplied.

## Technical approach
- Keep TanStack Start and existing receipt rendering; add focused collection, account, and navigation modules.
- Use the integration-managed authenticated route gate and bearer middleware for account pages and server actions. Public welcome, guest flow, and recovery remain public.
- Introduce owner-scoped profile, collection, draft, and bookmark storage with explicit grants and RLS. Automatically create the profile on signup and enforce normalized username uniqueness.
- Preserve the existing deny-all guest `visits`/`artworks` tables and private `artwork-photos` bucket. Add account-owned storage separately rather than widening guest access.
- Derive account ownership from validated authentication, never a submitted user ID. Use privileged access only for authorized lifecycle work, guest-ownership checks, and storage operations that require it.
- Store stable image paths, not expiring signed URLs; generate fresh authorized URLs when opening a collection.
- Scope local drafts to their account and clear protected caches on sign-out. Local guest drafts remain separate.
- Use semantic design tokens for the Library’s charcoal surface, acrylic highlights, light detail surface, and metallic rivets. Respect reduced motion and label all icon controls.
- Give every content page its own Curio title and sharing metadata.

## Verification before completion
- Run tests for ownership isolation, required title, one-artwork limit, half-star values, unique username behavior, draft restoration, and account data deletion.
- Exercise a real signed-in flow: profile → capture/upload → identification → reflection → print → save → Library → reopen/edit/delete.
- Verify museum search/bookmarks, sign-out, password recovery states, and the unchanged guest receipt flow.
- Check the Library grid, acrylic pockets, stack detail, camera, and printing on mobile and desktop; inspect errors and image loading.
- Clearly report any provider consent or email-confirmation checks that cannot be completed automatically.

## Outside this release
Feed, following, likes, comments, notifications, maps, trips, museum business tools, rankings, and AI profile summaries are excluded as later-release or stretch features in the PRD. Native iOS packaging remains a separate deliverable.
