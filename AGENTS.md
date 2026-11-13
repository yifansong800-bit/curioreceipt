<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Artwork identification uses the saved Anthropic key through the server-only Messages API; optional Google Vision hints are best-effort so unavailable Vision access never blocks recognition.
- Account collections use owner-scoped tables and protected server functions separately from legacy guest tables, preserving guest session security and URLs.
- Account receipt imports verify both authenticated identity and guest session ownership, copy media to private account storage, and persist stable paths rather than signed URLs.
- Mobile web collection routes use a shared charcoal shell and CSS acrylic receipt pockets; native packaging is outside this project’s supported stack.
- Local entry drafts use IndexedDB with account-or-guest and visit keys so photos survive interrupted capture without mixing identities.
