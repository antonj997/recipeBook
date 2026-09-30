import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Pages cannot send a frame-ancestors header. Never initialize account data inside a frame.
if (window.self === window.top) {
  bootstrapApplication(App, appConfig).catch(() => console.error('Recipebook could not start.'));
} else {
  const message = document.createElement('p');
  message.textContent = 'Open Recipebook in its own tab.';
  document.querySelector('app-root')?.replaceWith(message);
}
