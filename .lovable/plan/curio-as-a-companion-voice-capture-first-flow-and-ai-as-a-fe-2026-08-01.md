# Curio as a companion: voice, capture-first flow, and AI as a feature

Three changes, in one pass: give Curio a consistent first-person voice, split the piece step so the photo comes first, and make identification a visible, delightful moment instead of a small underlined link.

## 1. Voice and perspective

Today the app speaks as a neutral system ("Step 1 · The piece", "Upload a photo to continue", "Couldn't identify artwork"). Curio should speak as a small companion who is walking the museum with you: first person, warm, brief, a little wry — never cutesy, never long.

Rules to apply everywhere:

- Curio says "I" and "we"; the user is "you". Never "the user", never "we" meaning the company.
- One short line per moment. No stacked helper text.
- Lowercase-friendly mono voice, matching the existing type; keep the ALL-CAPS tracking style only for structural labels.
- Errors are Curio admitting a limit, not a system failure.

Copy pass across the flow (illustrative, final wording tuned while implementing):


| Where            | Now                                       | Curio                                                                                        |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Begin q1         | "First — what should we call you?"        | "hi. what should I call you?"                                                                |
| Begin q2         | "Are you still at the museum?"            | "are we still in the museum together?" / "yes, I'm in front of it" · "no, I've already left" |
| Begin q3         | "Which museum are you in?"                | "which museum are we in?"                                                                    |
| Begin CTA        | "begin visit →"                           | "let's go →"                                                                                 |
| Capture prompt   | "✦ Upload a photo of your favorite piece" | "show me the piece you couldn't walk past"                                                   |
| Identify running | "Identifying…"                            | "let me look…" / "I think I know this one…"                                                  |
| Identify result  | "✦ Is this right?"                        | "I think this is… did I get it right?"                                                       |
| Identify fail    | "couldn't identify — enter manually"      | "I don't know this one. tell me about it?"                                                   |
| Reflection step  | "How did this piece land with you?"       | "so — how did it land with you?"                                                             |
| Note field       | placeholder                               | "what were you thinking, standing there?"                                                    |
| Printing         | "opening receipt…"                        | "warming up the printer…"                                                                    |
| Done             | save/share labels                         | "here's ours. keep it."                                                                      |


Also update the begin-page and visit-page `head()` titles/descriptions to the same voice.

## 2. Capture-first flow

Split the current step 1 into two screens so nothing appears before the photo does.

```text
snap mode:   begin → CAMERA opens immediately → shot taken → identify runs → details screen
upload mode: begin → single upload prompt (nothing else) → file chosen → "want me to identify it?" → details screen
                                                                    └ "I'll type it" → details screen
```

- **Snap mode**: on landing on the visit page with `mode=snap`, the existing `CameraCapture` opens automatically as the first thing the user sees, with a Curio line above the viewfinder. Identification starts automatically the moment the shot is accepted (they're standing in front of the work — this is the magic moment). Closing the camera without a shot falls back to the upload prompt rather than a dead end.
- **Upload mode**: the first screen is only the drop/upload target plus one Curio line — no title/artist/medium fields, no step chrome. After the file is chosen and cropped, a small card asks "want me to try to identify it?" with "yes, take a look ✦" and "I'll type it myself". Choice remembered for the rest of the session.
- **Details screen**: appears only after a photo exists. Shows the photo thumbnail, the identify result (or empty fields), and the manual fields. Reflection stays as the following step.
- Step chrome becomes three beats instead of two: `photo · details · reflection`, rendered in the existing mono/tracking style.
- Keep the crop editor, HEIC conversion, Enter-never-submits behavior, retake/change, and the `piece-proof` review page exactly as they are.

## 3. Making AI identification feel like a feature

Right now identification hides behind a grey underlined link. Changes:

- **Promote it to the primary action** on the "want me to identify it?" card and as an automatic run in snap mode.
- **A visible thinking state**: while the call is in flight, the photo thumbnail gets a scanning treatment — a thin teal line sweeping across the image plus a rotating set of Curio lines ("looking at the brushwork…", "checking the plaque…", "cross-referencing…"). This makes the ~2–5s wait feel intentional. Pure CSS, no new deps.
- **A result card with confidence**: the returned fields land in a receipt-styled card headed "I think this is…", each field on its own line, with a confidence badge from the existing `confident` flag ("pretty sure ✦" vs "a guess — check me"). Fields the model returned empty are shown as "you tell me". Accept-all, or tap any single line to correct it before accepting.
- **Graceful failure**: no red error toast. Curio says it doesn't know the piece and hands over the manual fields, with a "try again ✦" affordance.
- **Small credit on the receipt draft**: the proof sheet notes identified fields with a subtle ✦ mark, so the user sees where Curio helped.

## Technical notes

- Fix the current camera snap mode UI: remove the current sketched out camera frame border. It should look clean on any devices. For the snap button, generate a graphic of an actual shirt button that is aesthetic and creative.
- `src/routes/begin.tsx` — copy only.
- `src/routes/visit.$visitId.tsx` — `PieceForm`'s `step` state goes from `"piece" | "reflection"` to `"capture" | "details" | "reflection"`; auto-open `CameraCapture` on mount when `captureMode === "snap"`; auto-run `runIdentify` after `acceptFile` in snap mode; add the identify-offer card for upload mode. Existing `runIdentify`, abort handling, HEIC conversion, and save pipeline are reused unchanged.
- New `src/components/identify-panel.tsx` — scanning thumbnail state, rotating status lines, and the result/confidence card, extracted so `PieceForm` stays readable.
- `src/styles.css` — one keyframe utility for the scan sweep.
- `src/components/piece-proof.tsx`, `src/components/receipt.tsx` — copy plus the ✦ identified marker.
- No backend, schema, or edge-function changes; the `identify-artwork` function and its response contract stay as-is.