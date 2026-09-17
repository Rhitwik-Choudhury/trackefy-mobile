// Only the public backend URL belongs in the mobile bundle. Google Routes keys stay on the server.
export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://api.trackefy.in/api').replace(/\/$/, '');
