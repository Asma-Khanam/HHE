# iPhone app (Client website) — build guide

Capacitor 8 wrapper around the Client website. The `ios/` folder is the Xcode project.
Bundle ID: `com.heatherharries.hub` · App name: Heather Harries · iPhone only · iOS 15+

## What you need (Apple's rules, checked 23/10/2026)
- A Mac with **Xcode 26 or newer** (Apple stopped accepting uploads from older Xcode on 28/04/2026) + Command Line Tools
- Node 22+ (already used by this project)
- An **Apple Developer Program** account owned by the company (paid, yearly). Needed for TestFlight, push notifications and the App Store. Not needed to try the app in the Simulator.

## Build and run (Mac)
```
cd eduhub-app/frontend
npm install
npm run build          # builds the website into dist/
npx cap sync ios       # copies it into the iPhone project
npx cap open ios       # opens Xcode
```
In Xcode: App target → Signing & Capabilities → pick the company Team → press Run (▶). Swift Package Manager downloads Capacitor on first open (no CocoaPods).
Every time the website code changes, repeat `npm run build` and `npx cap sync ios`.

## Already set up in this project
- App icon 1024×1024 (HHE tree logo, no transparency — Apple rejects icons with transparency) and a maroon splash screen
- Camera + photo-library permission texts (document and profile-photo upload)
- `ITSAppUsesNonExemptEncryption = false` (only standard HTTPS) so Apple doesn't ask the export-compliance question on every upload
- Privacy manifest `App/App/PrivacyInfo.xcprivacy` (no tracking; lists the data the app collects, all for app functionality)
- Push-token hand-off code in `AppDelegate.swift` (needed later for push notifications)
- iPhone only (no iPad) so Apple doesn't test or require iPad screenshots
- Password-reset email link opens the live website (inside the app the app's own address would not work)

## Still to do before submitting
1. **Account deletion inside the app** (Apple guideline 5.1.1(v)) — not built yet. See open question on invoices/accounting records.
2. **Push notifications** — plugin is installed, nothing uses it yet. Needs: Push Notifications capability in Xcode (once the paid account exists), an APNs key from the developer account, a table for device tokens and a sender.
3. **Reviewer demo login** with sample family data (account must work on the day of review).
4. **Privacy policy** page wording approved by the founders (public link: `/privacy`), same link entered in App Store Connect.
5. **App Store Connect**: app name, description, support email, screenshots (Apple lists the required sizes), App Privacy answers matching `PrivacyInfo.xcprivacy`, review notes (below).
6. Confirm `VITE_API_BASE` / `API_BASE` in `src/lib/native.js` is the real live client domain (currently defaults to `https://hhe.vercel.app`).
7. Test on a real iPhone: login, upload with camera and photo library, Stripe "Pay now" page, password reset, airplane mode.

## Why Apple might reject it, and the answer
- **4.2 "just a website"**: the web code is bundled inside the app (not loaded from a URL), and the app uses native features — camera/photo upload of documents, push reminders (once built). Describe these in the review notes.
- **5.1.1(v) account deletion**: must be started inside the app and delete the account and its personal data.
- **Payments**: Stripe is used only to pay for real-world relocation/school-application services, which is allowed outside In-App Purchase. Say this in the review notes.
- **Login**: email + password only, so Sign in with Apple is not required. If Google/other social login is ever added, Apple login must be added too.

## Review notes (paste into App Store Connect)
> Heather Harries Education Hub is the client app for families relocating to the UAE who are applying to schools through Heather Harries Education Consultants. Families complete their application details, upload documents (camera/photo library), view school assessments and tours, and pay HHE's invoices for real-world consulting services via Stripe's secure page.
> Demo login: <email> / <password> (a sample family with applications, documents and an unpaid invoice).
