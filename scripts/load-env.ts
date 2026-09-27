// Loads .env for CLI scripts (production images receive env vars directly).
import { config } from "dotenv";

config({ quiet: true });
