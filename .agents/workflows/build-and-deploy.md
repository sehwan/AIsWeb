---
description: Build the Electron app and copy to Applications
---

Whenever significant code changes are made to the application, automatically run this workflow to build the app and deploy it to the macOS Applications folder.

1. Build the Electron application for Mac:
// turbo
npm run build:mac

2. Copy the newly built application to the Applications folder, replacing the older version if it exists:
// turbo
cp -R dist/mac-arm64/AI.app /Applications/AI.app

3. Notify the user that the updated app has been installed and they can run it from Launchpad or the Applications folder.
