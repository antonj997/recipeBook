import { LaunchScreen } from './app/core/launch-screen';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyMotionScale } from './app/core/motion';
import { runtimeConfig } from './app/core/runtime-config';
import { sharedStartUrl } from './app/core/share-target';

// Before the launch cover animates, so Slow motion (test) stretches it too.
applyMotionScale();
// A link or text shared to the installed app arrives as query parameters; open the import.
const shared = sharedStartUrl(new URL(location.href), runtimeConfig.pages);
if (shared) history.replaceState(null, '', shared);

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
