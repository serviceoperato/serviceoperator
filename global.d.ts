export {};

declare global {
  interface Window {
    soApiUrl?: (path: string) => string;
    soApiCredentials?: () => RequestCredentials;
  }
}
