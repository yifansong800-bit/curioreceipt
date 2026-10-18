# Curio Receipt Maker 

Build a single-feature web app called Curio .The only feature is a museum visit receipt generator.

The user flow is:

Land on a simple start screen

Enter their name and the museum they visited

Add one or more artwork entries (upload photo from their camera roll or files if also on computer)

Generate a downloadable thermal receipt of their visit (I will attatch a reference image for the design)

Tech stack:

Supabase for database and image storage

No auth required for v1 — sessions are anonymous

Each entry stores: image URL, title, artist, medium, emotion chips, photo timestamp

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://curioreceipt.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f4dec416-f58a-4052-b28c-03e6bc204623).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
