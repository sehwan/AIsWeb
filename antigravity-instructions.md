# Antigravity Project Instructions

These rules must be followed by Antigravity whenever modifications are made to this project.

## Development Workflow

1.  **Build Phase**:
    After making any changes to the source code, you MUST run the build command to ensure the application is correctly packaged.
    - Command: `npm run build:mac`

2.  **Deployment (Local)**:
    Optionally, you can deploy to the Applications folder using:
    - Command: `cp -R dist/mac-arm64/AI.app /Applications/AI.app`

3.  **Version Control**:
    After every meaningful set of changes, you MUST commit and push your work to the remote repository.
    - Commands:
        - `git add .`
        - `git commit -m "Brief description of changes"`
        - `git push`

> [!IMPORTANT]
> Always verify the build succeeds before pushing to the repository.
