import { LaunchScreen } from './app/core/launch-screen';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

const launch = new LaunchScreen(document);

// Pages cannot send a frame-ancestors header. Never initialize account data inside a frame.
if (window.self === window.top) {
  void launch.revealWhen(bootstrapApplication(App, appConfig).then((app) => app.whenStable()));
} else {
  const message = document.createElement('p');
  message.textContent = 'Open Recipebook in its own tab.';
  document.querySelector('app-root')?.replaceWith(message);
  launch.dismiss();
}
