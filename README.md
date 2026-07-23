## Running the Project with Docker

This project is containerized using Docker and Docker Compose for easy setup and deployment. Below are the instructions and requirements specific to this project.

### Project-Specific Docker Requirements
- **Node.js Version:** The Dockerfile uses `node:22.13.1-slim`. Ensure your build environment supports this version.
- **Dependencies:** Production dependencies are installed via `npm ci --production`.
- **User Permissions:** The app runs as a non-root user (`appuser`) for improved security.

### Environment Variables
- The application expects environment variables to be set. You can provide these in a `.env` file at the project root.
- The Docker Compose file includes a commented `env_file: ./.env` line. Uncomment this if you have a `.env` file with your configuration.
- **Required variables** (based on typical Node.js setups and the presence of `.env`):
  - Database connection strings
  - API keys or secrets
  - Any other configuration required by your app

### Build and Run Instructions
1. **(Optional) Prepare your `.env` file:**
   - Copy or create a `.env` file in the project root with all necessary environment variables.
2. **Build and start the application:**
   ```sh
   docker compose up --build
   ```
   This will build the image and start the `js-app` service.

### Ports
- The main application service (`js-app`) exposes port **3000**. Access the app at `http://localhost:3000`.

### Special Configuration
- The Docker Compose file is ready for extension if you need to add services like a database (e.g., PostgreSQL). Example configuration is provided but commented out.
- The application runs with `NODE_ENV=production` and increases the Node.js memory limit via `NODE_OPTIONS="--max-old-space-size=4096"`.
- The app is attached to a custom Docker network `appnet` for service isolation and communication.

### Notes
- If you add a database or other services, update the `depends_on` and uncomment the relevant sections in `docker-compose.yml`.
- Persistent storage for databases can be enabled by uncommenting the `volumes` section.

---

*Update this section if you change the Docker setup or add new services to the Compose file.*