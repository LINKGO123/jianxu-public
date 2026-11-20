import { config } from 'zod';

// Set this before loading shared schemas so their CSP probe stays disabled.
config({ jitless: true });
