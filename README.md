# Gorgeous International BD

A responsive Dhaka real estate website with public property search, property details and sharing, browser-local saved properties, WhatsApp enquiries, and a Firebase-backed agency dashboard.

## Run locally

Use Node.js and run `npm start`. Open http://127.0.0.1:5173. The public site and WhatsApp flow work with the empty Firebase configuration. Inventory starts empty until the agency publishes listings.

## Set up the agency dashboard

1. Create a dedicated Firebase project, enable Cloud Firestore and enable Email/Password authentication. Add the eventual site hostname to the authorized domains.
2. Paste the Firebase web app configuration into the `firebase` object in `config.js`. Keep private keys and service account credentials outside this repository.
3. Deploy `firestore.rules` before enabling the frontend connection. Use `npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID`. Enable Firebase App Check enforcement for Firestore once the web client has been registered and configured, or use the WhatsApp-only mode if public form abuse is a concern.
4. Create the agency user in Firebase Authentication. In a trusted Firebase Admin SDK environment, set the user's custom claim with `setCustomUserClaims(uid, { admin: true })`. Sign out and back in after setting a claim.
5. Open the dashboard near the footer. Publish only agency-approved properties and enter an HTTPS URL for each approved photo. Use the Facebook post field to link a listing to its source. The agency inbox reads the latest 100 enquiries. Public users can submit enquiries and only admins can read them.

GitHub Pages serves the frontend through the included workflow when Pages is configured to use GitHub Actions. For Firebase Hosting use `npx firebase-tools deploy --only firestore:rules,hosting --project YOUR_PROJECT_ID`.

The supplied logo and brief are the business sources. The hero is a decorative architectural illustration. No reference registry records are included because they contain unverified listings and third-party contact information. The street address remains unconfirmed and is omitted. The language switch covers selected public copy.
