import 'dotenv/config';
import { createApp } from './app';
import { printServerReady } from './lib/consoleStyle';

// Default 5001: macOS often binds 5000 to AirPlay Receiver, which returns 403 to random HTTP and blocks the API.
const PORT = process.env.PORT || 5001;
const app = createApp();

app.listen(PORT, () => {
  printServerReady(Number(PORT));
});
