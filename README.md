# osw-backend

Backend services for OWS System.

## Prerequisites

- Node.js (Latest LTS recommended)
- pnpm

## Setup

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd osw-backend
    ```

2.  Install dependencies:
    ```bash
    pnpm install
    ```

3.  Configure environment variables:
    - Create a `.env` file in the root directory.
    - Add necessary configurations (DB connection, secrets, etc.).

## Scripts

- `pnpm start`: Run the application in production mode.
- `pnpm dev`: Run the application in development mode with hot-reloading.
- `pnpm nodemon`: Run with nodemon.

## Project Structure

- `bin/`: Entry point scripts.
- `app.js`: Application setup.
- `routes/`: Route definitions.
- `public/`: Static files.
- `class/`, `config/`, `module/`: Application components.
