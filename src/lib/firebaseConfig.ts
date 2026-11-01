// Safe typed Firebase configuration module that works universally in Vite, Node ESM, tsx, and production builds.
import firebaseConfigJson from '../../firebase-applet-config.json' with { type: 'json' };

export const firebaseConfig = firebaseConfigJson;
export default firebaseConfig;
